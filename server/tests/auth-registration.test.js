import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

// register/verifyRegisterOtp/googleAuth all send real emails along their
// happy paths — stub sendEmail so the suite is deterministic and doesn't
// depend on real Brevo credentials, same convention as back-in-stock.test.js.
const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../config/mailer.js", () => ({ sendEmail }));

// googleAuth's OAuth2Client is instantiated once at authController.js's
// module-load time, so the mock has to exist before that controller is
// first imported anywhere in the graph. vi.hoisted() gives a stable
// reference both the mock factory and the tests below can use.
// mockImplementation needs a real `function`, not an arrow function --
// authController.js calls `new OAuth2Client(...)`, and an arrow function
// can never be invoked with `new` (confirmed live: using one here throws
// "... is not a constructor").
const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(function () {
    return { verifyIdToken };
  }),
}));

import "./setup.js";
import Otp from "../models/Otp.js";
import User from "../models/User.js";

// This file alone makes 25+ requests to /api/auth/* across its test
// cases, well past authLimiter's 20-per-15-min window (server/app.js) --
// and that limiter reads process.env.DISABLE_AUTH_RATE_LIMIT at MODULE
// EVALUATION time (building the rate-limit config), not per-request, so
// setting it has to happen before app.js is first imported anywhere in
// the graph. A static `import app from "../app.js"` is hoisted above any
// plain statement regardless of source position, so the only way to get
// the env var set first is a dynamic import inside an async setup step.
// (Same DISABLE_AUTH_RATE_LIMIT escape hatch the e2e CI job already uses
// for the identical reason -- see app.js's own comment on it. Never set
// in production.)
let app;
beforeAll(async () => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  ({ default: app } = await import("../app.js"));
}, 120000);

const register = (body) => request(app).post("/api/auth/register").send(body);
const verifyOtp = (body) => request(app).post("/api/auth/register/verify-otp").send(body);
const googleAuth = (body) => request(app).post("/api/auth/google").send(body);

const validPayload = {
  name: "Test Shopper",
  email: "shopper@example.com",
  mobile: "9000000001",
  password: "Secret123",
};

// Both register handlers email a 6-digit code; it's bcrypt-hashed in the
// DB (Otp.otpHash), never stored in plaintext anywhere except the mocked
// sendEmail call's html body -- this is the only way to recover it for a
// follow-up verify-otp test without reaching into otp.js's internals.
const extractOtpFromLastEmail = () => {
  const lastCall = sendEmail.mock.calls.at(-1);
  const match = lastCall[0].html.match(/(\d{6})/);
  return match[1];
};

