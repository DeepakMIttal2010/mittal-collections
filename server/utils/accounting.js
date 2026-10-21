import mongoose from "mongoose";

import AccountGroup from "../models/AccountGroup.js";
import Ledger from "../models/Ledger.js";
import Voucher from "../models/Voucher.js";
import { VoucherCounter, AccountingSettings, AccountingLog } from "../models/AccountingMisc.js";
import {
  PRIMARY_GROUPS,
  SUB_GROUPS,
  SEED_LEDGERS,
  VOUCHER_TYPES,
  DEFAULT_BOOKS_START,
  SEED_VERSION,
} from "../config/accountingDefaults.js";
import { istParts, parseIstDate, toIstDateString } from "./recurringExpenses.js";

// ---------------------------------------------------------------- money
// Everything is integer paise. Rupee inputs are validated to <= 2 decimals
// and converted once, at the edge.
const MAX_PAISE = 10_000_000_000; // Rs 10 crore per line -- a typo guard

export const paiseFromRupees = (rupees) => {
  if (typeof rupees !== "number" || !Number.isFinite(rupees)) return null;

  const paise = Math.round(rupees * 100);
  if (Math.abs(rupees * 100 - paise) > 1e-6) return null; // 3+ decimals
  if (paise < 0 || paise > MAX_PAISE) return null;

  return paise;
};

export const rupeesFromPaise = (paise) => paise / 100;

export const nameKey = (name) => name.trim().toLowerCase();

