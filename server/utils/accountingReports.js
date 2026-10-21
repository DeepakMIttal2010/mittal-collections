import mongoose from "mongoose";

import AccountGroup from "../models/AccountGroup.js";
import Ledger from "../models/Ledger.js";
import Voucher from "../models/Voucher.js";
import { getSettings, rupeesFromPaise } from "./accounting.js";
import { VOUCHER_TYPES } from "../config/accountingDefaults.js";
import { toIstDateString } from "./recurringExpenses.js";

// Reports are computed from ledgers + non-voided vouchers only, in integer
// paise, and converted to rupees at the very edge (`r()`), so every total
// is exact and "Dr = Cr" checks can be strict.
//
// Sign convention everywhere: net > 0 means Debit, net < 0 means Credit.

const r = rupeesFromPaise;
const dayStart = (d) => new Date(`${toIstDateString(d)}T00:00:00+05:30`);
const dayEnd = (d) => new Date(`${toIstDateString(d)}T23:59:59.999+05:30`);

// ------------------------------------------------------ ledger activity
// For every ledger: its balance at the START of `from` (opening + earlier
// vouchers) and its debits/credits within [from, to]. With from = null the
// whole history up to `to` counts as activity on top of the opening balance.
export const getLedgerActivity = async (from, to) => {
  const start = from ? dayStart(from) : null;
  const end = dayEnd(to);

  const [ledgers, groups, totals] = await Promise.all([
    Ledger.find().lean(),
    AccountGroup.find().sort({ createdAt: 1, _id: 1 }).lean(),
    Voucher.aggregate([
      { $match: { voided: false, date: { $lte: end } } },
      { $unwind: "$entries" },
      {
        $group: {
          _id: {
            ledger: "$entries.ledger",
            side: "$entries.side",
            before: start ? { $lt: ["$date", start] } : { $literal: false },
          },
          total: { $sum: "$entries.amountPaise" },
        },
      },
    ]),
  ]);

  const acc = new Map();
  for (const t of totals) {
    const key = String(t._id.ledger);
    const row = acc.get(key) || { beforeDr: 0, beforeCr: 0, dr: 0, cr: 0 };
    const isDr = t._id.side === "Dr";
    const field = t._id.before ? (isDr ? "beforeDr" : "beforeCr") : isDr ? "dr" : "cr";
    row[field] += t.total;
    acc.set(key, row);
  }

  const groupById = new Map(groups.map((g) => [String(g._id), g]));

  const rows = ledgers.map((l) => {
    const m = acc.get(String(l._id)) || { beforeDr: 0, beforeCr: 0, dr: 0, cr: 0 };
    const opening = (l.openingSide === "Dr" ? l.openingPaise : -l.openingPaise) + m.beforeDr - m.beforeCr;

    return {
      ledger: l,
      group: groupById.get(String(l.group)),
      openingNet: opening,
      dr: m.dr,
      cr: m.cr,
      closingNet: opening + m.dr - m.cr,
    };
  });

  return { rows, groups, groupById };
};

