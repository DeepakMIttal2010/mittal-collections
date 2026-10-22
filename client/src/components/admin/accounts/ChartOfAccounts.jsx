import { useMemo, useState } from "react";

import Field from "./shared";
import { inputClass, drCr, rupees, flattenGroups } from "./helpers";
import {
  createGroup,
  updateGroup,
  deleteGroup,
  createLedger,
  updateLedger,
  deleteLedger,
} from "../../../services/adminAccountsService";

const emptyLedger = (group = "") => ({ name: "", group, openingBalance: "", openingSide: "Dr", notes: "", isActive: true });

// Group / sub-group / ledger tree, Tally style, with each ledger's closing
// balance and each group's total (sum of everything below it).
function ChartOfAccounts({ groups, ledgers, openingDifference, onChanged, notify }) {
  const [ledgerForm, setLedgerForm] = useState(null);
  const [ledgerEditingId, setLedgerEditingId] = useState(null);
  const [groupForm, setGroupForm] = useState(null);
  const [groupEditingId, setGroupEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState({});

  const flat = useMemo(() => flattenGroups(groups), [groups]);

  const parentOf = useMemo(
    () => new Map(groups.map((g) => [String(g._id), g.parent ? String(g.parent) : null])),
    [groups],
  );

  // Net Dr(+)/Cr(-) of each group including all sub-groups.
  const groupNet = useMemo(() => {
    const net = new Map();

    ledgers.forEach((l) => {
      const signed = l.closingSide === "Dr" ? l.closing : -l.closing;
      let gid = l.group ? String(l.group._id) : null;
      while (gid) {
        net.set(gid, (net.get(gid) || 0) + signed);
        gid = parentOf.get(gid);
      }
    });

    return net;
  }, [parentOf, ledgers]);

  const ledgersByGroup = useMemo(() => {
    const m = new Map();
    ledgers.forEach((l) => {
      const key = l.group ? String(l.group._id) : "none";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(l);
    });
    return m;
  }, [ledgers]);

  const isOpen = (id) => open[id] !== false; // expanded by default

  const submit = async (action, successMessage) => {
    setSaving(true);
    const res = await action();
    setSaving(false);

    if (!res.success) {
      notify(res.message || "Could not save.");
      return false;
    }

    notify(successMessage);
    onChanged();
    return true;
  };

  const saveLedger = async () => {
    const opening = ledgerForm.openingBalance === "" ? 0 : Number(ledgerForm.openingBalance);
    const body = {
      name: ledgerForm.name,
      group: ledgerForm.group,
      openingBalance: opening,
      openingSide: ledgerForm.openingSide,
      notes: ledgerForm.notes,
    };
    // A ledger with vouchers can't be deleted -- deactivating hides it from
    // new vouchers instead. System ledgers are always active.
    if (ledgerEditingId && !ledgerForm.systemKey) body.isActive = ledgerForm.isActive;
    if (ledgerEditingId && ledgerForm.systemKey) delete body.group; // system ledgers can't move

    const ok = await submit(
      () => (ledgerEditingId ? updateLedger(ledgerEditingId, body) : createLedger(body)),
      ledgerEditingId ? "Ledger updated." : "Ledger added.",
    );

    if (ok) {
      setLedgerForm(null);
      setLedgerEditingId(null);
    }
  };

  const saveGroup = async () => {
    const ok = await submit(
      () => (groupEditingId ? updateGroup(groupEditingId, { name: groupForm.name }) : createGroup(groupForm)),
      groupEditingId ? "Group renamed." : "Group added.",
    );

    if (ok) {
      setGroupForm(null);
      setGroupEditingId(null);
    }
  };

  const removeLedger = async (l) => {
    if (!window.confirm(`Delete ledger "${l.name}"?`)) return;
    await submit(() => deleteLedger(l._id), "Ledger deleted.");
  };

  const removeGroup = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    await submit(() => deleteGroup(g._id), "Group deleted.");
  };

  const setL = (key) => (e) => setLedgerForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          Groups, sub-groups and ledgers, with closing balances as on today.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setGroupEditingId(null);
              setGroupForm({ name: "", parent: groups[0]?._id || "" });
            }}
            className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2"
          >
            + Add group
          </button>
          <button
            type="button"
            onClick={() => {
              setLedgerEditingId(null);
              setLedgerForm(emptyLedger(groups[0]?._id || ""));
            }}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            + Add ledger
          </button>
        </div>
      </div>

      {openingDifference !== 0 && (
        <p role="status" className="mb-4 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-amber-800">
          Difference in opening balances: {rupees(Math.abs(openingDifference))} {openingDifference > 0 ? "Dr" : "Cr"}.
          Opening debits and credits should match; adjust a ledger&apos;s opening balance (usually Proprietor&apos;s Capital).
        </p>
      )}

      {groupForm && (
        <div className="border border-slate-200 rounded-xl bg-white p-5 mb-4">
          <h3 className="font-semibold text-slate-800 mb-4">{groupEditingId ? "Rename group" : "New group"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name">
              <input
                type="text"
                maxLength={80}
                value={groupForm.name}
                onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
                className={inputClass}
              />
            </Field>
            {!groupEditingId && (
              <Field label="Under (parent group)">
                <select
                  value={groupForm.parent}
                  onChange={(e) => setGroupForm((p) => ({ ...p, parent: e.target.value }))}
                  className={inputClass}
                >
                  {flat.map((g) => (
                    <option key={g._id} value={g._id}>
                      {`${"  ".repeat(g.depth)}${g.name}`}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={saveGroup} disabled={saving} className="bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2">
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => { setGroupForm(null); setGroupEditingId(null); }} className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {ledgerForm && (
        <div className="border border-slate-200 rounded-xl bg-white p-5 mb-4">
          <h3 className="font-semibold text-slate-800 mb-4">{ledgerEditingId ? "Edit ledger" : "New ledger"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Name">
              <input type="text" maxLength={100} value={ledgerForm.name} onChange={setL("name")} className={inputClass} />
            </Field>
            <Field label="Under (group)">
              <select value={ledgerForm.group} onChange={setL("group")} disabled={!!ledgerForm.systemKey} className={inputClass}>
                {flat.map((g) => (
                  <option key={g._id} value={g._id}>
                    {`${"  ".repeat(g.depth)}${g.name}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Opening balance (₹)">
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" value={ledgerForm.openingBalance} onChange={setL("openingBalance")} className={inputClass} />
                <select value={ledgerForm.openingSide} onChange={setL("openingSide")} aria-label="Opening side" className="border border-slate-300 rounded-lg px-2 text-sm">
                  <option>Dr</option>
                  <option>Cr</option>
                </select>
              </div>
            </Field>
            {ledgerEditingId && !ledgerForm.systemKey && (
              <label className="flex items-center gap-2 text-sm text-slate-600 self-end pb-2">
                <input
                  type="checkbox"
                  checked={ledgerForm.isActive}
                  onChange={(e) => setLedgerForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                Active (untick to hide it from new vouchers)
              </label>
            )}
            <Field label="Notes">
              <input type="text" maxLength={300} value={ledgerForm.notes} onChange={setL("notes")} className={inputClass} />
            </Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={saveLedger} disabled={saving} className="bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg px-4 py-2">
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => { setLedgerForm(null); setLedgerEditingId(null); }} className="border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-4 py-3">Particulars</th>
              <th className="px-4 py-3 text-right">Opening</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Closing</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {flat.map((g) => {
              // Hidden when any ancestor is collapsed.
              let hidden = false;
              let pid = parentOf.get(String(g._id));
              while (pid) {
                if (!isOpen(pid)) hidden = true;
                pid = parentOf.get(pid);
              }
              if (hidden) return null;

              const net = groupNet.get(String(g._id)) || 0;
              const own = ledgersByGroup.get(String(g._id)) || [];

              return (
                <GroupRows
                  key={g._id}
                  group={g}
                  net={net}
                  ledgers={own}
                  expanded={isOpen(String(g._id))}
                  onToggle={() => setOpen((p) => ({ ...p, [g._id]: !isOpen(String(g._id)) }))}
                  onRename={() => {
                    setGroupEditingId(g._id);
                    setGroupForm({ name: g.name, parent: g.parent });
                  }}
                  onDelete={() => removeGroup(g)}
                  onEditLedger={(l) => {
                    setLedgerEditingId(l._id);
                    setLedgerForm({
                      name: l.name,
                      group: l.group?._id || "",
                      openingBalance: String(l.opening),
                      openingSide: l.openingSide,
                      notes: l.notes || "",
                      systemKey: l.systemKey,
                      isActive: l.isActive,
                    });
                  }}
                  onDeleteLedger={removeLedger}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ group, net, ledgers, expanded, onToggle, onRename, onDelete, onEditLedger, onDeleteLedger }) {
  const indent = { paddingLeft: `${16 + group.depth * 20}px` };

  return (
    <>
      <tr className="bg-slate-50/70">
        <td className="py-2.5 pr-4 font-semibold text-slate-800" style={indent}>
          <button type="button" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"} className="mr-2 text-slate-500 w-4 inline-block">
            {expanded ? "▾" : "▸"}
          </button>
          {group.name}
          <span className="ml-2 text-xs font-normal text-slate-400">{group.nature}</span>
        </td>
        <td colSpan={3} />
        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{drCr(Math.abs(net), net >= 0 ? "Dr" : "Cr")}</td>
        <td className="px-4 py-2.5 whitespace-nowrap text-right">
          {!group.isPredefined && (
            <>
              <button type="button" onClick={onRename} className="text-blue-700 hover:underline mr-3">Rename</button>
              <button type="button" onClick={onDelete} className="text-red-600 hover:underline">Delete</button>
            </>
          )}
        </td>
      </tr>
      {expanded &&
        ledgers.map((l) => (
          <tr key={l._id} className={l.isActive ? "" : "opacity-50"}>
            <td className="py-2 pr-4 text-slate-700" style={{ paddingLeft: `${16 + (group.depth + 1) * 20 + 20}px` }}>
              {l.name}
              {!l.isActive && <span className="ml-2 text-xs text-slate-400">(inactive)</span>}
            </td>
            <td className="px-4 py-2 text-right text-slate-500">{drCr(l.opening, l.openingSide)}</td>
            <td className="px-4 py-2 text-right text-slate-500">{l.debits ? rupees(l.debits) : "—"}</td>
            <td className="px-4 py-2 text-right text-slate-500">{l.credits ? rupees(l.credits) : "—"}</td>
            <td className="px-4 py-2 text-right font-medium text-slate-800">{drCr(l.closing, l.closingSide)}</td>
            <td className="px-4 py-2 whitespace-nowrap text-right">
              <button type="button" onClick={() => onEditLedger(l)} className="text-blue-700 hover:underline mr-3">Edit</button>
              {!l.systemKey && (
                <button type="button" onClick={() => onDeleteLedger(l)} className="text-red-600 hover:underline">Delete</button>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

export default ChartOfAccounts;
