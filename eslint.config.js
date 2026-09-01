import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/**", "graphify-out/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        Blob: "readonly",
        URL: "readonly",
        caches: "readonly",
        crypto: "readonly",
        document: "readonly",
        getComputedStyle: "readonly",
        history: "readonly",
        localStorage: "readonly",
        location: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        Storage: "readonly",
        TimerHandler: "readonly",
        window: "readonly",
      },
    },
  },
);