// ---------------------------------------------------------------- dates
// Financial year (India: 1 Apr - 31 Mar) of a date, e.g. "2026-27".
export const fyOf = (date) => {
  const { y, m } = istParts(date);
  const start = m >= 4 ? y : y - 1;

  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

// ----------------------------------------------------------------- seed
const isDup = (error) => error?.code === 11000;

// Idempotent: creates whatever is missing and never touches anything that
// exists (so an admin's renames/edits survive). Settings are created LAST,
// so a crash half-way leaves "not seeded" and the next call finishes the job.
export const ensureAccountingSeed = async () => {
  const current = await AccountingSettings.findOne({ key: "main" }).select("seedVersion").lean();
  if (current && (current.seedVersion || 1) >= SEED_VERSION) return;

  const upsert = async (Model, filter, doc) => {
    try {
      await Model.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
    } catch (error) {
      if (!isDup(error)) throw error;
    }
  };

  for (const g of PRIMARY_GROUPS) {
    await upsert(AccountGroup, { nameKey: nameKey(g.name) }, {
      name: g.name,
      nameKey: nameKey(g.name),
      parent: null,
      nature: g.nature,
      section: g.section,
      isPredefined: true,
    });
  }

  for (const g of SUB_GROUPS) {
    const parent = await AccountGroup.findOne({ nameKey: nameKey(g.parent) });
    await upsert(AccountGroup, { nameKey: nameKey(g.name) }, {
      name: g.name,
      nameKey: nameKey(g.name),
      parent: parent._id,
      nature: parent.nature,
      section: parent.section,
      isPredefined: !!g.predefined,
    });
  }

  for (const l of SEED_LEDGERS) {
    const group = await AccountGroup.findOne({ nameKey: nameKey(l.group) });

    // A ledger created by an older seed under this name (before it had a
    // system key) adopts the key instead of being duplicated.
    if (l.systemKey && !(await Ledger.exists({ systemKey: l.systemKey }))) {
      await Ledger.updateOne(
        { nameKey: nameKey(l.name), systemKey: { $exists: false } },
        { $set: { systemKey: l.systemKey } },
      ).catch((error) => {
        if (!isDup(error)) throw error;
      });
    }

    await upsert(Ledger, l.systemKey ? { systemKey: l.systemKey } : { nameKey: nameKey(l.name) }, {
      name: l.name,
      nameKey: nameKey(l.name),
      group: group._id,
      ...(l.systemKey ? { systemKey: l.systemKey } : {}),
    });
  }

  await upsert(AccountingSettings, { key: "main" }, {
    key: "main",
    booksStartDate: parseIstDate(DEFAULT_BOOKS_START),
  });

  await AccountingSettings.updateOne({ key: "main" }, { $set: { seedVersion: SEED_VERSION } });
};

export const getSettings = async () => {
  await ensureAccountingSeed();
  return AccountingSettings.findOne({ key: "main" }).lean();
};

// --------------------------------------------------------------- audit
export const logAction = (action, entity, entityId, by, details) =>
  AccountingLog.create({ action, entity, entityId: String(entityId), by, details }).catch((error) =>
    console.error("Accounting log failed:", error),
  );

// ------------------------------------------------------------- vouchers
const MAX_LINES = 50;

// Returns { error } or { value } -- value is fully validated and typed;
// nothing from the request body reaches the database unchecked.
export const validateVoucherInput = async (input, settings) => {
  const { type, date: rawDate, narration, entries } = input || {};

  if (!Object.keys(VOUCHER_TYPES).includes(type)) return { error: "Choose a valid voucher type." };

  const date = parseIstDate(rawDate);
  if (!date) return { error: "Date must be a real date in YYYY-MM-DD format." };

  const day = toIstDateString(date);
  if (day < toIstDateString(settings.booksStartDate)) {
    return { error: `Date cannot be before the books start date (${toIstDateString(settings.booksStartDate)}).` };
  }
  if (settings.lockedThrough && day <= toIstDateString(settings.lockedThrough)) {
    return { error: `The period up to ${toIstDateString(settings.lockedThrough)} is locked.` };
  }
  if (date.getTime() > Date.now() + 366 * 24 * 60 * 60 * 1000) {
    return { error: "Date cannot be more than a year in the future." };
  }

  if (narration !== undefined && (typeof narration !== "string" || narration.length > 500)) {
    return { error: "Narration must be text up to 500 characters." };
  }

  if (!Array.isArray(entries) || entries.length < 2 || entries.length > MAX_LINES) {
    return { error: `A voucher needs between 2 and ${MAX_LINES} lines.` };
  }

  const lines = [];
  for (const [i, e] of entries.entries()) {
    if (!e || typeof e.ledger !== "string" || !mongoose.isValidObjectId(e.ledger)) {
      return { error: `Line ${i + 1}: choose a ledger.` };
    }
    if (e.side !== "Dr" && e.side !== "Cr") return { error: `Line ${i + 1}: side must be Dr or Cr.` };

    const amountPaise = paiseFromRupees(e.amount);
    if (!amountPaise || amountPaise < 1) {
      return { error: `Line ${i + 1}: amount must be greater than 0, with at most 2 decimals.` };
    }

    lines.push({ ledger: e.ledger, side: e.side, amountPaise });
  }

  const ledgerIds = [...new Set(lines.map((l) => l.ledger))];
  const found = await Ledger.find({ _id: { $in: ledgerIds } }).select("isActive").lean();

  if (found.length !== ledgerIds.length) return { error: "One of the ledgers does not exist." };
  if (found.some((l) => !l.isActive)) return { error: "One of the ledgers is inactive." };

  const dr = lines.filter((l) => l.side === "Dr").reduce((s, l) => s + l.amountPaise, 0);
  const cr = lines.filter((l) => l.side === "Cr").reduce((s, l) => s + l.amountPaise, 0);

  if (dr !== cr) {
    return {
      error: `Debit total (₹${rupeesFromPaise(dr)}) must equal credit total (₹${rupeesFromPaise(cr)}).`,
    };
  }

  return {
    value: {
      type,
      date,
      narration: (narration || "").trim(),
      entries: lines,
      totalPaise: dr,
    },
  };
};

const nextSeq = async (counterId) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const counter = await VoucherCounter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      return counter.seq;
    } catch (error) {
      // Two first-ever requests racing to create the same counter document.
      if (!isDup(error) || attempt === 2) throw error;
    }
  }
  return null;
};

// Stores an already-validated voucher value (shared by hand-entered and
// automatic vouchers): atomic numbering, then the insert.
export const insertVoucher = async (value, { userId, source } = {}) => {
  const fy = fyOf(value.date);
  const prefix = VOUCHER_TYPES[value.type];
  const seq = await nextSeq(`${prefix}/${fy}`);

  let voucher;
  try {
    voucher = await Voucher.create({
      ...value,
      fy,
      seq,
      number: `${prefix}/${fy}/${String(seq).padStart(4, "0")}`,
      ...(source ? { source } : {}),
      createdBy: userId,
    });
  } catch (error) {
    // The unique {source.kind, source.id} index: this source document
    // already has a live voucher (e.g. an order posted twice).
    if (isDup(error) && source) {
      return { status: 409, duplicate: true, error: "A voucher already exists for this source." };
    }
    throw error;
  }

  await logAction("create", "voucher", voucher._id, userId, { number: voucher.number });

  return { voucher };
};

