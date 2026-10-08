import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { signToken } from "./helpers.js";

// Same rate-limiter constraint as auth-registration.test.js — this file
// also exceeds authLimiter's 20-request window on its own, and the env
// var has to be set before app.js's module evaluation builds that
// limiter, which means a dynamic import inside beforeAll (a static
// import is hoisted above any plain statement regardless of source
// position). See app.js's own comment on DISABLE_AUTH_RATE_LIMIT.
let app;
beforeAll(async () => {
  process.env.DISABLE_AUTH_RATE_LIMIT = "true";
  ({ default: app } = await import("../app.js"));
}, 120000);

const login = (body) => request(app).post("/api/auth/login").send(body);
const forgotPassword = (body) => request(app).post("/api/auth/forgot-password").send(body);
const resetPassword = (body) => request(app).post("/api/auth/reset-password").send(body);
const changePassword = (token, body) =>
  request(app).put("/api/auth/change-password").set("Authorization", `Bearer ${token}`).send(body);

// helpers.createUser's default password ("not-used-directly") is a
// placeholder, not a bcrypt hash — any test that needs a real
// bcrypt.compare match has to seed the user directly with a real hash
// instead.
const createLoginableUser = (overrides = {}) =>
  User.create({
    name: "Test Shopper",
    email: "shopper@example.com",
    mobile: "9000000001",
    password: bcrypt.hashSync("Secret123", 10),
    ...overrides,
  });

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials and returns a valid token + no password field", async () => {
    const user = await createLoginableUser();

    const res = await login({ email: "shopper@example.com", password: "Secret123" });

    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(String(decoded.id)).toBe(String(user._id));
  });

  it("logs in with a differently-cased email", async () => {
    await createLoginableUser();

    const res = await login({ email: "Shopper@Example.com", password: "Secret123" });

    expect(res.status).toBe(200);
  });

  it("returns 401 for a wrong password", async () => {
    await createLoginableUser();

    const res = await login({ email: "shopper@example.com", password: "WrongPassword" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("returns 401 (same message) for an unknown email", async () => {
    const res = await login({ email: "nobody@example.com", password: "Secret123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("returns 401 for a non-string email (NoSQL-injection shape) -- not 400, unlike register", async () => {
    const res = await login({ email: { $ne: null }, password: "Secret123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("returns 403 for a blocked user with the correct password", async () => {
    await createLoginableUser({ isBlocked: true });

    const res = await login({ email: "shopper@example.com", password: "Secret123" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Your account has been blocked. Please contact support.");
  });

  it("returns 401 (not 403) for a blocked user with the WRONG password -- block check runs after password match", async () => {
    await createLoginableUser({ isBlocked: true });

    const res = await login({ email: "shopper@example.com", password: "WrongPassword" });

    expect(res.status).toBe(401);
  });

  it("updates preferredLanguage when a different language is passed", async () => {
    await createLoginableUser({ preferredLanguage: "en" });

    await login({ email: "shopper@example.com", password: "Secret123", language: "hi" });

    const user = await User.findOne({ email: "shopper@example.com" });
    expect(user.preferredLanguage).toBe("hi");
  });

  it("includes adminRole details for a staff account with a restricted role", async () => {
    const role = await Role.create({
      name: "Stock Manager",
      permissions: ["products"],
      writeAccess: ["products:new"],
    });
    await createLoginableUser({ role: "admin", adminRole: role._id });

    const res = await login({ email: "shopper@example.com", password: "Secret123" });

    expect(res.body.user.adminRole).toMatchObject({
      name: "Stock Manager",
      permissions: ["products"],
      writeAccess: ["products:new"],
    });
  });

  it("returns adminRole: null for a plain customer", async () => {
    await createLoginableUser();

    const res = await login({ email: "shopper@example.com", password: "Secret123" });

    expect(res.body.user.adminRole).toBeNull();
  });

  it("returns 400 when email or password is missing", async () => {
    const res = await login({ email: "shopper@example.com" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email and password are required");
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("sets a reset token and emails it for an existing user", async () => {
    await createLoginableUser();

    const res = await forgotPassword({ email: "shopper@example.com" });

    expect(res.status).toBe(200);
    const user = await User.findOne({ email: "shopper@example.com" });
    expect(user.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
    expect(user.resetPasswordExpire.getTime()).toBeGreaterThan(Date.now());
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns the identical generic response for an unknown email, with no email sent", async () => {
    sendEmail.mockClear();
    const known = await forgotPassword({ email: "nobody@example.com" });

    await createLoginableUser();
    sendEmail.mockClear();
    const existing = await forgotPassword({ email: "shopper@example.com" });

    expect(known.status).toBe(existing.status);
    expect(known.body).toEqual({
      success: true,
      message: "If an account exists for this email, a reset link has been sent",
    });
    // existing.body differs only in that an email WAS sent for it -- the
    // response bodies themselves must still be identical (the whole
    // point of the enumeration guard).
    expect(existing.body).toEqual(known.body);
  });

  it("returns 400 when email is missing", async () => {
    const res = await forgotPassword({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email is required");
  });

  it("still returns 200 when sendEmail fails", async () => {
    await createLoginableUser();
    sendEmail.mockRejectedValueOnce(new Error("Brevo down"));

    const res = await forgotPassword({ email: "shopper@example.com" });

    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/reset-password", () => {
  // The raw token is never persisted in plaintext (only its SHA-256 hash
  // lands in User.resetPasswordToken) -- the only place it appears is
  // inside the mocked sendEmail call's html body.
  const getRawTokenFromLastEmail = () => {
    const lastCall = sendEmail.mock.calls.at(-1);
    return lastCall[0].html.match(/reset-password\/([a-f0-9]{64})/)[1];
  };

  it("resets the password with a valid token", async () => {
    await createLoginableUser();
    await forgotPassword({ email: "shopper@example.com" });
    const rawToken = getRawTokenFromLastEmail();

    const res = await resetPassword({ token: rawToken, password: "NewSecret456" });

    expect(res.status).toBe(200);
    const user = await User.findOne({ email: "shopper@example.com" });
    expect(user.resetPasswordToken).toBeNull();
    expect(user.resetPasswordExpire).toBeNull();
    expect(await bcrypt.compare("NewSecret456", user.password)).toBe(true);
    expect(await bcrypt.compare("Secret123", user.password)).toBe(false);
  });

  it("sends a confirmation email on success", async () => {
    await createLoginableUser();
    await forgotPassword({ email: "shopper@example.com" });
    const rawToken = getRawTokenFromLastEmail();
    sendEmail.mockClear();

    await resetPassword({ token: rawToken, password: "NewSecret456" });

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for a garbage token that matches no user", async () => {
    const res = await resetPassword({ token: "a".repeat(64), password: "NewSecret456" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Reset link is invalid or has expired");
  });

  it("returns 400 for an expired token", async () => {
    await createLoginableUser();
    await forgotPassword({ email: "shopper@example.com" });
    const rawToken = getRawTokenFromLastEmail();
    await User.updateOne(
      { email: "shopper@example.com" },
      { resetPasswordExpire: Date.now() - 1000 },
    );

    const res = await resetPassword({ token: rawToken, password: "NewSecret456" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for a new password under 6 characters", async () => {
    const res = await resetPassword({ token: "a".repeat(64), password: "abc12" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Password must be at least 6 characters");
  });

  it("returns 400 when token or password is missing", async () => {
    const res = await resetPassword({ password: "NewSecret456" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Token and new password are required");
  });

  it("rejects reusing the same token a second time", async () => {
    await createLoginableUser();
    await forgotPassword({ email: "shopper@example.com" });
    const rawToken = getRawTokenFromLastEmail();

    const first = await resetPassword({ token: rawToken, password: "NewSecret456" });
    const second = await resetPassword({ token: rawToken, password: "AnotherOne789" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
  });

  it("still returns 200 when the confirmation email fails to send", async () => {
    await createLoginableUser();
    await forgotPassword({ email: "shopper@example.com" });
    const rawToken = getRawTokenFromLastEmail();
    sendEmail.mockRejectedValueOnce(new Error("Brevo down"));

    const res = await resetPassword({ token: rawToken, password: "NewSecret456" });

    expect(res.status).toBe(200);
  });
});

describe("PUT /api/auth/change-password", () => {
  it("changes the password with the correct current password", async () => {
    const user = await createLoginableUser();
    const token = signToken(user);

    const res = await changePassword(token, {
      currentPassword: "Secret123",
      newPassword: "NewSecret456",
    });

    expect(res.status).toBe(200);
    const updated = await User.findById(user._id);
    expect(await bcrypt.compare("NewSecret456", updated.password)).toBe(true);
  });

  it("returns 401 for a wrong current password, leaving the password unchanged", async () => {
    const user = await createLoginableUser();
    const token = signToken(user);

    const res = await changePassword(token, {
      currentPassword: "WrongPassword",
      newPassword: "NewSecret456",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Current password is incorrect");
    const unchanged = await User.findById(user._id);
    expect(await bcrypt.compare("Secret123", unchanged.password)).toBe(true);
  });

  it("returns 400 for a new password under 6 characters", async () => {
    const user = await createLoginableUser();
    const token = signToken(user);

    const res = await changePassword(token, {
      currentPassword: "Secret123",
      newPassword: "abc12",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("New password must be at least 6 characters");
  });

  it("returns 400 when currentPassword or newPassword is missing", async () => {
    const user = await createLoginableUser();
    const token = signToken(user);

    const res = await changePassword(token, { currentPassword: "Secret123" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Current and new password are required");
  });

  it("rejects a request with no auth token", async () => {
    const res = await request(app).put("/api/auth/change-password").send({
      currentPassword: "Secret123",
      newPassword: "NewSecret456",
    });

    expect(res.status).toBe(401);
  });

  it("still returns 200 when the confirmation email fails to send", async () => {
    const user = await createLoginableUser();
    const token = signToken(user);
    sendEmail.mockRejectedValueOnce(new Error("Brevo down"));

    const res = await changePassword(token, {
      currentPassword: "Secret123",
      newPassword: "NewSecret456",
    });

    expect(res.status).toBe(200);
  });
});
