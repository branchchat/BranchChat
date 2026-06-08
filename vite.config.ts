/// <reference types="vitest/config" />
import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Pure-logic unit tests run in Node (fast); DOM/component tests opt into
    // jsdom per-file via a `// @vitest-environment jsdom` docblock. The `@`
    // alias above is reused by tests.
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
