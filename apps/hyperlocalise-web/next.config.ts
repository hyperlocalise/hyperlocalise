import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

import { AGENT_MARKDOWN_TRACE_GLOB } from "./src/agents/_runtime/paths";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    viewTransition: true,
  },
  // Agent prompts load from src/agents/**/*.md at runtime via process.cwd() (see paths.ts).
  outputFileTracingIncludes: {
    "/*": [AGENT_MARKDOWN_TRACE_GLOB, "_posts/**/*.md"],
  },
  async headers() {
    return [
      {
        source: "/crowdin-app/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://crowdin.com https://*.crowdin.com https://crowdin.cloud https://*.crowdin.cloud;",
          },
        ],
      },
    ];
  },
};

export default withWorkflow(nextConfig);
