import { FaCheck, FaBoxOpen, FaTruck, FaHome, FaClipboardList, FaTimes } from "react-icons/fa";

// Canonical progression a non-cancelled order moves through. "Pending" is
// relabeled "Ordered" here since that's what a customer actually
// recognizes as the first step, even though the backend status is
// "Pending" (see Order.js's statusHistory enum).
const STAGES = [
  { status: "Pending", label: "Ordered", icon: FaClipboardList },
  { status: "Processing", label: "Processing", icon: FaBoxOpen },
  { status: "Shipped", label: "Shipped", icon: FaTruck },
  { status: "Delivered", label: "Delivered", icon: FaHome },
];

const formatDate = (date) =>
  new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function OrderStatusTimeline({ order }) {
  const history = order.statusHistory || [];
  const findEntry = (status) => history.find((h) => h.status === status);

  if (order.orderStatus === "Cancelled") {
    const cancelledEntry = findEntry("Cancelled") || history[history.length - 1];

    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
          <FaTimes />
        </span>
        <div>
          <p className="font-semibold text-red-700">Order Cancelled</p>
          {cancelledEntry && (
            <p className="text-sm text-red-600">
              {formatDate(cancelledEntry.changedAt)}
            </p>
          )}
        </div>
      </div>
    );
  }

  const currentIndex = STAGES.findIndex((s) => s.status === order.orderStatus);

  return (
    <ol>
      {STAGES.map((stage, index) => {
        const entry = findEntry(stage.status);
        const isDone = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === STAGES.length - 1;
        const Icon = stage.icon;

        return (
          <li key={stage.status} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast && (
              <span
                className={`absolute left-[18px] top-9 h-[calc(100%-2rem)] w-0.5 ${
                  index < currentIndex ? "bg-green-500" : "bg-slate-200"
                }`}
              />
            )}

            <span
              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                isDone
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-slate-300 bg-white text-slate-400"
              }`}
            >
              {isDone && !isCurrent ? <FaCheck className="text-xs" /> : <Icon className="text-sm" />}
            </span>

            <div className="min-w-0 pt-1">
              <p
                className={`font-semibold ${
                  isDone ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {stage.label}
                {isCurrent && (
                  <span className="ml-2 text-xs font-medium text-green-600">
                    Current status
                  </span>
                )}
              </p>
              {entry ? (
                <p className="text-sm text-slate-500">{formatDate(entry.changedAt)}</p>
              ) : (
                !isDone && <p className="text-sm text-slate-400">Pending</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default OrderStatusTimeline;