describe("POST /api/auth/register", () => {
  it("sends a verification code and creates no User yet", async () => {
    const res = await register(validPayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, email: "shopper@example.com" });
    expect(await User.countDocuments()).toBe(0);

    const otp = await Otp.findOne({ target: "shopper@example.com", purpose: "register" });
    expect(otp).not.toBeNull();
    expect(otp.attempts).toBe(0);
  });

  it("returns 400 when a required field is missing", async () => {
    const { password: _password, ...incomplete } = validPayload;
    const res = await register(incomplete);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("All fields are required");
  });

  it("returns 400 for a non-string email (NoSQL-injection shape)", async () => {
    const res = await register({ ...validPayload, email: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid email or mobile number");
  });

  it("returns 400 for a password under 6 characters", async () => {
    const res = await register({ ...validPayload, password: "abc12" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Password must be at least 6 characters");
  });

  it("returns 400 when the email is already registered, case-insensitively", async () => {
    await User.create({
      name: "Existing",
      email: "test@example.com",
      mobile: "9000000099",
      password: "hashed",
    });

    const res = await register({ ...validPayload, email: "Test@Example.com" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already exists");
  });

  it("returns 400 when the mobile is already used by another customer account", async () => {
    await User.create({
      name: "Existing",
      email: "other@example.com",
      mobile: validPayload.mobile,
      password: "hashed",
      role: "user",
    });

    const res = await register(validPayload);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Mobile number already exists");
  });

  it("allows registration when the mobile is only used by an admin account", async () => {
    await User.create({
      name: "Staff",
      email: "staff@example.com",
      mobile: validPayload.mobile,
      password: "hashed",
      role: "admin",
    });

    const res = await register(validPayload);

    expect(res.status).toBe(200);
  });

  it("links a valid referralCode to the pending OTP payload", async () => {
    const referrer = await User.create({
      name: "Referrer",
      email: "referrer@example.com",
      mobile: "9000000002",
      password: "hashed",
      referralCode: "REF123",
    });

    await register({ ...validPayload, referralCode: "ref123" });

    const otp = await Otp.findOne({ target: "shopper@example.com", purpose: "register" });
    expect(String(otp.payload.referredById)).toBe(String(referrer._id));
  });

  it("succeeds with an unknown referralCode, leaving referredById null", async () => {
    const res = await register({ ...validPayload, referralCode: "DOES-NOT-EXIST" });

    expect(res.status).toBe(200);
    const otp = await Otp.findOne({ target: "shopper@example.com", purpose: "register" });
    expect(otp.payload.referredById).toBeNull();
  });

  it("replaces a prior pending OTP rather than duplicating it on a second register call", async () => {
    await register(validPayload);
    await register(validPayload);

    const count = await Otp.countDocuments({ target: "shopper@example.com", purpose: "register" });
    expect(count).toBe(1);
  });
});

describe("POST /api/auth/register/verify-otp", () => {
  it("creates the account on a correct code and sends a welcome email", async () => {
    sendEmail.mockClear();
    await register(validPayload);
    const code = extractOtpFromLastEmail();

    const res = await verifyOtp({ email: "shopper@example.com", otp: code });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Test Shopper", email: "shopper@example.com" });
    expect(res.body.user.password).toBeUndefined();

    const user = await User.findOne({ email: "shopper@example.com" });
    expect(user.emailVerified).toBe(true);
    expect(user.referralCode).toBeTruthy();
    expect(await Otp.findOne({ target: "shopper@example.com", purpose: "register" })).toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(2); // register code + welcome
  });

  it("returns 400 and increments attempts on a wrong code, without creating a User", async () => {
    await register(validPayload);

    const res = await verifyOtp({ email: "shopper@example.com", otp: "000000" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Incorrect code. Please try again.");
    expect(await User.countDocuments()).toBe(0);

    const otp = await Otp.findOne({ target: "shopper@example.com", purpose: "register" });
    expect(otp.attempts).toBe(1);
  });

  it("locks out and deletes the OTP after too many wrong attempts", async () => {
    await register(validPayload);

    // otp.js checks `attempts >= MAX_ATTEMPTS` (5) BEFORE comparing the
    // code, so the lockout message only fires once attempts has already
    // reached 5 from prior wrong tries -- i.e. the 6th submission, not
    // the 5th (attempts goes 0->1->2->3->4->5 across the first 5 wrong
    // calls, each returning "Incorrect code"; only the 6th call sees
    // attempts=5 already and short-circuits into the lockout branch).
    let res;
    for (let i = 0; i < 6; i++) {
      res = await verifyOtp({ email: "shopper@example.com", otp: "000000" });
    }

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Too many incorrect attempts. Please request a new code.");
    expect(await Otp.findOne({ target: "shopper@example.com", purpose: "register" })).toBeNull();
  });

  it("returns 400 when no OTP exists for that email", async () => {
    const res = await verifyOtp({ email: "nobody@example.com", otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("No verification code found. Please request a new one.");
  });

  it("returns 400 for an expired OTP and deletes it", async () => {
    await register(validPayload);
    await Otp.updateOne(
      { target: "shopper@example.com", purpose: "register" },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    const res = await verifyOtp({ email: "shopper@example.com", otp: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("This code has expired. Please request a new one.");
    expect(await Otp.findOne({ target: "shopper@example.com", purpose: "register" })).toBeNull();
  });

  it("returns 400 if the email was registered by someone else while the code was pending", async () => {
    await register(validPayload);
    const code = extractOtpFromLastEmail();

    await User.create({
      name: "Someone Else",
      email: "shopper@example.com",
      mobile: "9000000003",
      password: "hashed",
    });

    const res = await verifyOtp({ email: "shopper@example.com", otp: code });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already exists");
    // The code itself was correct, so otp.js's own success path already
    // deleted the Otp doc before the controller's post-verify
    // existingUser check ever runs -- this request's 400 does NOT leave
    // the OTP intact, unlike a genuinely wrong/expired code. A real
    // (if minor) product behavior: this shopper would need to register
    // again from scratch, not just retry verify with the same code.
    expect(await User.countDocuments({ email: "shopper@example.com" })).toBe(1);
    expect(await Otp.findOne({ target: "shopper@example.com", purpose: "register" })).toBeNull();
  });

  it("returns 400 when email or otp is missing", async () => {
    const res = await verifyOtp({ email: "shopper@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email and code are required");
  });
});

describe("POST /api/auth/google", () => {
  it("returns 400 when credential is missing", async () => {
    const res = await googleAuth({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Missing Google credential");
  });

  it("returns 400 when the Google account's email is unverified", async () => {
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ email: "a@example.com", email_verified: false, sub: "g1" }),
    });

    const res = await googleAuth({ credential: "token" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Google account email is not verified");
  });

  it("creates a brand-new account and sends a welcome email when nothing matches", async () => {
    sendEmail.mockClear();
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: "newgoogle@example.com",
        email_verified: true,
        sub: "google-sub-1",
        name: "Google User",
      }),
    });

    const res = await googleAuth({ credential: "token" });

    expect(res.status).toBe(200);
    expect(res.body.needsMobile).toBe(true);
    const user = await User.findOne({ email: "newgoogle@example.com" });
    expect(user.googleId).toBe("google-sub-1");
    expect(user.emailVerified).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("links an existing email/password account instead of creating a duplicate, with no welcome email", async () => {
    await User.create({
      name: "Existing",
      email: "existing@example.com",
      mobile: "9000000004",
      password: "hashed",
    });
    sendEmail.mockClear();
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: "existing@example.com",
        email_verified: true,
        sub: "google-sub-2",
        name: "Existing",
      }),
    });

    const res = await googleAuth({ credential: "token" });

    expect(res.status).toBe(200);
    expect(await User.countDocuments()).toBe(1);
    const user = await User.findOne({ email: "existing@example.com" });
    expect(user.googleId).toBe("google-sub-2");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("signs in a returning linked user with no new write and no email", async () => {
    await User.create({
      name: "Returning",
      email: "returning@example.com",
      mobile: "9000000005",
      password: "hashed",
      googleId: "google-sub-3",
    });
    sendEmail.mockClear();
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: "returning@example.com",
        email_verified: true,
        sub: "google-sub-3",
        name: "Returning",
      }),
    });

    const res = await googleAuth({ credential: "token" });

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 403 for a blocked linked user", async () => {
    await User.create({
      name: "Blocked",
      email: "blocked@example.com",
      mobile: "9000000006",
      password: "hashed",
      googleId: "google-sub-4",
      isBlocked: true,
    });
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        email: "blocked@example.com",
        email_verified: true,
        sub: "google-sub-4",
        name: "Blocked",
      }),
    });

    const res = await googleAuth({ credential: "token" });

    expect(res.status).toBe(403);
  });

  it("returns 401 when verifyIdToken rejects (invalid/expired credential)", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("Token used too late"));

    const res = await googleAuth({ credential: "bad-token" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Google sign-in failed");
  });
});
