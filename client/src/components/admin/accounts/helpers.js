export const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";

export const VOUCHER_TYPES = ["Sales", "Purchase", "Payment", "Receipt", "Journal", "Contra"];

export const istToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const rupees = (n) => {
  const abs = Math.abs(Number(n)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${Number(n) < 0 ? "-" : ""}₹${abs}`;
};

// Plain number for tables where the ₹ would be noise on every cell.
export const num = (n) =>
  Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Spreadsheet apps run a cell starting with = + - @ as a formula; a ledger
// or narration typed that way would execute when the CSV is opened.
// (Plain negative numbers are left alone.)
const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const downloadCsv = (filename, rows) => {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  // The BOM makes Excel read the file as UTF-8 (Hindi/₹ stay intact).
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

// 1 April of the current financial year, never before the books start.
export const defaultFyStart = (booksStart) => {
  const [y, m] = istToday().split("-").map(Number);
  const start = `${m >= 4 ? y : y - 1}-04-01`;
  return start < booksStart ? booksStart : start;
};

// "₹1,234.50 Dr" -- empty balances show a dash, like Tally.
export const drCr = (amount, side) => (amount ? `${rupees(amount)} ${side}` : "—");

export const displayDate = (ymd) =>
  new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// Whole paise, so totals compare exactly (0.1 + 0.2 must equal 0.3).
export const toPaise = (value) => {
  const n = Number(String(value).trim());
  return String(value).trim() !== "" && Number.isFinite(n) ? Math.round(n * 100) : null;
};

// Groups flattened depth-first (parents before children) with their depth,
// for indented <select> options and the tree view.
export const flattenGroups = (groups) => {
  const byParent = new Map();
  groups.forEach((g) => {
    const key = g.parent ? String(g.parent) : "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  });

  const out = [];
  const walk = (parentKey, depth) => {
    (byParent.get(parentKey) || []).forEach((g) => {
      out.push({ ...g, depth });
      walk(String(g._id), depth + 1);
    });
  };
  walk("root", 0);

  return out;
};
