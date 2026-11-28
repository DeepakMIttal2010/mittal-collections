import mongoose from "mongoose";

// PR-9a (AM-03): one entry per write request made by a logged-in admin
// (see middleware/adminAuditLog.js). Holds who, which route and record,
// the result, and the NAMES of the submitted fields -- never values,
// headers, IP addresses, query strings or uploaded-file details.
//
// Kept for 2 years (owner decision D1): the TTL index below lets MongoDB
// delete older entries itself. TTL cleanup runs in the background, so an
// entry can outlive its expiry by a little.

export const AUDIT_RETENTION_SECONDS = 2 * 365 * 24 * 60 * 60; // 63072000

const actorSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    // No adminRole = Full Admin; otherwise the restricted role's name.
    fullAdmin: { type: Boolean, required: true },
    roleName: { type: String, default: null },
  },
  { _id: false },
);

const adminAuditLogSchema = new mongoose.Schema(
  {
    actor: { type: actorSchema, required: true },
    method: { type: String, required: true },
    // The registered route pattern (e.g. /api/orders/:id/status); null
    // when the request never reached a route or the pattern couldn't be
    // confirmed against the path.
    route: { type: String, default: null },
    // Request path without the query string.
    path: { type: String, required: true },
    entity: { type: String, required: true },
    // Only when the route really carries the record id; never guessed.
    entityId: { type: String, default: undefined },
    statusCode: { type: Number, required: true },
    outcome: { type: String, enum: ["success", "failed", "aborted"], required: true },
    fields: { type: [String], default: [] },
    // PR-9b1: what a successful update actually changed, built from the
    // allowlists in utils/auditChanges.js (old -> new, "changed" + length
    // for long text, counts for images). Absent on entries that carry no
    // diff, including every PR-9a entry.
    changes: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    changesTruncated: { type: Boolean, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_RETENTION_SECONDS });
adminAuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
adminAuditLogSchema.index({ "actor.id": 1, createdAt: -1 });

// Append-only at the application level: entries are only ever created.
// This stops the app's own code from editing or deleting them; it is not
// a tamper-proof store (anyone with direct database access can still
// change the collection, and MongoDB's TTL cleanup is unaffected).
const refuse = () => {
  throw new Error("Admin audit log entries can't be changed or deleted.");
};

adminAuditLogSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"],
  { document: false, query: true },
  refuse,
);
adminAuditLogSchema.pre(["updateOne", "deleteOne"], { document: true, query: false }, refuse);
adminAuditLogSchema.pre("save", function blockEdits() {
  if (!this.isNew) refuse();
});
adminAuditLogSchema.pre("bulkWrite", refuse);

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

export default AdminAuditLog;
