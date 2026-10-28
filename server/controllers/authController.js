import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import User from "../models/User.js";
import { sendEmail } from "../config/mailer.js";
import { generateUniqueReferralCode } from "../utils/referral.js";
import { createAndSendOtp, verifyOtp } from "../utils/otp.js";
import { escapeHtml } from "../utils/escapeHtml.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

// "shopper@example.com" -> "sh***@example.com"
const maskEmail = (email) => {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};

// Replaces the old BCC of the registration code email: tells the admin
// a code email was handed to the mail provider, without the code itself
// or anything else that could be used to finish the signup. "Accepted"
// is all Brevo's 2xx means — it doesn't confirm inbox delivery, and the
// note says so. Same opt-in env var as the other admin copies; unset
// means no note.
const notifyAdminOtpSent = async (email) => {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;

  await sendEmail({
    to: adminEmail,
    subject: "Registration code email sent",
    html: `
      <p>A registration verification code email for <strong>${escapeHtml(maskEmail(email))}</strong> was accepted by the email provider.</p>
      <p>This confirms the provider accepted it, not that it reached the customer's inbox. The code is not included here.</p>
    `,
  });
};

// Step 1 of registration: validates the submitted details, then emails
// a code instead of creating the account directly. Nothing is written
// to the User collection until the code is confirmed via
// verifyRegisterOtp — this is what makes the email "verified" at
// signup rather than just collected.
export const register = async (req, res) => {
  try {
    const { name, email, mobile, password, referralCode, language } = req.body;
    const preferredLanguage = language === "hi" ? "hi" : "en";

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // A JSON body can carry an object where a string is expected (e.g.
    // {"email": {"$ne": null}}) — passed straight into a Mongoose query
    // filter unchecked, that's a NoSQL operator-injection vector rather
    // than a genuine "no such user" lookup. mobile hits the same kind of
    // filter below (existingMobile), so it needs the same guard.
    if (typeof email !== "string" || typeof mobile !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid email or mobile number",
      });
    }

    // Same minimum resetPassword/changePassword already enforce —
    // registration was the one place a password of any length/strength
    // went straight through.
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // User.email is stored lowercase (schema: `lowercase: true`) —
    // normalizing here too means the duplicate check below actually
    // catches an existing account typed in different casing, instead
    // of deferring the collision to User.create()'s unique-index error.
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Only checked against other customers — an admin using the same
    // number for their own customer account is allowed.
    const existingMobile = await User.findOne({ mobile, role: "user" });

    if (existingMobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile number already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let referrer = null;
    if (referralCode && referralCode.trim()) {
      referrer = await User.findOne({
        referralCode: referralCode.trim().toUpperCase(),
      });
    }

    await createAndSendOtp({
      target: normalizedEmail,
      purpose: "register",
      payload: {
        name,
        email: normalizedEmail,
        mobile,
        hashedPassword,
        referredById: referrer?._id || null,
        preferredLanguage,
      },
      // No admin BCC: a copy of the code in the admin mailbox let anyone
      // with access to it complete any signup. The admin still gets
      // send visibility from the code-free note below (deep bug sweep
      // round 30).
      language: preferredLanguage,
    });

    notifyAdminOtpSent(normalizedEmail).catch((error) =>
      console.error("Registration OTP admin note failed:", error.message),
    );

    res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
      email: normalizedEmail,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Step 2: confirms the code and actually creates the account.
export const verifyRegisterOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and code are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const result = await verifyOtp({
      target: normalizedEmail,
      purpose: "register",
      code: otp,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const { name, mobile, hashedPassword, referredById, preferredLanguage } =
      result.payload;

    // Someone could have registered with this email/mobile via another
    // path (e.g. Google sign-in) while this code was pending — re-check
    // rather than let a stale payload create a duplicate.
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const existingMobile = await User.findOne({ mobile, role: "user" });
    if (existingMobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile number already exists",
      });
    }

    const newReferralCode = await generateUniqueReferralCode(name);

    const user = await User.create({
      name,
      email: normalizedEmail,
      mobile,
      password: hashedPassword,
      emailVerified: true,
      referralCode: newReferralCode,
      referredBy: referredById || null,
      preferredLanguage: preferredLanguage === "hi" ? "hi" : "en",
    });

    const isHindi = user.preferredLanguage === "hi";

    try {
      await sendEmail({
        to: user.email,
        // Lets the admin confirm registration emails are actually going
        // out (undelivered welcome emails were otherwise invisible —
        // no error, just a customer who never got one). Unset in
        // dev/env by default.
        bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
        subject: isHindi
          ? "Mittal Collections में आपका स्वागत है!"
          : "Welcome to Mittal Collections!",
        html: isHindi
          ? `
          <p>नमस्ते ${escapeHtml(user.name)},</p>
          <p>Mittal Collections में आपका स्वागत है! आपका अकाउंट सफलतापूर्वक बन गया है।</p>
          <p>प्रीमियम बेडशीट, तौलिए, पर्दे, तकिए और भी बहुत कुछ देखें
          <a href="${process.env.CLIENT_URL}">mittalcollections.com</a> पर।</p>
        `
          : `
          <p>Hi ${escapeHtml(user.name)},</p>
          <p>Welcome to Mittal Collections! Your account has been created successfully.</p>
          <p>Explore premium bedsheets, towels, curtains, pillows and more at
          <a href="${process.env.CLIENT_URL}">mittalcollections.com</a>.</p>
        `,
      });
    } catch (error) {
      console.error("Welcome Email Error:", error);
    }

    // Registration never issued a token, so Register.jsx had to bounce a
    // brand-new customer to a separate /login screen to re-type the
    // password they'd just chosen seconds earlier -- an avoidable step
    // right at the start of a first-time organic buyer's checkout
    // journey (SEO/conversion audit, 2026-10-20). Mirrors login()'s own
    // token shape exactly, including tokenVersion, so this account
    // immediately works the same way a normal login would.
    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
        referralCode: user.referralCode,
        adminRole: null,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, language } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // See the same check in register() — a non-string email (e.g. a
    // NoSQL operator object) must never reach the query filter below.
    if (typeof email !== "string") {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // User.email is stored lowercase (schema: `lowercase: true`) — a
    // raw-cased lookup here silently fails to match for anyone who
    // typed their email differently than at registration (e.g. a
    // mobile keyboard auto-capitalizing the first letter), a real
    // "wrong password" -looking bug that isn't actually about the
    // password at all.
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).populate("adminRole");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Checked only after the password is confirmed correct — otherwise
    // submitting any password for a blocked account's email would
    // disclose that the email is registered and blocked without
    // actually knowing the password, the same email-enumeration
    // concern forgotPassword already avoids by giving a uniform
    // response regardless of whether the account exists.
    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    // Opportunistic refresh, not a dedicated settings toggle (per the
    // "automatic" design this was built with) -- keeps preferredLanguage
    // current for a returning customer who's since switched the
    // storefront's language toggle, without needing its own UI. Only
    // writes when it's actually changed, so a login doesn't cost a
    // write on every single request.
    if ((language === "hi" || language === "en") && user.preferredLanguage !== language) {
      user.preferredLanguage = language;
      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        tokenVersion: user.tokenVersion,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
        referralCode: user.referralCode,
        // null for customers and full/unrestricted admins — only a
        // staff account with a restricted Role assigned gets this,
        // which the client uses to filter the sidebar and gate routes.
        adminRole: user.adminRole
          ? {
              id: user.adminRole._id,
              name: user.adminRole.name,
              permissions: user.adminRole.permissions,
              writeAccess: user.adminRole.writeAccess,
            }
          : null,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Sign-in or sign-up via a Google ID token (frontend uses Google
// Identity Services, sends us the resulting credential to verify
// server-side — we never trust a client-asserted email/name directly).
export const googleAuth = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Missing Google credential",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload.email_verified) {
      return res.status(400).json({
        success: false,
        message: "Google account email is not verified",
      });
    }

    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
      // Not linked yet — but an account with this email may already
      // exist from normal email/password signup. Link rather than
      // creating a duplicate.
      user = await User.findOne({ email: payload.email.toLowerCase().trim() });

      if (user) {
        user.googleId = payload.sub;
        user.emailVerified = true;
        await user.save();
      } else {
        const newReferralCode = await generateUniqueReferralCode(
          payload.name || payload.email,
        );

        user = await User.create({
          name: payload.name || payload.email.split("@")[0],
          email: payload.email,
          googleId: payload.sub,
          emailVerified: true,
          referralCode: newReferralCode,
        });

        try {
          await sendEmail({
            to: user.email,
            bcc: process.env.ADMIN_NOTIFICATION_EMAIL,
            subject: "Welcome to Mittal Collections!",
            html: `
              <p>Hi ${escapeHtml(user.name)},</p>
              <p>Welcome to Mittal Collections! Your account has been created successfully.</p>
              <p>Explore premium bedsheets, towels, curtains, pillows and more at
              <a href="${process.env.CLIENT_URL}">mittalcollections.com</a>.</p>
            `,
          });
        } catch (error) {
          console.error("Welcome Email Error:", error);
        }
      }
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(200).json({
      success: true,
      message: "Signed in with Google",
      token,
      needsMobile: !user.mobile,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Google Auth Error:", error);

    res.status(401).json({
      success: false,
      message: "Google sign-in failed",
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Backfill a referral code for accounts created before this feature
    if (!user.referralCode) {
      user.referralCode = await generateUniqueReferralCode(user.name);
      await user.save();
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Update Profile (name, mobile)
// ============================
export const updateProfile = async (req, res) => {
  try {
    const { name, mobile } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (mobile && mobile !== user.mobile) {
      if (!/^[6-9]\d{9}$/.test(mobile)) {
        return res.status(400).json({
          success: false,
          message: "Enter a valid 10-digit mobile number",
        });
      }

      // Only checked against other users of the same role — a customer
      // and an admin are allowed to share a mobile number.
      const existingMobile = await User.findOne({
        mobile,
        role: user.role,
      });

      if (existingMobile) {
        return res.status(400).json({
          success: false,
          message: "Mobile number already in use",
        });
      }

      user.mobile = mobile;
    }

    if (name) {
      user.name = name;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Update Profile Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Forgot Password
// Generates a reset token and emails the reset link to the user.
// ============================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always respond the same way whether or not the account exists —
    // a distinct "no account found" response lets an attacker enumerate
    // registered emails. Only an existing user actually gets a token/email.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

      await user.save();

      const resetUrl = `${process.env.CLIENT_URL}/reset-password/${rawToken}`;

      // Unlike every other sendEmail call site in this file, this one
      // must never let a transient send failure (Brevo blip, bad key)
      // propagate up to the outer catch — that would return a 500 only
      // when the account genuinely exists (a 200 either means no
      // account or a successful email), turning the response code
      // itself into exactly the enumeration side-channel the uniform
      // response below is meant to prevent.
      const isHindi = user.preferredLanguage === "hi";

      try {
        await sendEmail({
          to: user.email,
          subject: isHindi
            ? "अपना Mittal Collections पासवर्ड रीसेट करें"
            : "Reset your Mittal Collections password",
          html: isHindi
            ? `
            <p>नमस्ते ${escapeHtml(user.name || "")},</p>
            <p>हमें आपका पासवर्ड रीसेट करने का अनुरोध मिला है। यह लिंक 30 मिनट में समाप्त हो जाएगा।</p>
            <p><a href="${resetUrl}">अपना पासवर्ड रीसेट करें</a></p>
            <p>अगर आपने यह अनुरोध नहीं किया है, तो इस ईमेल को नज़रअंदाज़ करें।</p>
          `
            : `
            <p>Hi ${escapeHtml(user.name || "there")},</p>
            <p>We received a request to reset your password. This link expires in 30 minutes.</p>
            <p><a href="${resetUrl}">Reset your password</a></p>
            <p>If you didn't request this, you can safely ignore this email.</p>
          `,
        });
      } catch (error) {
        console.error("Forgot Password Email Error:", error);
      }
    }

    res.status(200).json({
      success: true,
      message: "If an account exists for this email, a reset link has been sent",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Reset Password
// ============================
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Reset link is invalid or has expired",
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    // Invalidates any already-issued token for this account (see User
    // model's tokenVersion comment) -- if this reset is the real owner
    // locking out someone who'd gained access via a leaked token, the
    // leaked token needs to stop working here, not just the password.
    user.tokenVersion += 1;

    await user.save();

    // Standard security-notification pattern this flow was missing
    // (block/unblock, order status, ticket replies all notify the
    // user on every other sensitive action) — if an attacker who's
    // gained some access resets the password, the real account owner
    // gets no alert otherwise. Best-effort: the password change itself
    // already succeeded by this point, so a transient email failure
    // shouldn't turn into a 500 for something that genuinely worked.
    if (user.email) {
      const isHindi = user.preferredLanguage === "hi";

      try {
        await sendEmail({
          to: user.email,
          subject: isHindi
            ? "आपका Mittal Collections पासवर्ड रीसेट कर दिया गया है"
            : "Your Mittal Collections password was reset",
          html: isHindi
            ? `
            <p>नमस्ते ${escapeHtml(user.name || "")},</p>
            <p>आपका पासवर्ड अभी "Forgot Password" लिंक से रीसेट किया गया है।</p>
            <p>अगर यह आपने किया है, तो कोई कार्रवाई करने की ज़रूरत नहीं है। अगर आपने यह नहीं किया है, तो कृपया तुरंत सपोर्ट से संपर्क करें — हो सकता है किसी और के पास आपके अकाउंट का एक्सेस हो।</p>
          `
            : `
            <p>Hi ${escapeHtml(user.name || "there")},</p>
            <p>Your password was just reset using the "Forgot Password" link.</p>
            <p>If this was you, no action is needed. If you didn't do this, please contact support immediately — someone else may have access to your account.</p>
          `,
        });
      } catch (error) {
        console.error("Reset Password Notification Email Error:", error);
      }
    }

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Change Password
// ============================
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    // Invalidates any OTHER already-issued token for this account (see
    // User model's tokenVersion comment) -- a fresh token carrying the
    // new version is issued below so the request that just made this
    // change doesn't immediately lock itself out too.
    user.tokenVersion += 1;

    await user.save();

    // Same security-notification pattern as resetPassword — the account's
    // already-known owner here (currentPassword was verified above), so
    // there's no enumeration concern, just a best-effort alert that
    // shouldn't block the (already-successful) password change.
    if (user.email) {
      const isHindi = user.preferredLanguage === "hi";

      try {
        await sendEmail({
          to: user.email,
          subject: isHindi
            ? "आपका Mittal Collections पासवर्ड बदल दिया गया है"
            : "Your Mittal Collections password was changed",
          html: isHindi
            ? `
            <p>नमस्ते ${escapeHtml(user.name || "")},</p>
            <p>आपके अकाउंट का पासवर्ड अभी बदला गया है।</p>
            <p>अगर यह आपने किया है, तो कोई कार्रवाई करने की ज़रूरत नहीं है। अगर आपने यह नहीं किया है, तो कृपया तुरंत सपोर्ट से संपर्क करें — हो सकता है किसी और के पास आपके अकाउंट का एक्सेस हो।</p>
          `
            : `
            <p>Hi ${escapeHtml(user.name || "there")},</p>
            <p>Your account password was just changed.</p>
            <p>If this was you, no action is needed. If you didn't do this, please contact support immediately — someone else may have access to your account.</p>
          `,
        });
      } catch (error) {
        console.error("Change Password Notification Email Error:", error);
      }
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
      token,
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// Logout
// ============================
// Previously there was no server-side logout at all -- the client just
// deleted its own copy of the token, so a captured/leaked JWT stayed
// fully valid for its whole 7-day life regardless of "logging out"
// (deep bug sweep, 2026-10-20). Bumping tokenVersion here invalidates
// THIS token (and every other currently-valid one for this account --
// there's no per-device session tracking, so this is account-wide) the
// next time authMiddleware checks it.
export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
