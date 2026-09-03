import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const API_BASE = "http://localhost:5000/api";
const LOCAL_MONGODB_URI = "mongodb://127.0.0.1:27017/mittal-collections";

let counter = 0;

// Creates a fresh test user directly in the local dev DB (test-only —
// never used against production) and returns { token, user } so a test
// can inject an authenticated session via context.addInitScript instead
// of going through the login form every time.
//
// Registration is a two-step OTP-verified flow in the real app (see
// authController.js's register/verifyRegisterOtp) — nothing is written
// to the User collection until an emailed code is confirmed, so there's
// no plaintext code a test could grab to complete that flow via the API.
// This bypasses it the same way createTestAdmin already bypasses the
// role restriction: write the User document directly, already verified.
export const createTestUser = async (request) => {
  counter += 1;
  const email = `e2e-test-${Date.now()}-${counter}@example.com`;
  const password = "TestPassword123!";
  const mobile = `9${String(Date.now()).slice(-9)}`;

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(LOCAL_MONGODB_URI);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await mongoose.connection.collection("users").insertOne({
    name: "E2E Test User",
    email,
    mobile,
    password: hashedPassword,
    emailVerified: true,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const loginRes = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  const loginBody = await loginRes.json();

  if (!loginBody.success) {
    throw new Error(`Failed to log in test user: ${loginBody.message}`);
  }

  return { token: loginBody.token, user: loginBody.user };
};

// Registers a test user then flips their role to admin directly in the
// local dev DB (test-only — never used against production; this repo's
// register endpoint hardcodes role: "user" for security, as it should).
export const createTestAdmin = async (request) => {
  const testUser = await createTestUser(request);

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(LOCAL_MONGODB_URI);
  }
  await mongoose.connection
    .collection("users")
    .updateOne(
      { _id: new mongoose.Types.ObjectId(testUser.user.id) },
      { $set: { role: "admin" } },
    );

  // Re-login to get a JWT whose payload actually carries role: "admin"
  // (authMiddleware trusts the token's role claim, set at login time).
  const loginRes = await request.post(`${API_BASE}/auth/login`, {
    data: { email: testUser.user.email, password: "TestPassword123!" },
  });
  const loginBody = await loginRes.json();

  return { token: loginBody.token, user: loginBody.user };
};

// Injects a logged-in session into the browser context before any page
// script runs, so AuthContext picks it up on first render. Sets both the
// customer keys (token/user, read by AuthContext) and the admin keys
// (adminToken/adminUser, read by AdminProtectedRoute — see
// authService.js's saveAdminLogin) since the app keeps two entirely
// separate localStorage namespaces for customer vs admin sessions.
// Setting both is harmless for a non-admin user: AdminProtectedRoute
// still checks user.role === "admin" and redirects otherwise.
// Looks up a seed product's (server/data/products.js) real path at
// test-run time. Its _id is auto-generated fresh by `npm run seed:all`
// on every run — Mongo doesn't reuse ids across inserts — so a path
// hardcoded once only ever matched whichever long-lived local DB the
// tests were first written against, and silently 404s against any
// freshly seeded database (confirmed as an independent cause of CI's
// e2e job failing on every run, alongside the job never seeding at
// all — see .github/workflows/ci.yml's "Seed test catalog data" step).
export const getSeededProductPath = async (name = "Luxury Cotton Bedsheet") => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(LOCAL_MONGODB_URI);
  }

  const product = await mongoose.connection
    .collection("products")
    .findOne({ name });

  if (!product) {
    throw new Error(
      `Seed product "${name}" not found — run \`npm run seed:all\` in server/ first.`,
    );
  }

  return { id: product._id.toString(), slug: product.slug, path: `/product/${product._id}/${product.slug}` };
};

// Every seed product (server/data/products.js) ships with real stock —
// none of them is ever out of stock, so a test that needs a genuinely
// unavailable product creates its own directly in the local dev DB
// (same direct-collection-write pattern as createTestUser above) rather
// than relying on seed data that has no such fixture.
export const createOutOfStockProductPath = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(LOCAL_MONGODB_URI);
  }

  // Deliberately NOT "Bedsheets" — compare-mobile.spec.js relies on that
  // category having exactly the 3 products server/data/products.js
  // seeds, no more; dropping a throwaway product into it here would
  // silently inflate that count for whichever test happens to run
  // after this one (exactly the bug a real CI run caught, 2026-09-03).
  const category = await mongoose.connection
    .collection("categories")
    .findOne({ name: { $ne: "Bedsheets" } });
  if (!category) {
    throw new Error("No seeded category found — run `npm run seed:all` in server/ first.");
  }

  counter += 1;
  const slug = `e2e-out-of-stock-${Date.now()}-${counter}`;

  const { insertedId } = await mongoose.connection.collection("products").insertOne({
    name: "E2E Out Of Stock Test Product",
    slug,
    description: "Test-only product for e2e out-of-stock scenarios.",
    price: 100,
    oldPrice: 0,
    category: category._id,
    subcategories: [],
    image: "",
    images: [],
    videos: [],
    stock: 0,
    variants: [],
    rating: 5,
    isActive: true,
    isReturnable: true,
    visibility: "both",
    showInNewArrivals: true,
    willRestock: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return `/product/${insertedId}/${slug}`;
};

// The WhatsApp floating button (and the product-page one) render
// nothing at all until SiteSettings.phone is set (see
// WhatsAppButton.jsx's `if (!phone) return null`) — nothing seeds a
// phone number (server/seeder.js doesn't touch settings), so a freshly
// seeded/never-configured site legitimately has no WhatsApp buttons,
// same as it legitimately has no homepage trending products (see
// compare-mobile.spec.js). Tests that specifically cover the WhatsApp
// buttons set this themselves rather than relying on seed data for a
// site-wide setting.
export const ensureSiteSettingsPhone = async (phone = "919999999999") => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(LOCAL_MONGODB_URI);
  }

  // SiteSettings is a singleton the app auto-creates on first read (see
  // GET /api/settings) — there's always at most one document, so this
  // updates it if present or creates it fresh otherwise, no id needed.
  await mongoose.connection.collection("sitesettings").updateOne(
    {},
    { $set: { phone } },
    { upsert: true },
  );
};

// Home.jsx only emits the homepage's LocalBusiness/HomeGoodsStore
// JSON-LD when SiteSettings.address is set — same "nothing seeds it, so
// a fresh site legitimately has none" situation as
// ensureSiteSettingsPhone above, just gating structured data instead of
// a button.
export const ensureSiteSettingsAddress = async (
  address = "123 Test Street, Ghaziabad, Uttar Pradesh 201012",
) => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(LOCAL_MONGODB_URI);
  }

  await mongoose.connection.collection("sitesettings").updateOne(
    {},
    { $set: { address } },
    { upsert: true },
  );
};

export const loginAs = async (context, { token, user }) => {
  await context.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("adminToken", token);
      localStorage.setItem("adminUser", JSON.stringify(user));
    },
    { token, user },
  );
};
