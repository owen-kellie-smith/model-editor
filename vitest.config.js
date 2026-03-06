import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.js"],
    testTimeout: 120000,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html","lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "**/modelApp.js",         // UI wiring / DOM heavy
        "**/exampleApp.js",     
        "**/graphApp.js",     
        "**/languageApp.js",     
        "**/ui.js",               // DOM refs
        "**/variableCrudApp.js",  // UI wiring / DOM heavy
        "**/spreadsheetRenderer.js", // ExcelJS shell – requires ExcelJS CDN
        "**/*.d.ts",
      ],
    },
  },
})

console.log("SETUP LOADED")
