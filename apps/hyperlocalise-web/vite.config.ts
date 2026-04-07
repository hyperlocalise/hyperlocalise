import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fmt: {
    exclude: ["**/drizzle/**"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
});
