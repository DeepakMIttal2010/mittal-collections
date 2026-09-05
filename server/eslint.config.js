import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["uploads"]),
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Controllers deliberately catch their own errors and log with
      // console.error + a manual response, rather than calling
      // next(err) — see instrument.js/DEPLOYMENT.md for why. console
      // is also the only logging this app has anywhere.
      "no-unused-vars": ["error", { ignoreRestSiblings: true, args: "none" }],
    },
  },
]);
