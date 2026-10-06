import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

let mongod;

beforeAll(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";
  // Only needed for HMAC signature verification (verifyRazorpayPayment) —
  // a shared secret entirely within the test's own control, not a real
  // Razorpay connection, so this is safe/meaningful to fake.
  process.env.RAZORPAY_KEY_SECRET =
    process.env.RAZORPAY_KEY_SECRET || "test-razorpay-secret";

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