const childrenOf = (groups) => {
  const byParent = new Map();
  for (const g of groups) {
    const key = g.parent ? String(g.parent) : "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  return byParent;
};

// ---------------------------------------------------- hierarchical rows
// Builds Tally-style rows (group header, then its sub-groups and ledgers,
// indented) for the groups in `rootGroups`. `amountOf(row)` gives a ledger's
// signed paise for this report and `side` flips Cr-nature sections to
// positive. Zero ledgers are omitted; a group is kept only if something
// inside it is non-zero.
const buildRows = (rootGroups, byParent, ledgersByGroup, amountOf) => {
  const rows = [];

  const walk = (group, depth) => {
    const start = rows.length;
    rows.push({ kind: "group", id: String(group._id), name: group.name, depth, amount: 0 });
    let total = 0;

    for (const l of ledgersByGroup.get(String(group._id)) || []) {
      const amount = amountOf(l);
      if (amount === 0) continue;
      rows.push({ kind: "ledger", id: String(l.ledger._id), name: l.ledger.name, depth: depth + 1, amount: r(amount) });
      total += amount;
    }

    for (const child of byParent.get(String(group._id)) || []) total += walk(child, depth + 1);

    if (total === 0 && rows.length === start + 1) {
      rows.pop(); // empty group
      return 0;
    }

    rows[start].amount = r(total);
    return total;
  };

  let grand = 0;
  for (const g of rootGroups) grand += walk(g, 0);

  return { rows, totalPaise: grand };
};

const indexLedgers = (rows) => {
  const by = new Map();
  for (const row of rows) {
    const key = String(row.ledger.group);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(row);
  }
  for (const list of by.values()) list.sort((a, b) => a.ledger.name.localeCompare(b.ledger.name));
  return by;
};

// =========================================================== trial balance
export const trialBalance = async (asOf) => {
  const { rows, groups } = await getLedgerActivity(null, asOf);
  const byParent = childrenOf(groups);
  const ledgersByGroup = indexLedgers(rows);

  // Net Dr positive for every group; the column it lands in follows its sign.
  const { rows: tree } = buildRows(byParent.get("root") || [], byParent, ledgersByGroup, (l) => l.closingNet);

  const debit = rows.filter((x) => x.closingNet > 0).reduce((s, x) => s + x.closingNet, 0);
  const credit = rows.filter((x) => x.closingNet < 0).reduce((s, x) => s - x.closingNet, 0);

  return {
    asOf: toIstDateString(asOf),
    rows: tree.map((x) => ({
      ...x,
      debit: x.amount > 0 ? x.amount : 0,
      credit: x.amount < 0 ? -x.amount : 0,
      amount: undefined,
    })),
    totalDebit: r(debit),
    totalCredit: r(credit),
    difference: r(debit - credit),
    balanced: debit === credit,
  };
};

// ============================================================ group summary
// One level of the chart at a time (Tally's drill-down): the children of
// `groupId` (or the primary groups), each with opening / debit / credit /
// closing for the period.
export const groupSummary = async (groupId, from, to) => {
  const { rows, groups, groupById } = await getLedgerActivity(from, to);
  const byParent = childrenOf(groups);
  const ledgersByGroup = indexLedgers(rows);

  const subtree = (group) => {
    const own = ledgersByGroup.get(String(group._id)) || [];
    const sum = own.reduce(
      (a, x) => ({ opening: a.opening + x.openingNet, dr: a.dr + x.dr, cr: a.cr + x.cr, closing: a.closing + x.closingNet }),
      { opening: 0, dr: 0, cr: 0, closing: 0 },
    );
    for (const child of byParent.get(String(group._id)) || []) {
      const c = subtree(child);
      sum.opening += c.opening;
      sum.dr += c.dr;
      sum.cr += c.cr;
      sum.closing += c.closing;
    }
    return sum;
  };

  const shape = (kind, id, name, s) => ({
    kind,
    id: String(id),
    name,
    opening: r(Math.abs(s.opening)),
    openingSide: s.opening >= 0 ? "Dr" : "Cr",
    debit: r(s.dr),
    credit: r(s.cr),
    closing: r(Math.abs(s.closing)),
    closingSide: s.closing >= 0 ? "Dr" : "Cr",
    _closing: s.closing,
  });

  const group = groupId ? groupById.get(String(groupId)) : null;
  if (groupId && !group) return null;

  const children = (byParent.get(group ? String(group._id) : "root") || []).map((g) => shape("group", g._id, g.name, subtree(g)));
  const ledgerItems = group
    ? (ledgersByGroup.get(String(group._id)) || []).map((x) =>
        shape("ledger", x.ledger._id, x.ledger.name, { opening: x.openingNet, dr: x.dr, cr: x.cr, closing: x.closingNet }),
      )
    : [];

  const items = [...children, ...ledgerItems];
  const breadcrumb = [];
  for (let g = group; g; g = g.parent ? groupById.get(String(g.parent)) : null) breadcrumb.unshift({ id: String(g._id), name: g.name });

  const totals = items.reduce((a, x) => ({ dr: a.dr + Math.round(x.debit * 100), cr: a.cr + Math.round(x.credit * 100), net: a.net + x._closing }), { dr: 0, cr: 0, net: 0 });

  return {
    from: from ? toIstDateString(from) : null,
    to: toIstDateString(to),
    group: group ? { id: String(group._id), name: group.name } : null,
    breadcrumb,
    items: items.map(({ _closing, ...rest }) => rest),
    totals: { debit: r(totals.dr), credit: r(totals.cr), closing: r(Math.abs(totals.net)), closingSide: totals.net >= 0 ? "Dr" : "Cr" },
  };
};

// ========================================================= ledger statement
export const ledgerStatement = async (ledgerId, from, to) => {
  // Re-validated and rebuilt as a real ObjectId right at the query (the route
  // already checks the id; this keeps the guarantee next to the sink).
  if (typeof ledgerId !== "string" || !mongoose.isValidObjectId(ledgerId)) return null;
  const safeId = new mongoose.Types.ObjectId(ledgerId);

  const ledger = await Ledger.findById(safeId).populate("group", "name").lean();
  if (!ledger) return null;

  const { rows } = await getLedgerActivity(from, to);
  const row = rows.find((x) => String(x.ledger._id) === String(ledgerId));

  const vouchers = await Voucher.find({
    voided: false,
    "entries.ledger": ledger._id,
    date: { $gte: dayStart(from), $lte: dayEnd(to) },
  })
    .sort({ date: 1, seq: 1, _id: 1 })
    .populate("entries.ledger", "name")
    .lean();

  let running = row.openingNet;
  const lines = vouchers.map((v) => {
    const mine = v.entries.filter((e) => String(e.ledger._id) === String(ledger._id));
    const dr = mine.filter((e) => e.side === "Dr").reduce((s, e) => s + e.amountPaise, 0);
    const cr = mine.filter((e) => e.side === "Cr").reduce((s, e) => s + e.amountPaise, 0);
    running += dr - cr;

    const others = [...new Set(v.entries.filter((e) => String(e.ledger._id) !== String(ledger._id)).map((e) => e.ledger.name))];

    return {
      voucherId: String(v._id),
      date: toIstDateString(v.date),
      number: v.number,
      type: v.type,
      particulars: others.length > 2 ? "(as per details)" : others.join(", "),
      narration: v.narration,
      debit: r(dr),
      credit: r(cr),
      balance: r(Math.abs(running)),
      balanceSide: running >= 0 ? "Dr" : "Cr",
    };
  });

  const totalDr = lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
  const totalCr = lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);

  return {
    ledger: { id: String(ledger._id), name: ledger.name, group: ledger.group?.name },
    from: toIstDateString(from),
    to: toIstDateString(to),
    opening: r(Math.abs(row.openingNet)),
    openingSide: row.openingNet >= 0 ? "Dr" : "Cr",
    lines,
    totalDebit: r(totalDr),
    totalCredit: r(totalCr),
    closing: r(Math.abs(running)),
    closingSide: running >= 0 ? "Dr" : "Cr",
  };
};

