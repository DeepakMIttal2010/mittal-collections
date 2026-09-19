import mongoose from "mongoose";

import { PERMISSION_KEYS, GRANULAR_MODULES } from "../config/adminPermissions.js";

const WRITE_ACCESS_KEYS = GRANULAR_MODULES.flatMap((module) =>
  module.actions.map((action) => `${module.key}:${action}`),
);

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      unique: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // Which admin sections a user with this role can access — keys from
    // config/adminPermissions.js's PERMISSION_KEYS. Validated here too
    // (not just at the controller) so a stray/renamed key never silently
    // becomes unreachable dead weight in a saved role.
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((key) => PERMISSION_KEYS.includes(key)),
        message: "Unknown permission key",
      },
    },

    // A second, additive right on top of `permissions` (View) — only
    // meaningful for the handful of sections in GRANULAR_MODULES.
    // Entries are "<moduleKey>:<action>", e.g. "products:new". See
    // config/adminPermissions.js for the full rationale.
    writeAccess: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((key) => WRITE_ACCESS_KEYS.includes(key)),
        message: "Unknown write-access key",
      },
    },
  },
  {
    timestamps: true,
  },
);

const Role = mongoose.model("Role", roleSchema);

export default Role;
