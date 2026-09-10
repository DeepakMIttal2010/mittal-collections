import mongoose from "mongoose";

import { PERMISSION_KEYS } from "../config/adminPermissions.js";

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
  },
  {
    timestamps: true,
  },
);

const Role = mongoose.model("Role", roleSchema);

export default Role;
