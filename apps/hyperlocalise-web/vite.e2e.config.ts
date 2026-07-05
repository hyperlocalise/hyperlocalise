import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/e2e/**/*.e2e.ts"],
    testTimeout: 30_000,
  },
});
