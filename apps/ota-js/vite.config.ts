import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    platform: "neutral",
    target: "es2020",
    dts: true,
    clean: true,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
