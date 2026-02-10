import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./docs/src"),
    },
  },
  test: {
    setupFiles: ["./tests/setup.js"],
  },
})

console.log("SETUP LOADED")
