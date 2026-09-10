import bcrypt from "bcryptjs";

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

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // "" / undefined from the client's "Full Admin" option both mean
    // unrestricted — normalize to null (Role model default).
    let roleId = null;
    if (adminRole) {
      const role = await Role.findById(adminRole);
      if (!role) {
        return res.status(400).json({
          success: false,
          message: "Selected role not found",
        });
      }
      roleId = role._id;
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
