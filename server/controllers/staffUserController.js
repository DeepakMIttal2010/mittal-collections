import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/User.js";
import Role from "../models/Role.js";

// This file manages admin-panel login accounts (role: "admin") —
// deliberately separate from userController.js, which manages customer
// accounts (role: "user") and is hard-scoped to that role everywhere.
// The two never collide: a staff account created here is invisible to
// the Customers admin page, and vice versa.

// ============================
// GET ALL STAFF USERS (Admin)
// ============================
export const getStaffUsers = async (req, res) => {
  try {
    const staffUsers = await User.find({ role: "admin" })
      .select("-password")
      .populate("adminRole")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      staffUsers,
    });
  } catch (error) {
    console.error("Get Staff Users Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// ADD STAFF USER (Admin)
// ============================
export const addStaffUser = async (req, res) => {
  try {
    const { name, email, mobile, password, adminRole } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // A JSON body can carry an object where a string is expected —
    // passed straight into a Mongoose query filter unchecked, that's a
    // NoSQL operator-injection vector, not a genuine email/password.
    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({ email });

    // email is globally unique on User (unlike mobile, which has a
    // role-scoped partial index specifically so one person can be both
    // a customer and an admin with the same number) — a second document
    // with the same email is impossible at the DB level regardless, and
    // more importantly the same login lookup (authController.login's
    // User.findOne({ email })) would be ambiguous if it weren't. So a
    // customer signing up for their own shop with the email they
    // already shop with (a completely normal case — confirmed as a
    // real block in production, 2026-09-10) is handled by promoting
    // their one existing account rather than rejecting it outright.
    // Already-admin accounts still can't collide.
    if (existingUser && existingUser.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // "" / undefined from the client's "Full Admin" option both mean
    // unrestricted — normalize to null (Role model default). Validating
    // the id shape before findById also closes off a NoSQL
    // operator-injection vector the same way the email check above does.
    let roleId = null;
    if (adminRole) {
      if (!mongoose.Types.ObjectId.isValid(adminRole)) {
        return res.status(400).json({
          success: false,
          message: "Selected role not found",
        });
      }
      const role = await Role.findById(adminRole);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: "Selected role not found",
        });
      }
      roleId = role._id;
    }

    if (existingUser) {
      // Promote in place — their existing password keeps working for
      // both their shopping account and admin login, so the password
      // typed into this form is deliberately not applied here. Name/
      // mobile are left untouched too, for the same reason: this is
      // their own customer profile, not a fresh identity to overwrite.
      existingUser.role = "admin";
      existingUser.adminRole = roleId;
      await existingUser.save();

      return res.status(200).json({
        success: true,
        message:
          "This email already had a customer account — it's been promoted to admin access. Their existing password still works; the password entered here was not applied.",
        staffUser: {
          id: existingUser._id,
          name: existingUser.name,
          email: existingUser.email,
          mobile: existingUser.mobile,
          adminRole: roleId,
          isBlocked: existingUser.isBlocked,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const staffUser = await User.create({
      name,
      email,
      mobile: mobile || undefined,
      password: hashedPassword,
      role: "admin",
      // The owner is directly creating and vouching for this account —
      // same reasoning as e2e's createTestAdmin fixture — no separate
      // OTP/invite flow needed.
      emailVerified: true,
      adminRole: roleId,
    });

    res.status(201).json({
      success: true,
      message: "Staff user added successfully",
      staffUser: {
        id: staffUser._id,
        name: staffUser.name,
        email: staffUser.email,
        mobile: staffUser.mobile,
        adminRole: roleId,
        isBlocked: staffUser.isBlocked,
      },
    });
  } catch (error) {
    console.error("Add Staff User Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE STAFF USER (Admin)
// ============================
export const updateStaffUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You can't change your own access here.",
      });
    }

    const staffUser = await User.findById(req.params.id);

    if (!staffUser || staffUser.role !== "admin") {
      return res.status(404).json({
        success: false,
        message: "Staff user not found",
      });
    }

    const { name, adminRole, isBlocked } = req.body;

    if (name) staffUser.name = name;

    if (adminRole !== undefined) {
      if (adminRole) {
        if (!mongoose.Types.ObjectId.isValid(adminRole)) {
          return res.status(400).json({
            success: false,
            message: "Selected role not found",
          });
        }
        const role = await Role.findById(adminRole);
        if (!role) {
          return res.status(400).json({
            success: false,
            message: "Selected role not found",
          });
        }
        staffUser.adminRole = role._id;
      } else {
        staffUser.adminRole = null;
      }
    }

    if (isBlocked !== undefined) staffUser.isBlocked = isBlocked;

    await staffUser.save();

    res.status(200).json({
      success: true,
      message: "Staff user updated successfully",
    });
  } catch (error) {
    console.error("Update Staff User Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE STAFF USER (Admin)
// ============================
export const deleteStaffUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You can't delete your own account.",
      });
    }

    const staffUser = await User.findById(req.params.id);

    if (!staffUser || staffUser.role !== "admin") {
      return res.status(404).json({
        success: false,
        message: "Staff user not found",
      });
    }

    await staffUser.deleteOne();

    res.status(200).json({
      success: true,
      message: "Staff user deleted successfully",
    });
  } catch (error) {
    console.error("Delete Staff User Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
