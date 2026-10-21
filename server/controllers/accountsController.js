import mongoose from "mongoose";

import AccountGroup from "../models/AccountGroup.js";
import Ledger from "../models/Ledger.js";
import Voucher from "../models/Voucher.js";
import { AccountingSettings } from "../models/AccountingMisc.js";
import { VOUCHER_TYPES } from "../config/accountingDefaults.js";
import {
  ensureAccountingSeed,
  getSettings,
  getLedgerBalances,
  createVoucher,
  updateVoucher,
  voidVoucher,
  logAction,
  nameKey,
  paiseFromRupees,
  rupeesFromPaise,
  fyOf,
} from "../utils/accounting.js";
import { parseIstDate, toIstDateString } from "../utils/recurringExpenses.js";
import { reconcileAll } from "../utils/accountingPosting.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const serverError = (res, label, error) => {
  console.error(`${label}:`, error);
  fail(res, 500, "Server Error");
};
const isDup = (e) => e?.code === 11000;
const validId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const validName = (v, max) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

// Runs before every accounts route: makes sure groups/ledgers/settings exist.
export const seedMiddleware = async (req, res, next) => {
  try {
    await ensureAccountingSeed();
    next();
  } catch (error) {
    serverError(res, "Accounting seed error", error);
  }
};

// ------------------------------------------------------------------ sync
// Brings the books in line with orders, returns, POS sales, expenses and
// the live stock valuation. Idempotent; the Accounts page calls it on open.
export const syncBooks = async (req, res) => {
  try {
    const result = await reconcileAll();

    if (result.busy) return res.status(202).json({ success: true, busy: true, message: "Another sync is already running." });

    res.status(200).json({
      success: true,
      result: {
        created: result.created,
        updated: result.updated,
        voided: result.voided,
        unchanged: result.unchanged,
        skipped: result.skipped,
        missingCost: result.missingCost,
        stockAdjustment: rupeesFromPaise(result.stock?.diffPaise || 0),
      },
    });
  } catch (error) {
    serverError(res, "Sync books", error);
  }
};

// ------------------------------------------------------------- settings
const shapeSettings = (s) => ({
  booksStartDate: toIstDateString(s.booksStartDate),
  lockedThrough: s.lockedThrough ? toIstDateString(s.lockedThrough) : null,
  currentFy: fyOf(new Date()),
});

export const getAccountingSettings = async (req, res) => {
  try {
    res.status(200).json({ success: true, settings: shapeSettings(await getSettings()) });
  } catch (error) {
    serverError(res, "Get accounting settings", error);
  }
};

export const updateAccountingSettings = async (req, res) => {
  try {
    const current = await getSettings();
    const update = {};
    const today = toIstDateString(new Date());
    const { lockedThrough, booksStartDate } = req.body;

    if (booksStartDate !== undefined) {
      const d = parseIstDate(booksStartDate);
      if (!d) return fail(res, 400, "Books start date must be a real date (YYYY-MM-DD).");
      if (toIstDateString(d) > today) return fail(res, 400, "Books start date cannot be in the future.");
      if (await Voucher.exists({ voided: false })) {
        return fail(res, 400, "The books start date cannot be changed once vouchers exist.");
      }
      update.booksStartDate = d;
    }

    if (lockedThrough !== undefined) {
      if (lockedThrough === null) {
        update.lockedThrough = null;
      } else {
        const d = parseIstDate(lockedThrough);
        if (!d) return fail(res, 400, "Lock date must be a real date (YYYY-MM-DD) or null.");
        const start = toIstDateString(update.booksStartDate || current.booksStartDate);
        if (toIstDateString(d) < start) return fail(res, 400, "Lock date cannot be before the books start date.");
        if (toIstDateString(d) > today) return fail(res, 400, "Lock date cannot be in the future.");
        update.lockedThrough = d;
      }
    }

    if (Object.keys(update).length === 0) return fail(res, 400, "Nothing to update.");

    const settings = await AccountingSettings.findOneAndUpdate({ key: "main" }, { $set: update }, { returnDocument: "after" }).lean();
    await logAction("update", "settings", "main", req.user._id, {
      previous: { booksStartDate: current.booksStartDate, lockedThrough: current.lockedThrough },
    });

    res.status(200).json({ success: true, settings: shapeSettings(settings) });
  } catch (error) {
    serverError(res, "Update accounting settings", error);
  }
};

