import mongoose from "mongoose";

// Multi-document transactions need a replica set. Production (Atlas) is
// always one; a plain standalone mongod (local dev, most of the test
// suite) isn't. Checked once per process.
let supported = null;

export const transactionsSupported = async () => {
  if (supported !== null) return supported;

  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    supported = Boolean(hello.setName);
    console.log(
      supported
        ? `MongoDB transactions available (replicaSet=${hello.setName})`
        : "MongoDB transactions unavailable (standalone server)",
    );
  } catch (error) {
    console.error("MongoDB transaction support check failed:", error);
    supported = false;
  }

  return supported;
};

// Runs fn(session) inside a transaction when the server supports one, so
// an order's status change and the stock / points / coupon changes that
// go with it commit or roll back together — a crash part-way leaves
// nothing half-done for the next run to trip over. Falls back to fn(null)
// (each write atomic on its own, the pre-transaction behaviour) on a
// standalone server. fn may run more than once (withTransaction retries
// transient conflicts), so it must only do database work — emails and
// other side effects belong after this resolves.
export const withOptionalTransaction = async (fn) => {
  if (!(await transactionsSupported())) return fn(null);

  const session = await mongoose.startSession();

  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
