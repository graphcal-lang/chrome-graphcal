import { defineConfig } from "vite-plus";

/**
 * The extension is one service worker. `dist/` is what Chrome loads
 * (unpacked) and what is zipped for the Web Store: the manifest and icons
 * come from `public/`, the worker from `src/background.ts`.
 */
export default defineConfig({
  build: {
    target: "es2023",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: { background: "src/background.ts" },
      output: { entryFileNames: "[name].js", format: "es" },
    },
  },
  test: { include: ["src/**/*.test.ts"] },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
