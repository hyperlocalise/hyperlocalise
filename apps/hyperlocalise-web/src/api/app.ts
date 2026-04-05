import { Hono } from "hono";

import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";

export const app = new Hono()
  .basePath("/api")
  .route("/health", healthRoutes)
  .route("/auth", authRoutes);

export type AppType = typeof app;
