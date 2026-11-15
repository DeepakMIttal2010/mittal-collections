import { useEffect, useRef, useState } from "react";

import { reverseReviewBonus } from "../../services/adminReviewService";
import { getCurrentAdminUser } from "../../services/authService";
import { hasPermission } from "../../config/adminPermissions";

// Mirrors reviewController.js's REVERSAL_* limits.
const REASON_MIN = 10;
const REASON_MAX = 1000;
const EVIDENCE_MAX = 2000;

const formatDate = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// The "Bonus reversed" label for a review whose bonus was already taken
// back, or a "Reverse bonus" button (with a confirm dialog) for a review
// that earned one. Renders nothing for a review that earned no bonus.
// The button needs the "loyalty" action permission (the server requires
// it too); full admins always have it.
function ReviewBonusReversal({ review, onReversed }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const reasonRef = useRef(null);
  const wasOpen = useRef(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting]);

  // Focus moves into the dialog on open and back to the button on close.
  useEffect(() => {
    if (open) {
      reasonRef.current?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const reversal = review.bonusReversal;

  if (reversal?.reversedAt) {
    return (
      <div className="mt-2 text-xs rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2">
        <p className="font-semibold">
          Bonus reversed · {formatDate(reversal.reversedAt)}
          {reversal.reversedByName ? ` · by ${reversal.reversedByName}` : ""}
        </p>
        <p>
          {reversal.pointsDebited ?? 0} of {reversal.points} points taken back
          {reversal.shortfall > 0
            ? ` (${reversal.shortfall} already spent, recorded as owed)`
            : ""}
          {reversal.expiredPortion > 0
            ? ` (${reversal.expiredPortion} had already expired, not taken back)`
            : ""}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words">Reason: {reversal.reason}</p>
        {reversal.evidence && (
          <p className="mt-1 whitespace-pre-wrap break-words text-red-700">
            Evidence: {reversal.evidence}
          </p>
        )}
      </div>
    );
  }

  if (!(review.pointsAwarded > 0)) return null;
  if (!hasPermission(getCurrentAdminUser(), "loyalty")) return null;

  const trimmedReason = reason.trim();
  const reasonValid =
    trimmedReason.length >= REASON_MIN && trimmedReason.length <= REASON_MAX;

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setError("");
  };

  const handleConfirm = async () => {
    if (!reasonValid || submitting) return;
    setSubmitting(true);
    setError("");

    const response = await reverseReviewBonus(review._id, {
      reason: trimmedReason,
      evidence: evidence.trim(),
    });

    setSubmitting(false);

    if (response.success) {
      setOpen(false);
      setReason("");
      setEvidence("");
      alert(response.message);
      onReversed?.();
    } else if (response.status === 409) {
      // Already reversed (e.g. by another admin) — refresh to show it.
      setOpen(false);
      setReason("");
      setEvidence("");
      alert(response.message || "This review's bonus has already been reversed");
      onReversed?.();
    } else {
      setError(response.message || "Unable to reverse the bonus");
    }
  };

  return (
    <div className="mt-2">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
      >
        Reverse bonus ({review.pointsAwarded} pts)
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`reverse-bonus-title-${review._id}`}
            className="w-full max-w-md bg-white rounded-xl shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id={`reverse-bonus-title-${review._id}`}
              className="text-lg font-bold text-slate-800 mb-1"
            >
              Reverse review bonus
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Takes back the {review.pointsAwarded} bonus points{" "}
              {review.user?.name ? `${review.user.name} ` : ""}received for this
              review. Points already spent are recorded as owed; points that
              already expired are not taken back. This can't be
              undone, and it doesn't hide or delete the review.
            </p>

            <label
              htmlFor={`reverse-bonus-reason-${review._id}`}
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              id={`reverse-bonus-reason-${review._id}`}
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REASON_MAX}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-1"
              placeholder="Why this review is fake or fraudulent"
            />
            <p className="text-[11px] text-slate-400 mb-3">
              {trimmedReason.length < REASON_MIN
                ? `At least ${REASON_MIN} characters`
                : `${trimmedReason.length}/${REASON_MAX}`}
            </p>

            <label
              htmlFor={`reverse-bonus-evidence-${review._id}`}
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Evidence notes (optional)
            </label>
            <textarea
              id={`reverse-bonus-evidence-${review._id}`}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              maxLength={EVIDENCE_MAX}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3"
              placeholder="e.g. same photos as another account, order returned"
            />

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!reasonValid || submitting}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {submitting ? "Reversing..." : "Confirm reversal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewBonusReversal;
