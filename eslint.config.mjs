import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      "no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];
