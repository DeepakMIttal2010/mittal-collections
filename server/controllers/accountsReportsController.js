import mongoose from "mongoose";

import { getSettings } from "../utils/accounting.js";
import { parseIstDate, toIstDateString } from "../utils/recurringExpenses.js";
import { VOUCHER_TYPES } from "../config/accountingDefaults.js";
import {
  trialBalance,
  groupSummary,
  ledgerStatement,
  dayBook,
  tradingAndProfitLoss,
  balanceSheet,
  defaultRange,
} from "../utils/accountingReports.js";

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const validId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);

// from/to from the query (default: this financial year so far). Never
// before the books start; `from` after `to` is an error.
const readRange = async (query) => {
  const defaults = await defaultRange();
  const settings = await getSettings();
  let from = defaults.from;
  let to = defaults.to;

  if (query.from !== undefined) {
    from = parseIstDate(query.from);
    if (!from) return { error: "From must be a real date (YYYY-MM-DD)." };
  }
  if (query.to !== undefined) {
    to = parseIstDate(query.to);
    if (!to) return { error: "To must be a real date (YYYY-MM-DD)." };
  }

  if (toIstDateString(from) < toIstDateString(settings.booksStartDate)) from = settings.booksStartDate;
  if (toIstDateString(from) > toIstDateString(to)) return { error: "From cannot be after To." };

  return { from, to };
};

const readAsOf = (query) => {
  if (query.asOf === undefined) return { asOf: new Date() };

  const asOf = parseIstDate(query.asOf);
  return asOf ? { asOf } : { error: "asOf must be a real date (YYYY-MM-DD)." };
};

const wrap = (label, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    console.error(`${label}:`, error);
    fail(res, 500, "Server Error");
  }
};

export const getTrialBalance = wrap("Trial balance", async (req, res) => {
  const { asOf, error } = readAsOf(req.query);
  if (error) return fail(res, 400, error);

  res.status(200).json({ success: true, report: await trialBalance(asOf) });
});

export const getBalanceSheet = wrap("Balance sheet", async (req, res) => {
  const { asOf, error } = readAsOf(req.query);
  if (error) return fail(res, 400, error);

  res.status(200).json({ success: true, report: await balanceSheet(asOf) });
});

export const getTradingPL = wrap("Trading and P&L", async (req, res) => {
  const { from, to, error } = await readRange(req.query);
  if (error) return fail(res, 400, error);

  res.status(200).json({ success: true, report: await tradingAndProfitLoss(from, to) });
});

export const getGroupSummary = wrap("Group summary", async (req, res) => {
  const { from, to, error } = await readRange(req.query);
  if (error) return fail(res, 400, error);

  const { group } = req.query;
  if (group !== undefined && !validId(group)) return fail(res, 400, "Unknown group.");

  const report = await groupSummary(group, from, to);
  if (!report) return fail(res, 404, "Group not found.");

  res.status(200).json({ success: true, report });
});

export const getLedgerStatement = wrap("Ledger statement", async (req, res) => {
  const { from, to, error } = await readRange(req.query);
  if (error) return fail(res, 400, error);

  const report = await ledgerStatement(req.params.id, from, to);
  if (!report) return fail(res, 404, "Ledger not found.");

  res.status(200).json({ success: true, report });
});

export const getDayBook = wrap("Day book", async (req, res) => {
  const { from, to, error } = await readRange(req.query);
  if (error) return fail(res, 400, error);

  const { type } = req.query;
  if (type !== undefined && (typeof type !== "string" || !Object.keys(VOUCHER_TYPES).includes(type))) {
    return fail(res, 400, "Unknown voucher type.");
  }

  res.status(200).json({ success: true, report: await dayBook(from, to, type) });
});
