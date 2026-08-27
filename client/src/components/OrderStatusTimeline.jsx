import { FaCheck, FaBoxOpen, FaTruck, FaHome, FaClipboardList, FaTimes } from "react-icons/fa";
import { useLanguage } from "../context/LanguageContext";

// Canonical progression a non-cancelled order moves through. "Pending" is
// relabeled "Ordered" here since that's what a customer actually
// recognizes as the first step, even though the backend status is
// "Pending" (see Order.js's statusHistory enum).
function getStages(t) {
  return [
    { status: "Pending", label: t("Ordered", "ऑर्डर किया"), icon: FaClipboardList },
    { status: "Processing", label: t("Processing", "प्रोसेसिंग"), icon: FaBoxOpen },
    { status: "Shipped", label: t("Shipped", "शिप किया गया"), icon: FaTruck },
    { status: "Delivered", label: t("Delivered", "डिलीवर हो गया"), icon: FaHome },
  ];
}

const formatDate = (date) =>
  new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function OrderStatusTimeline({ order }) {
  const { t } = useLanguage();
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
          <p className="font-semibold text-red-700">{t("Order Cancelled", "ऑर्डर रद्द हुआ")}</p>
          {cancelledEntry && (
            <p className="text-sm text-red-600">
              {formatDate(cancelledEntry.changedAt)}
            </p>
          )}
        </div>
      </div>
    );
  }

  const stages = getStages(t);
  const currentIndex = stages.findIndex((s) => s.status === order.orderStatus);

  return (
    <ol>
      {stages.map((stage, index) => {
        const entry = findEntry(stage.status);
        const isDone = index <= currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === stages.length - 1;
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
                    {t("Current status", "वर्तमान स्थिति")}
                  </span>
                )}
              </p>
              {entry ? (
                <p className="text-sm text-slate-500">{formatDate(entry.changedAt)}</p>
              ) : (
                !isDone && <p className="text-sm text-slate-400">{t("Pending", "लंबित")}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default OrderStatusTimeline;
