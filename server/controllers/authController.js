import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import User from "../models/User.js";
import { sendEmail } from "../config/mailer.js";
import { generateUniqueReferralCode } from "../utils/referral.js";
import { createAndSendOtp, verifyOtp } from "../utils/otp.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

// Step 1 of registration: validates the submitted details, then emails
// a code instead of creating the account directly. Nothing is written
// to the User collection until the code is confirmed via
// verifyRegisterOtp — this is what makes the email "verified" at
// signup rather than just collected.
export const register = async (req, res) => {
  try {
    const { name, email, mobile, password, referralCode } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existingUser = await User.findOne({ email });

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
      target: email,
      purpose: "register",
      payload: {
        name,
        email,
        mobile,
        hashedPassword,
        referredById: referrer?._id || null,
      },
    });

    res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
      email,
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

    const result = await verifyOtp({
      target: email.toLowerCase().trim(),
      purpose: "register",
      code: otp,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    const { name, mobile, hashedPassword, referredById } = result.payload;

    // Someone could have registered with this email/mobile via another
    // path (e.g. Google sign-in) while this code was pending — re-check
    // rather than let a stale payload create a duplicate.
    const existingUser = await User.findOne({ email });
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
      email,
      mobile,
      password: hashedPassword,
      emailVerified: true,
      referralCode: newReferralCode,
      referredBy: referredById || null,
    });

    try {
      await sendEmail({
        to: user.email,
        subject: "Welcome to Mittal Collections!",
        html: `
          <p>Hi ${user.name},</p>
          <p>Welcome to Mittal Collections! Your account has been created successfully.</p>
          <p>Explore premium bedsheets, towels, curtains, pillows and more at
          <a href="${process.env.CLIENT_URL}">mittalcollections.com</a>.</p>
        `,
      });
    } catch (error) {
      console.error("Welcome Email Error:", error);
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        referralCode: user.referralCode,
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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Your account has been blocked. Please contact support.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
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
      user = await User.findOne({ email: payload.email });

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
            subject: "Welcome to Mittal Collections!",
            html: `
              <p>Hi ${user.name},</p>
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
      { id: user._id, role: user.role },
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

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

    await user.save();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your Mittal Collections password",
      html: `
        <p>Hi ${user.name || "there"},</p>
        <p>We received a request to reset your password. This link expires in 30 minutes.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });

    res.status(200).json({
      success: true,
      message: "Reset link sent to your email",
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

    await user.save();

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

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
