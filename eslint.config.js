import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "dist-forge/**", "node_modules/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "src/**/*.{ts,tsx}",
      "apps/**/*.{ts,tsx}",
      "tests/**/*.ts",
      "api/**/*.ts",
    ],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ["src/hexari/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../forge",
                "../forge/**",
                "../../forge",
                "../../forge/**",
              ],
              message: "Use shared modules instead of depending on Forge.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/forge/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../hexari",
                "../hexari/**",
                "../../hexari",
                "../../hexari/**",
              ],
              message: "Forge must remain independently buildable.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../forge", "../forge/**", "../hexari", "../hexari/**"],
              message: "Shared modules must not depend on either app.",
            },
          ],
        },
      ],
    },
  },
];
