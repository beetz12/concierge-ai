import globals from "globals";
import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["*.config.js", "*.config.cjs", "scripts/**"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
