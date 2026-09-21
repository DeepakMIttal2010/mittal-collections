import Role from "../models/Role.js";
import User from "../models/User.js";
import { PERMISSION_KEYS, GRANULAR_MODULES } from "../config/adminPermissions.js";
import { isSubsetOfCallerAccess } from "../utils/rbacSubset.js";

const WRITE_ACCESS_KEYS = GRANULAR_MODULES.flatMap((module) =>
  module.actions.map((action) => `${module.key}:${action}`),
);

// ============================
// GET ALL ROLES (Admin)
// ============================
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find().sort({ name: 1 });

    res.status(200).json({
      success: true,
      roles,
    });
  } catch (error) {
    console.error("Get Roles Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

const cleanPermissions = (permissions) =>
  Array.isArray(permissions)
    ? permissions.filter((key) => PERMISSION_KEYS.includes(key))
    : [];

const cleanWriteAccess = (writeAccess) =>
  Array.isArray(writeAccess)
    ? writeAccess.filter((key) => WRITE_ACCESS_KEYS.includes(key))
    : [];

// ============================
// ADD ROLE (Admin)
// ============================
export const addRole = async (req, res) => {
  try {
    const { name, description, permissions, writeAccess } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    const cleanedPermissions = cleanPermissions(permissions);
    const cleanedWriteAccess = cleanWriteAccess(writeAccess);

    // Closes the escalation path a restricted staff account (one
    // holding just the "roles" permission) would otherwise have: mint
    // a Role with every permission/writeAccess key, then assign it to
    // a puppet staff account via addStaffUser — see rbacSubset.js.
    if (
      !isSubsetOfCallerAccess(req.user, {
        permissions: cleanedPermissions,
        writeAccess: cleanedWriteAccess,
      })
    ) {
      return res.status(403).json({
        success: false,
        message: "You can't grant permissions you don't have yourself.",
      });
    }

    const role = await Role.create({
      name,
      description: description || "",
      permissions: cleanedPermissions,
      writeAccess: cleanedWriteAccess,
    });

    res.status(201).json({
      success: true,
      message: "Role added successfully",
      role,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A role with this name already exists",
      });
    }

    console.error("Add Role Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// UPDATE ROLE (Admin)
// ============================
export const updateRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Mirrors staffUserController.js's "can't change your own access"
    // guard, one level removed: a staff account restricted to only the
    // "roles" permission could otherwise edit the very Role document
    // it's currently assigned, granting itself every permission and
    // write-access key — req.user.adminRole is the live, populated Role
    // doc for the requester (null for a full/unrestricted admin, who is
    // allowed to edit any role including their own if they have one).
    if (
      req.user.adminRole &&
      req.params.id === req.user.adminRole._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message: "You can't change your own role's access here.",
      });
    }

    const { name, description, permissions, writeAccess } = req.body;

    if (name) role.name = name;
    if (description !== undefined) role.description = description;

    const nextPermissions =
      permissions !== undefined ? cleanPermissions(permissions) : role.permissions;
    const nextWriteAccess =
      writeAccess !== undefined ? cleanWriteAccess(writeAccess) : role.writeAccess;

    // Same escalation path as addRole, via editing an existing role
    // (including one already assigned to other staff accounts) instead
    // of creating a new one — see rbacSubset.js.
    if (
      (permissions !== undefined || writeAccess !== undefined) &&
      !isSubsetOfCallerAccess(req.user, {
        permissions: nextPermissions,
        writeAccess: nextWriteAccess,
      })
    ) {
      return res.status(403).json({
        success: false,
        message: "You can't grant permissions you don't have yourself.",
      });
    }

    role.permissions = nextPermissions;
    role.writeAccess = nextWriteAccess;

    await role.save();

    res.status(200).json({
      success: true,
      message: "Role updated successfully",
      role,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "A role with this name already exists",
      });
    }

    console.error("Update Role Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ============================
// DELETE ROLE (Admin)
// ============================
export const deleteRole = async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Deleting a role out from under an assigned staff account would
    // either silently make them a full admin (adminRole becomes an
    // orphaned/missing ref, which requirePermission.js treats as
    // unrestricted) or, if handled the other way, lock them out
    // entirely — neither is a safe default, so refuse instead and let
    // the owner reassign them first.
    const assignedCount = await User.countDocuments({ adminRole: role._id });

    if (assignedCount > 0) {
      return res.status(400).json({
        success: false,
        message: `${assignedCount} staff account${assignedCount === 1 ? "" : "s"} use${assignedCount === 1 ? "s" : ""} this role — reassign them first.`,
      });
    }

    await role.deleteOne();

    res.status(200).json({
      success: true,
      message: "Role deleted successfully",
    });
  } catch (error) {
    console.error("Delete Role Error:", error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