export const createVoucher = async (input, { userId, source } = {}) => {
  const settings = await getSettings();
  const parsed = await validateVoucherInput(input, settings);
  if (parsed.error) return parsed;

  return insertVoucher(parsed.value, { userId, source });
};

export const updateVoucher = async (id, input, { userId } = {}) => {
  const settings = await getSettings();
  const existing = await Voucher.findOne({ _id: id, voided: false }).lean();

  if (!existing) return { status: 404, error: "Voucher not found." };
  if (existing.source?.kind) {
    return { status: 400, error: "This voucher was created automatically and cannot be edited by hand." };
  }
  if (settings.lockedThrough && toIstDateString(existing.date) <= toIstDateString(settings.lockedThrough)) {
    return { status: 400, error: "This voucher is in a locked period." };
  }

  const parsed = await validateVoucherInput({ ...input, type: existing.type }, settings);
  if (parsed.error) return parsed;

  const { value } = parsed;
  if (fyOf(value.date) !== existing.fy) {
    return { error: `Date must stay within the same financial year (${existing.fy}).` };
  }

  const voucher = await Voucher.findOneAndUpdate(
    { _id: id, voided: false },
    { $set: { date: value.date, narration: value.narration, entries: value.entries, totalPaise: value.totalPaise } },
    { returnDocument: "after", runValidators: true },
  );

  await logAction("update", "voucher", id, userId, {
    number: existing.number,
    previous: { date: existing.date, narration: existing.narration, entries: existing.entries, totalPaise: existing.totalPaise },
  });

  return { voucher };
};

export const voidVoucher = async (id, { userId } = {}) => {
  const settings = await getSettings();
  const existing = await Voucher.findOne({ _id: id, voided: false }).lean();

  if (!existing) return { status: 404, error: "Voucher not found." };
  // An automatic voucher mirrors its order/expense/sale: deleting it by hand
  // would just be undone by the next sync, so change the source instead.
  if (existing.source?.kind) {
    return { status: 400, error: "This voucher was created automatically. Change or cancel the original order, sale or expense instead." };
  }
  if (settings.lockedThrough && toIstDateString(existing.date) <= toIstDateString(settings.lockedThrough)) {
    return { status: 400, error: "This voucher is in a locked period." };
  }

  await Voucher.updateOne({ _id: id, voided: false }, { $set: { voided: true, voidedAt: new Date() } });
  await logAction("void", "voucher", id, userId, { number: existing.number });

  return { ok: true };
};

// -------------------------------------------------------------- balances
// Closing balance of every ledger as on `asOf` (a Date; default now):
// opening (on the books-start date) + all non-voided voucher lines up to
// the end of that IST day. Returned in paise.
export const getLedgerBalances = async (asOf = new Date()) => {
  const dayEnd = new Date(`${toIstDateString(asOf)}T23:59:59.999+05:30`);

  const [ledgers, totals] = await Promise.all([
    Ledger.find().lean(),
    Voucher.aggregate([
      { $match: { voided: false, date: { $lte: dayEnd } } },
      { $unwind: "$entries" },
      { $group: { _id: { ledger: "$entries.ledger", side: "$entries.side" }, total: { $sum: "$entries.amountPaise" } } },
    ]),
  ]);

  const moved = new Map();
  for (const t of totals) {
    const key = String(t._id.ledger);
    const row = moved.get(key) || { dr: 0, cr: 0 };
    if (t._id.side === "Dr") row.dr += t.total;
    else row.cr += t.total;
    moved.set(key, row);
  }

  return ledgers.map((l) => {
    const m = moved.get(String(l._id)) || { dr: 0, cr: 0 };
    const opening = l.openingSide === "Dr" ? l.openingPaise : -l.openingPaise;
    const net = opening + m.dr - m.cr;

    return {
      ledger: l,
      openingPaise: l.openingPaise,
      openingSide: l.openingSide,
      debitsPaise: m.dr,
      creditsPaise: m.cr,
      closingPaise: Math.abs(net),
      closingSide: net >= 0 ? "Dr" : "Cr",
      netPaise: net, // + = Dr, - = Cr
    };
  });
};