// --------------------------------------------------------------- groups
export const getGroups = async (req, res) => {
  try {
    const groups = await AccountGroup.find().sort({ createdAt: 1, _id: 1 }).lean();
    res.status(200).json({ success: true, groups });
  } catch (error) {
    serverError(res, "Get groups", error);
  }
};

export const createGroup = async (req, res) => {
  try {
    const { name, parent } = req.body;
    if (!validName(name, 80)) return fail(res, 400, "Group name is required (up to 80 characters).");
    if (!validId(parent)) return fail(res, 400, "Choose a parent group.");

    const parentGroup = await AccountGroup.findById(parent).lean();
    if (!parentGroup) return fail(res, 400, "Parent group not found.");

    const group = await AccountGroup.create({
      name: name.trim(),
      nameKey: nameKey(name),
      parent: parentGroup._id,
      nature: parentGroup.nature,
      section: parentGroup.section,
    });

    await logAction("create", "group", group._id, req.user._id, { name: group.name });
    res.status(201).json({ success: true, group });
  } catch (error) {
    if (isDup(error)) return fail(res, 400, "A group with this name already exists.");
    serverError(res, "Create group", error);
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { name } = req.body;
    if (!validName(name, 80)) return fail(res, 400, "Group name is required (up to 80 characters).");

    const existing = await AccountGroup.findById(req.params.id).lean();
    if (!existing) return fail(res, 404, "Group not found.");
    if (existing.isPredefined) return fail(res, 400, "This is a standard Tally group and cannot be renamed.");

    const group = await AccountGroup.findByIdAndUpdate(
      req.params.id,
      { $set: { name: name.trim(), nameKey: nameKey(name) } },
      { returnDocument: "after" },
    );

    await logAction("update", "group", group._id, req.user._id, { previous: existing.name });
    res.status(200).json({ success: true, group });
  } catch (error) {
    if (isDup(error)) return fail(res, 400, "A group with this name already exists.");
    serverError(res, "Update group", error);
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const group = await AccountGroup.findById(req.params.id).lean();
    if (!group) return fail(res, 404, "Group not found.");
    if (group.isPredefined) return fail(res, 400, "This is a standard Tally group and cannot be deleted.");

    if ((await AccountGroup.exists({ parent: group._id })) || (await Ledger.exists({ group: group._id }))) {
      return fail(res, 400, "Move or delete the sub-groups and ledgers inside this group first.");
    }

    await AccountGroup.deleteOne({ _id: group._id });
    await logAction("delete", "group", group._id, req.user._id, { name: group.name });
    res.status(200).json({ success: true });
  } catch (error) {
    serverError(res, "Delete group", error);
  }
};

// -------------------------------------------------------------- ledgers
const shapeLedgerRow = (row, groupById) => ({
  _id: row.ledger._id,
  name: row.ledger.name,
  group: groupById.get(String(row.ledger.group)) || null,
  systemKey: row.ledger.systemKey || null,
  isActive: row.ledger.isActive,
  notes: row.ledger.notes,
  opening: rupeesFromPaise(row.openingPaise),
  openingSide: row.openingSide,
  debits: rupeesFromPaise(row.debitsPaise),
  credits: rupeesFromPaise(row.creditsPaise),
  closing: rupeesFromPaise(row.closingPaise),
  closingSide: row.closingSide,
});

export const getLedgers = async (req, res) => {
  try {
    let asOf = new Date();
    if (req.query.asOf !== undefined) {
      asOf = parseIstDate(req.query.asOf);
      if (!asOf) return fail(res, 400, "asOf must be a real date (YYYY-MM-DD).");
    }

    const [rows, groups] = await Promise.all([getLedgerBalances(asOf), AccountGroup.find().lean()]);
    const groupById = new Map(groups.map((g) => [String(g._id), { _id: g._id, name: g.name, nature: g.nature, section: g.section }]));

    const ledgers = rows.map((r) => shapeLedgerRow(r, groupById)).sort((a, b) => a.name.localeCompare(b.name));

    // Tally shows this as "Difference in opening balances" -- opening Dr and Cr should match.
    const openingDr = rows.filter((r) => r.openingSide === "Dr").reduce((s, r) => s + r.openingPaise, 0);
    const openingCr = rows.filter((r) => r.openingSide === "Cr").reduce((s, r) => s + r.openingPaise, 0);

    res.status(200).json({
      success: true,
      ledgers,
      openingDifference: rupeesFromPaise(openingDr - openingCr),
    });
  } catch (error) {
    serverError(res, "Get ledgers", error);
  }
};

