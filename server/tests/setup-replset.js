import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";
import { __resetEngagementCacheForTests } from "../controllers/adminController.js";

// Same as setup.js, but on a single-member replica set so multi-document
// transactions work — used only by the test files that exercise them
// (cancellation, convert-to-COD, payment reconciliation), so the rest of
// the suite keeps its faster standalone server.
let replSet;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
  process.env.RAZORPAY_KEY_SECRET =
    process.env.RAZORPAY_KEY_SECRET || "test-razorpay-secret";

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri());
}, 120000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
  __resetEngagementCacheForTests();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});
