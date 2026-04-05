import { Hono } from "hono";

import { healthRoutes } from "./routes/health";

export const api = new Hono().basePath("/api");

api.route("/health", healthRoutes);
