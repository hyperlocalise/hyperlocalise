import { Hono } from "hono";
import { serve } from "inngest/hono";

import { functions, inngest } from "@/lib/inngest";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { projectRoutes } from "./routes/project/project.route";

export const app = new Hono()
  .basePath("/api")
  .on(
    ["GET", "PUT", "POST"],
    "/inngest",
    serve({
      client: inngest,
      functions,
    }),
  )
  .route("/health", healthRoutes)
  .route("/auth", authRoutes)
  .route("/project", projectRoutes);

export type AppType = typeof app;
