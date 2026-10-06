import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/User.js";
import Role from "../models/Role.js";
import { hasAdminPermission } from "../utils/adminAccess.js";
import { isSubsetOfCallerAccess } from "../utils/rbacSubset.js";

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

    // User.js lowercases email on save — a same-email-different-case
    // account previously slipped past this pre-check (a raw, unnormalized
    // `email`) and hit the schema's unique index instead, surfacing as an
    // uncaught 11000 in the generic catch below rather than this friendly
    // message. Matches authController.js's register() normalization.
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
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

      // Same escalation this file's adminRole:null branch already
      // guards against, via a different door: a restricted staff
      // account could otherwise assign an existing Role broader than
      // its own access (e.g. one it just created via addRole) to a new
      // staff account instead of granting literal Full Admin — see
      // rbacSubset.js.
      if (
        !isSubsetOfCallerAccess(req.user, {
          permissions: role.permissions,
          writeAccess: role.writeAccess,
        })
      ) {
        return res.status(403).json({
          success: false,
          message: "You can't assign a role with permissions you don't have yourself.",
        });
      }

      roleId = role._id;
    } else if (!hasAdminPermission(req.user, "roles")) {
      // Granting "Full Admin" (no role = unrestricted access, see
      // requirePermission.js) is equivalent to granting every permission
      // there is, including ones this caller doesn't hold themselves —
      // require the same "roles" permission Roles & Permissions itself
      // is gated behind, so "staff-users" alone can't mint a backdoor
      // full-admin account.
      return res.status(403).json({
        success: false,
        message: "You don't have permission to create a Full Admin account.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const staffUser = await User.create({
      name,
      email: normalizedEmail,
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
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    console.error("Add Staff User Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// A caller can only act on a target staff account whose own access is no
// broader than the caller's — otherwise a narrowly-permissioned staff
// account (e.g. holding only "staff-users") could block or delete a more
// privileged account, including a Full Admin. Unlike addStaffUser/
// updateStaffUser's adminRole branch (which only guards *assigning* a
// role), this guards acting on an EXISTING account by its current role.
const canActOnStaffTarget = (caller, targetStaffUser) => {
  if (!caller.adminRole) return true; // full/unrestricted admin
  if (!targetStaffUser.adminRole) return false; // target is a Full Admin
  return isSubsetOfCallerAccess(caller, {
    permissions: targetStaffUser.adminRole.permissions,
    writeAccess: targetStaffUser.adminRole.writeAccess,
  });
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

    const staffUser = await User.findById(req.params.id).populate("adminRole");

    if (!staffUser || staffUser.role !== "admin") {
      return res.status(404).json({
        success: false,
        message: "Staff user not found",
      });
    }

    if (!canActOnStaffTarget(req.user, staffUser)) {
      return res.status(403).json({
        success: false,
        message: "You can't modify a staff account with more access than your own.",
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

        // Same escalation guard as addStaffUser — re-roling an
        // *existing* staff account to a broader Role than the caller
        // holds themselves is the same gap either way.
        if (
          !isSubsetOfCallerAccess(req.user, {
            permissions: role.permissions,
            writeAccess: role.writeAccess,
          })
        ) {
          return res.status(403).json({
            success: false,
            message: "You can't assign a role with permissions you don't have yourself.",
          });
        }

        staffUser.adminRole = role._id;
      } else if (!hasAdminPermission(req.user, "roles")) {
        // Same gate as addStaffUser — removing another staff account's
        // role restriction makes it a full/unrestricted admin, which
        // "staff-users" permission alone shouldn't be able to grant.
        return res.status(403).json({
          success: false,
          message: "You don't have permission to grant Full Admin access.",
        });
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

    const staffUser = await User.findById(req.params.id).populate("adminRole");

    if (!staffUser || staffUser.role !== "admin") {
      return res.status(404).json({
        success: false,
        message: "Staff user not found",
      });
    }

    if (!canActOnStaffTarget(req.user, staffUser)) {
      return res.status(403).json({
        success: false,
        message: "You can't delete a staff account with more access than your own.",
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
