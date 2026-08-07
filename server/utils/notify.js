import Notification from "../models/Notification.js";

// Fire-and-forget in-app notification — callers don't await this, matching
// the SearchLog.create().catch() pattern used elsewhere, so a notification
// failure never blocks the request that triggered it.
export const notifyUser = ({ userId, type, title, message = "", link = "" }) => {
  Notification.create({ user: userId, type, title, message, link }).catch(
    (error) => console.error("Notify User Error:", error),
  );
};