const parseOpening = (body) => {
  const out = {};
  if (body.openingBalance !== undefined) {
    const paise = paiseFromRupees(body.openingBalance);
    if (paise === null) return { error: "Opening balance must be a number (0 or more) with at most 2 decimals." };
    out.openingPaise = paise;
  }
  if (body.openingSide !== undefined) {
    if (body.openingSide !== "Dr" && body.openingSide !== "Cr") return { error: "Opening side must be Dr or Cr." };
    out.openingSide = body.openingSide;
  }
  return { value: out };
};

export const createLedger = async (req, res) => {
  try {
    const { name, group, notes } = req.body;
    if (!validName(name, 100)) return fail(res, 400, "Ledger name is required (up to 100 characters).");
    if (!validId(group) || !(await AccountGroup.exists({ _id: group }))) return fail(res, 400, "Choose a group.");
    if (notes !== undefined && (typeof notes !== "string" || notes.length > 300)) {
      return fail(res, 400, "Notes must be text up to 300 characters.");
    }

    const opening = parseOpening(req.body);
    if (opening.error) return fail(res, 400, opening.error);

    const ledger = await Ledger.create({
      name: name.trim(),
      nameKey: nameKey(name),
      group,
      notes: (notes || "").trim(),
      ...opening.value,
    });

    await logAction("create", "ledger", ledger._id, req.user._id, { name: ledger.name });
    res.status(201).json({ success: true, ledger });
  } catch (error) {
    if (isDup(error)) return fail(res, 400, "A ledger with this name already exists.");
    serverError(res, "Create ledger", error);
  }
};

export const updateLedger = async (req, res) => {
  try {
    const existing = await Ledger.findById(req.params.id).lean();
    if (!existing) return fail(res, 404, "Ledger not found.");

    const { name, group, notes, isActive } = req.body;
    const update = {};

    if (name !== undefined) {
      if (!validName(name, 100)) return fail(res, 400, "Ledger name is required (up to 100 characters).");
      update.name = name.trim();
      update.nameKey = nameKey(name);
    }

    if (group !== undefined) {
      if (existing.systemKey) return fail(res, 400, "This ledger is used by automatic posting and cannot change group.");
      if (!validId(group) || !(await AccountGroup.exists({ _id: group }))) return fail(res, 400, "Choose a group.");
      update.group = group;
    }

    if (notes !== undefined) {
      if (typeof notes !== "string" || notes.length > 300) return fail(res, 400, "Notes must be text up to 300 characters.");
      update.notes = notes.trim();
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") return fail(res, 400, "isActive must be true or false.");
      if (!isActive && existing.systemKey) return fail(res, 400, "This ledger is used by automatic posting and cannot be deactivated.");
      update.isActive = isActive;
    }

    const opening = parseOpening(req.body);
    if (opening.error) return fail(res, 400, opening.error);
    Object.assign(update, opening.value);

    if (Object.keys(update).length === 0) return fail(res, 400, "Nothing to update.");

    const ledger = await Ledger.findByIdAndUpdate(req.params.id, { $set: update }, { returnDocument: "after", runValidators: true });

    await logAction("update", "ledger", ledger._id, req.user._id, {
      previous: { name: existing.name, group: existing.group, openingPaise: existing.openingPaise, openingSide: existing.openingSide, isActive: existing.isActive },
    });
    res.status(200).json({ success: true, ledger });
  } catch (error) {
    if (isDup(error)) return fail(res, 400, "A ledger with this name already exists.");
    serverError(res, "Update ledger", error);
  }
};