// ================================================================ day book
export const dayBook = async (from, to, type) => {
  const filter = { voided: false, date: { $gte: dayStart(from), $lte: dayEnd(to) } };

  // Resolved against the trusted list right here, at the query: only one of
  // our own literal type names can ever reach it, whatever the caller passed
  // (an object like {$ne: "Sales"} matches nothing and is simply ignored).
  const knownType = Object.keys(VOUCHER_TYPES).find((t) => t === type);
  if (knownType) filter.type = knownType;

  const vouchers = await Voucher.find(filter).sort({ date: 1, seq: 1, _id: 1 }).populate("entries.ledger", "name").lean();

  const items = vouchers.map((v) => ({
    voucherId: String(v._id),
    date: toIstDateString(v.date),
    number: v.number,
    type: v.type,
    narration: v.narration,
    automatic: !!v.source?.kind,
    amount: r(v.totalPaise),
    entries: v.entries.map((e) => ({ ledger: e.ledger.name, side: e.side, amount: r(e.amountPaise) })),
  }));

  return {
    from: toIstDateString(from),
    to: toIstDateString(to),
    vouchers: items,
    total: r(vouchers.reduce((s, v) => s + v.totalPaise, 0)),
    count: items.length,
  };
};

// ============================================== trading and profit & loss
// Period activity (debits - credits within [from, to]) of the ledgers in the
// "trading" and "profit-loss" sections. Stock is carried perpetually (cost of
// goods sold is posted as a Direct Expense when a sale happens), so unlike a
// periodic Tally company there are no opening/closing stock lines.
export const tradingAndProfitLoss = async (from, to) => {
  const { rows, groups } = await getLedgerActivity(from, to);
  const byParent = childrenOf(groups);
  const ledgersByGroup = indexLedgers(rows);

  const rootsOf = (section, nature) =>
    (byParent.get("root") || []).filter((g) => g.section === section && g.nature === nature);

  const rootNamed = (name) => (byParent.get("root") || []).filter((g) => g.name === name);

  // Debit-nature items are shown as positive on the left, Credit-nature as positive on the right.
  const debitSide = (roots) => buildRows(roots, byParent, ledgersByGroup, (l) => l.dr - l.cr);
  const creditSide = (roots) => buildRows(roots, byParent, ledgersByGroup, (l) => l.cr - l.dr);

  const left = debitSide([...rootNamed("Purchase Accounts"), ...rootNamed("Direct Expenses")]);
  const right = creditSide([...rootNamed("Sales Accounts"), ...rootNamed("Direct Incomes")]);

  const grossPaise = right.totalPaise - left.totalPaise; // + profit, - loss
  const tradingLeft = [...left.rows];
  const tradingRight = [...right.rows];
  if (grossPaise > 0) tradingLeft.push({ kind: "balance", name: "Gross Profit c/d", depth: 0, amount: r(grossPaise) });
  if (grossPaise < 0) tradingRight.push({ kind: "balance", name: "Gross Loss c/d", depth: 0, amount: r(-grossPaise) });
  const tradingTotal = Math.max(left.totalPaise, right.totalPaise);

  const plLeft = debitSide(rootsOf("profit-loss", "Expense"));
  const plRight = creditSide(rootsOf("profit-loss", "Income"));

  const leftRows = [...plLeft.rows];
  const rightRows = [...plRight.rows];
  if (grossPaise > 0) rightRows.unshift({ kind: "balance", name: "Gross Profit b/f", depth: 0, amount: r(grossPaise) });
  if (grossPaise < 0) leftRows.unshift({ kind: "balance", name: "Gross Loss b/f", depth: 0, amount: r(-grossPaise) });

  const leftBase = plLeft.totalPaise + (grossPaise < 0 ? -grossPaise : 0);
  const rightBase = plRight.totalPaise + (grossPaise > 0 ? grossPaise : 0);
  const netPaise = rightBase - leftBase; // + profit, - loss
  if (netPaise > 0) leftRows.push({ kind: "balance", name: "Net Profit", depth: 0, amount: r(netPaise) });
  if (netPaise < 0) rightRows.push({ kind: "balance", name: "Net Loss", depth: 0, amount: r(-netPaise) });

  return {
    from: toIstDateString(from),
    to: toIstDateString(to),
    trading: { left: tradingLeft, right: tradingRight, total: r(tradingTotal) },
    grossProfit: r(grossPaise),
    profitLoss: { left: leftRows, right: rightRows, total: r(Math.max(leftBase, rightBase)) },
    netProfit: r(netPaise),
  };
};

