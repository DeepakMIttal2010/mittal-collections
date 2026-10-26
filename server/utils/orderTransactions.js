import mongoose from "mongoose";

// Multi-document transactions need a replica set. Production (Atlas) is
// always one; a plain standalone mongod (local dev, most of the test
// suite) isn't. Only a successful answer is cached — a failed check (a
// network blip right after boot) is retried on the next call instead of
// switching transactions off until the next restart.
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
    return supported;
  } catch (error) {
    console.error("MongoDB transaction support check failed (will retry):", error);
    return false;
  }
};

export const __resetTransactionSupportForTests = () => {
  supported = null;
};

// Without a transaction, the writes that belong together (an order's
// status and the stock / points / coupon that go with it) can be split by
// a crash. That's tolerated only where it can't hurt: the test suite
// (Vitest sets NODE_ENV=test) or a local standalone mongod that opts in
// explicitly. Everywhere else — production included, whatever NODE_ENV
// says — writing without a transaction is refused.
const nonTransactionalWritesAllowed = () =>
  process.env.NODE_ENV === "test" ||
  process.env.ALLOW_NON_TRANSACTIONAL_ORDER_WRITES === "true";

export class TransactionsUnavailableError extends Error {
  constructor() {
    super("MongoDB transactions are unavailable");
    this.code = "TRANSACTIONS_UNAVAILABLE";
  }
}

// Runs fn(session) inside a transaction, so an order's status change and
// the stock / points / coupon changes that go with it commit or roll back
// together — a crash part-way leaves nothing half-done. Without
// transaction support it throws TransactionsUnavailableError BEFORE
// running fn (nothing is written), except where non-transactional writes
// are allowed (see above), where it runs fn(null). fn may run more than
// once (withTransaction retries transient conflicts), so it must only do
// database work — emails and other side effects belong after this
// resolves.
export const withOptionalTransaction = async (fn) => {
  if (!(await transactionsSupported())) {
    if (!nonTransactionalWritesAllowed()) {
      console.error(
        "[orders] refusing a non-transactional order write: MongoDB transactions are unavailable",
      );
      throw new TransactionsUnavailableError();
    }

    return fn(null);
  }

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
