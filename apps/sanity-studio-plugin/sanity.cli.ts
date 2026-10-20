import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || "placeholder",
    dataset: process.env.SANITY_STUDIO_DATASET || "production",
  },
  server: {
    port: 3333,
  },
});