// ============================================================ balance sheet
// Position as on a date. Income/expense ledgers are not listed; their
// cumulative result (including any opening balance on them) appears as one
// "Profit & Loss A/c" line, which is exactly what makes the two sides agree.
export const balanceSheet = async (asOf) => {
  const { rows, groups } = await getLedgerActivity(null, asOf);
  const byParent = childrenOf(groups);
  const ledgersByGroup = indexLedgers(rows);

  const bsRoots = (nature) => (byParent.get("root") || []).filter((g) => g.section === "balance-sheet" && g.nature === nature);

  const liabilities = buildRows(bsRoots("Liability"), byParent, ledgersByGroup, (l) => -l.closingNet);
  const assets = buildRows(bsRoots("Asset"), byParent, ledgersByGroup, (l) => l.closingNet);

  const resultNet = rows
    .filter((x) => x.group && x.group.section !== "balance-sheet")
    .reduce((s, x) => s + x.closingNet, 0); // Dr positive: expenses > income = loss
  const profitPaise = -resultNet;

  const liabilityRows = [...liabilities.rows];
  const assetRows = [...assets.rows];
  let liabilityTotal = liabilities.totalPaise;
  let assetTotal = assets.totalPaise;

  if (profitPaise > 0) {
    liabilityRows.push({ kind: "balance", name: "Profit & Loss A/c (profit)", depth: 0, amount: r(profitPaise) });
    liabilityTotal += profitPaise;
  } else if (profitPaise < 0) {
    assetRows.push({ kind: "balance", name: "Profit & Loss A/c (loss)", depth: 0, amount: r(-profitPaise) });
    assetTotal += -profitPaise;
  }

  return {
    asOf: toIstDateString(asOf),
    liabilities: { rows: liabilityRows, total: r(liabilityTotal) },
    assets: { rows: assetRows, total: r(assetTotal) },
    difference: r(assetTotal - liabilityTotal),
    balanced: assetTotal === liabilityTotal,
    netProfit: r(profitPaise),
  };
};

// Default reporting window: the current financial year so far, never before
// the books start.
export const defaultRange = async (today = new Date()) => {
  const settings = await getSettings();
  const [y, m] = toIstDateString(today).split("-").map(Number);
  const fyStartYear = m >= 4 ? y : y - 1;
  const fyStart = new Date(`${fyStartYear}-04-01T12:00:00+05:30`);
  const from = fyStart < settings.booksStartDate ? settings.booksStartDate : fyStart;

  return { from, to: today };
};
