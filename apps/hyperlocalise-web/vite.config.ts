import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  fmt: {
    exclude: ["**/drizzle/**"],
  },
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    server: {
      deps: {
        inline: ["@workos-inc/authkit-nextjs"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "next/cache": path.resolve(rootDir, "node_modules/next/cache.js"),
      "next/headers": path.resolve(rootDir, "node_modules/next/headers.js"),
      "next/navigation": path.resolve(rootDir, "node_modules/next/navigation.js"),
    },
  },
});
