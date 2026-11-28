import { useEffect, useState } from "react";
import { FaHistory } from "react-icons/fa";

import { getAdminAuditLog } from "../../services/adminAuditLogService";
import { getCurrentAdminUser } from "../../services/authService";

// PR-9a (AM-03): read-only list of admin write actions -- who did what,
// to which record, and whether it worked. Field names, plus (PR-9b1) the
// allow-listed old -> new changes the server recorded for an update.
// Full Admin only: the generic RequirePermission guard lets a path with
// no permission key through, so this page checks it itself (and the
// server refuses restricted staff anyway). Nothing here can edit or
// delete an entry.

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { entity: "", entityId: "", actor: "", from: "", to: "" };

const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" })
    : "";

// Dates are picked as IST calendar days.
const toQuery = (filters, page) => ({
  entity: filters.entity.trim(),
  entityId: filters.entityId.trim(),
  actor: filters.actor.trim(),
  from: filters.from ? `${filters.from}T00:00:00+05:30` : "",
  to: filters.to ? `${filters.to}T23:59:59.999+05:30` : "",
  page,
  limit: PAGE_SIZE,
});

// PR-9b1: one line per recorded change. Entries without `changes` (every
// PR-9a entry, and anything that isn't a tracked update) show the field
// names as before.
const showValue = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
};

const describeChange = (change) => {
  if (change.added) return `${change.field}: added`;
  if (change.removed) return `${change.field}: removed`;
  if (change.fromCount !== undefined) {
    const main = change.mainImageChanged ? " (main image changed)" : "";
    return `${change.field}: ${change.fromCount} → ${change.toCount}${main}`;
  }
  if (change.changed) {
    const lengths =
      change.fromLength !== undefined ? ` (${change.fromLength} → ${change.toLength} characters)` : "";
    return `${change.field}: changed${lengths}`;
  }
  return `${change.field}: ${showValue(change.from)} → ${showValue(change.to)}`;
};

function ChangesCell({ entry }) {
  const names = (entry.fields || []).join(", ") || "—";
  if (!Array.isArray(entry.changes)) return names;
  if (entry.changes.length === 0) {
    return (
      <>
        <div className="italic text-slate-500">No values changed</div>
        <div className="text-slate-400">{names}</div>
      </>
    );
  }
  return (
    <ul className="space-y-0.5">
      {entry.changes.map((change, index) => (
        <li key={`${change.field}-${index}`} className="break-all">
          {describeChange(change)}
        </li>
      ))}
      {entry.changesTruncated && <li className="italic text-slate-500">More changes not shown</li>}
    </ul>
  );
}

const OUTCOME_STYLES = {
  success: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  aborted: "bg-amber-50 text-amber-700",
};

function AccessRestricted() {
  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <p className="text-sm font-semibold text-amber-600 mb-3">Access restricted</p>
      <h1 className="text-2xl font-bold text-slate-900 mb-4">You don&apos;t have access to this section</h1>
      <p className="text-slate-600">The audit log is available to the Full Admin only.</p>
    </div>
  );
}

function Field({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function AuditLogView() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ entries: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAdminAuditLog(toQuery(applied, page)).then((data) => {
      if (cancelled) return;
      if (data.success) {
        setResult({ entries: data.entries || [], total: data.total || 0, totalPages: data.totalPages || 1 });
        setError("");
      } else {
        setError(data.message || "Unable to load the audit log");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applied, page]);

  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...draft });
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-1">
        <FaHistory className="text-slate-500" />
        <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Every create, update and delete made by an admin, including refused attempts. Product, category,
        subcategory and coupon updates show what changed (old → new); long text and images show only that
        they changed. Other actions show the names of the fields sent. Entries are kept for 2 years and
        can&apos;t be edited.
      </p>

      <form onSubmit={applyFilters} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 mb-5 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
        <Field id="audit-entity" label="Record type">
          <input id="audit-entity" className={inputClass} placeholder="orders" value={draft.entity} onChange={set("entity")} />
        </Field>
        <Field id="audit-entity-id" label="Record ID">
          <input id="audit-entity-id" className={inputClass} value={draft.entityId} onChange={set("entityId")} />
        </Field>
        <Field id="audit-actor" label="Admin ID">
          <input id="audit-actor" className={inputClass} value={draft.actor} onChange={set("actor")} />
        </Field>
        <Field id="audit-from" label="From">
          <input id="audit-from" type="date" className={inputClass} value={draft.from} onChange={set("from")} />
        </Field>
        <Field id="audit-to" label="To">
          <input id="audit-to" type="date" className={inputClass} value={draft.to} onChange={set("to")} />
        </Field>
        <button type="submit" className="bg-blue-900 hover:bg-blue-950 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Apply filters
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Result</th>
              <th className="px-3 py-2">Fields</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry) => (
              <tr key={entry._id} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{dateTime(entry.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{entry.actor?.name || "—"}</div>
                  <div className="text-xs text-slate-500">
                    {entry.actor?.fullAdmin ? "Full Admin" : entry.actor?.roleName || "Staff"}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="font-semibold text-slate-700">{entry.method}</span>{" "}
                  <span className="font-mono text-xs text-slate-600 break-all">{entry.route || entry.path}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="text-slate-700">{entry.entity}</div>
                  {entry.entityId && <div className="font-mono text-xs text-slate-500 break-all">{entry.entityId}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${OUTCOME_STYLES[entry.outcome] || ""}`}>
                    {entry.statusCode} {entry.outcome}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  <ChangesCell entry={entry} />
                </td>
              </tr>
            ))}
            {!loading && result.entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No entries for these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
        <span>
          {result.total} entries · page {page} of {result.totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
            disabled={page >= result.totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminAuditLog() {
  const user = getCurrentAdminUser();
  const isFullAdmin = user?.role === "admin" && !user?.adminRole;
  return isFullAdmin ? <AuditLogView /> : <AccessRestricted />;
}

export default AdminAuditLog;
