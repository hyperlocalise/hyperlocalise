import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "hyperlocalise", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
