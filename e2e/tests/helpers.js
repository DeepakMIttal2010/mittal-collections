import mongoose from "mongoose";

const API_BASE = "http://localhost:5000/api";
const LOCAL_MONGODB_URI = "mongodb://127.0.0.1:27017/mittal-collections";

let counter = 0;

// Registers a fresh test user via the API (fast, no UI dependency) and
// returns { token, user } so a test can inject an authenticated
// session via context.addInitScript instead of going through the
// login form every time.
export const createTestUser = async (request) => {
  counter += 1;
  const email = `e2e-test-${Date.now()}-${counter}@example.com`;
  const password = "TestPassword123!";

  const registerRes = await request.post(`${API_BASE}/auth/register`, {
    data: {
      name: "E2E Test User",
      email,
      mobile: `9${String(Date.now()).slice(-9)}`,
      password,
    },
  });
  const registerBody = await registerRes.json();

  if (!registerBody.success) {
    throw new Error(`Failed to create test user: ${registerBody.message}`);
  }

  // Register doesn't return a token — log in separately to get one.
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
// script runs, so AuthContext picks it up on first render.
export const loginAs = async (context, { token, user }) => {
  await context.addInitScript(
    ({ token, user }) => {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
    },
    { token, user },
  );
};