export const deleteLedger = async (req, res) => {
  try {
    const ledger = await Ledger.findById(req.params.id).lean();
    if (!ledger) return fail(res, 404, "Ledger not found.");
    if (ledger.systemKey) return fail(res, 400, "This ledger is used by automatic posting and cannot be deleted.");
    if (await Voucher.exists({ "entries.ledger": ledger._id })) {
      return fail(res, 400, "This ledger has vouchers. Deactivate it instead of deleting.");
    }

    await Ledger.deleteOne({ _id: ledger._id });
    await logAction("delete", "ledger", ledger._id, req.user._id, { name: ledger.name });
    res.status(200).json({ success: true });
  } catch (error) {
    serverError(res, "Delete ledger", error);
  }
};

// ------------------------------------------------------------- vouchers
const shapeVoucher = (v) => ({
  _id: v._id,
  number: v.number,
  type: v.type,
  date: toIstDateString(v.date),
  narration: v.narration,
  total: rupeesFromPaise(v.totalPaise),
  entries: v.entries.map((e) => ({
    ledger: e.ledger && e.ledger._id ? { _id: e.ledger._id, name: e.ledger.name } : { _id: e.ledger, name: "(deleted)" },
    side: e.side,
    amount: rupeesFromPaise(e.amountPaise),
  })),
  source: v.source?.kind ? { kind: v.source.kind, id: v.source.id } : null,
  createdAt: v.createdAt,
});

const LIST_LIMIT = 500;

export const getVouchers = async (req, res) => {
  try {
    const { type, from, to, ledger } = req.query;
    const filter = { voided: false };

    if (type !== undefined) {
      if (typeof type !== "string" || !Object.keys(VOUCHER_TYPES).includes(type)) return fail(res, 400, "Unknown voucher type.");
      filter.type = type;
    }

    if (from !== undefined || to !== undefined) {
      filter.date = {};
      if (from !== undefined) {
        const f = parseIstDate(from);
        if (!f) return fail(res, 400, "From must be a real date (YYYY-MM-DD).");
        filter.date.$gte = f;
      }
      if (to !== undefined) {
        const t = parseIstDate(to);
        if (!t) return fail(res, 400, "To must be a real date (YYYY-MM-DD).");
        filter.date.$lte = new Date(t.getTime() + 12 * 60 * 60 * 1000 - 1);
      }
    }

    if (ledger !== undefined) {
      if (!validId(ledger)) return fail(res, 400, "Unknown ledger.");
      filter["entries.ledger"] = new mongoose.Types.ObjectId(ledger);
    }

    const vouchers = await Voucher.find(filter)
      .sort({ date: -1, seq: -1, _id: -1 })
      .limit(LIST_LIMIT)
      .populate("entries.ledger", "name")
      .lean();

    res.status(200).json({ success: true, vouchers: vouchers.map(shapeVoucher) });
  } catch (error) {
    serverError(res, "Get vouchers", error);
  }
};

export const getVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ _id: req.params.id, voided: false }).populate("entries.ledger", "name").lean();
    if (!voucher) return fail(res, 404, "Voucher not found.");

    res.status(200).json({ success: true, voucher: shapeVoucher(voucher) });
  } catch (error) {
    serverError(res, "Get voucher", error);
  }
};

export const postVoucher = async (req, res) => {
  try {
    const result = await createVoucher(req.body, { userId: req.user._id });
    if (result.error) return fail(res, result.status || 400, result.error);

    const voucher = await Voucher.findById(result.voucher._id).populate("entries.ledger", "name").lean();
    res.status(201).json({ success: true, voucher: shapeVoucher(voucher) });
  } catch (error) {
    serverError(res, "Create voucher", error);
  }
};

export const putVoucher = async (req, res) => {
  try {
    const result = await updateVoucher(req.params.id, req.body, { userId: req.user._id });
    if (result.error) return fail(res, result.status || 400, result.error);

    const voucher = await Voucher.findById(result.voucher._id).populate("entries.ledger", "name").lean();
    res.status(200).json({ success: true, voucher: shapeVoucher(voucher) });
  } catch (error) {
    serverError(res, "Update voucher", error);
  }
};

export const removeVoucher = async (req, res) => {
  try {
    const result = await voidVoucher(req.params.id, { userId: req.user._id });
    if (result.error) return fail(res, result.status || 400, result.error);

    res.status(200).json({ success: true });
  } catch (error) {
    serverError(res, "Void voucher", error);
  }
};
