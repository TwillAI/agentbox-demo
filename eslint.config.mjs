import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored AI Elements components target a different @base-ui/react major
    // than the one installed via shadcn. They ship with their own typecheck
    // and lint noise; each file also carries a `// @ts-nocheck` pragma so the
    // rest of the codebase can still be strictly typechecked at build time.
    "components/ai-elements/**",
  ]),
]);

export default eslintConfig;
