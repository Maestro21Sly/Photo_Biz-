import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "prisma/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    rules: {
      // The codebase leans on non-null assertions after an explicit auth or
      // existence check (req.user!.id); flagging every one is noise, not signal.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-restricted-syntax": [
        "error",
        {
          // Catches the exact class of bug this audit fixed: a secret or origin
          // silently falling back to a hardcoded default instead of failing closed.
          selector:
            "LogicalExpression[operator='||'] > MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            "Don't give process.env a fallback default here — add the variable to src/env.ts so a bad config fails at boot.",
        },
      ],
    },
  },
  {
    // src/env.ts is the one place allowed to read process.env, so the
    // no-fallback rule above would only ever fire on its own implementation.
    files: ["src/env.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // Tests deliberately require() application modules after mutating
      // process.env, which import statements can't express.
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
