import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./docs/src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html","lcov"],
      reportsDirectory: "./coverage",
    },
  },
})

console.log("SETUP LOADED")