// ------------------------------------------------- automatic vouchers
// Used by utils/accountingPosting.js. Amounts are already integer paise and
// ledgers already resolved, so none of the hand-entry parsing applies, but
// the same invariants do: >= 2 lines, positive integer paise, Dr = Cr.

// systemKey -> ledger _id (e.g. "razorpay", "sales-online").
export const getSystemLedgerMap = async () => {
  const ledgers = await Ledger.find({ systemKey: { $type: "string" } }).select("systemKey").lean();
  return new Map(ledgers.map((l) => [l.systemKey, l._id]));
};

// Posting day for an automatic voucher: the preferred date, or -- when
// that period is locked -- the first open day after the lock. null when it
// is before the books start (such a document cannot be posted at all).
export const resolvePostingDate = (preferred, settings) => {
  const day = toIstDateString(preferred);

  if (day < toIstDateString(settings.booksStartDate)) return null;

  if (settings.lockedThrough && day <= toIstDateString(settings.lockedThrough)) {
    return parseIstDate(toIstDateString(new Date(settings.lockedThrough.getTime() + 24 * 60 * 60 * 1000)));
  }

  return preferred;
};

export const buildAutoValue = ({ type, date, narration, entries }) => {
  if (!Object.keys(VOUCHER_TYPES).includes(type)) throw new Error(`Unknown voucher type ${type}`);
  if (!Array.isArray(entries) || entries.length < 2) throw new Error("An automatic voucher needs two lines");

  let dr = 0;
  let cr = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.amountPaise) || e.amountPaise < 1) throw new Error("Automatic voucher line must be positive whole paise");
    if (e.side === "Dr") dr += e.amountPaise;
    else if (e.side === "Cr") cr += e.amountPaise;
    else throw new Error("Automatic voucher line side must be Dr or Cr");
  }
  if (dr !== cr || dr < 1) throw new Error(`Automatic voucher does not balance (Dr ${dr} vs Cr ${cr})`);

  return { type, date, narration: (narration || "").slice(0, 500), entries, totalPaise: dr };
};

const isLockedDay = (date, settings) =>
  !!settings.lockedThrough && toIstDateString(date) <= toIstDateString(settings.lockedThrough);

export const createAutoVoucher = async (desired, source, settings) => {
  const date = resolvePostingDate(desired.date, settings);
  if (!date) return { skipped: "before-books-start" };

  const result = await insertVoucher(buildAutoValue({ ...desired, date }), { source });
  return result.duplicate ? { duplicate: true } : { created: true, voucher: result.voucher };
};

// Brings an existing automatic voucher in line with new figures: edited in
// place (same number) when the financial year is unchanged, otherwise the
// caller voids it and creates a fresh one.
export const rebuildAutoVoucher = async (existing, desired, hash, settings) => {
  if (isLockedDay(existing.date, settings)) return { skipped: "locked" };

  const date = resolvePostingDate(desired.date, settings);
  if (!date) return { skipped: "before-books-start" };
  if (fyOf(date) !== existing.fy) return { recreate: true };

  const value = buildAutoValue({ ...desired, type: existing.type, date });

  await Voucher.updateOne(
    { _id: existing._id, voided: false },
    { $set: { date: value.date, narration: value.narration, entries: value.entries, totalPaise: value.totalPaise, "source.hash": hash } },
  );
  await logAction("auto-update", "voucher", existing._id, undefined, {
    number: existing.number,
    previous: { date: existing.date, entries: existing.entries, totalPaise: existing.totalPaise },
  });

  return { updated: true };
};

export const voidAutoVoucher = async (existing, settings) => {
  if (isLockedDay(existing.date, settings)) return { skipped: "locked" };

  await Voucher.updateOne({ _id: existing._id, voided: false }, { $set: { voided: true, voidedAt: new Date() } });
  await logAction("auto-void", "voucher", existing._id, undefined, { number: existing.number });

  return { voided: true };
};
