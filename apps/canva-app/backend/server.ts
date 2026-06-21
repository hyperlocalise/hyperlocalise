import express from "express";
import fs from "node:fs";
import https from "node:https";

import { createCanvaAuthMiddleware, resolveDesignId } from "./canva-auth";
import { localizeDesignWithHyperlocalise } from "./hyperlocalise-client";

const app = express();
const port = Number(process.env.CANVA_BACKEND_PORT ?? 3001);
const appId = process.env.CANVA_APP_ID;
const hyperlocaliseApiUrl =
  process.env.HYPERLOCALISE_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000/api/v1";
const hyperlocaliseApiKey = process.env.HYPERLOCALISE_API_KEY;

app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(createCanvaAuthMiddleware(appId));

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    hyperlocaliseConfigured: Boolean(hyperlocaliseApiKey),
  });
});

app.post("/api/localize", async (request, response) => {
  const { projectId, sourceLocale, targetLocales, designToken, segments } = request.body ?? {};

  if (
    typeof projectId !== "string" ||
    projectId.trim().length === 0 ||
    typeof sourceLocale !== "string" ||
    sourceLocale.trim().length === 0 ||
    !Array.isArray(targetLocales) ||
    targetLocales.length === 0 ||
    typeof designToken !== "string" ||
    designToken.trim().length === 0 ||
    !Array.isArray(segments)
  ) {
    response.status(400).json({
      error: "invalid_localize_payload",
      message: "Project, locales, design ID, and text segments are required.",
    });
    return;
  }

  const normalizedSegments = segments.filter(
    (
      segment,
    ): segment is {
      key: string;
      contentIndex: number;
      regionIndex: number;
      text: string;
    } =>
      typeof segment?.key === "string" &&
      typeof segment?.text === "string" &&
      segment.text.trim().length > 0 &&
      typeof segment?.contentIndex === "number" &&
      typeof segment?.regionIndex === "number",
  );

  if (normalizedSegments.length === 0) {
    response.status(400).json({
      error: "no_translatable_text",
      message: "Add text to the current page before localizing.",
    });
    return;
  }

  try {
    const designId = await resolveDesignId(designToken.trim(), appId);
    const result = await localizeDesignWithHyperlocalise(
      {
        apiUrl: hyperlocaliseApiUrl,
        apiKey: hyperlocaliseApiKey,
      },
      {
        projectId: projectId.trim(),
        sourceLocale: sourceLocale.trim(),
        targetLocales: targetLocales.map((locale: string) => locale.trim()).filter(Boolean),
        designId,
        segments: normalizedSegments,
      },
    );

    response.json(result);
  } catch (error) {
    response.status(502).json({
      error: "hyperlocalise_request_failed",
      message: error instanceof Error ? error.message : "Hyperlocalise request failed.",
    });
  }
});

function startServer() {
  const useHttps = process.env.SHOULD_ENABLE_HTTPS === "true";
  const certFile = process.env.HTTPS_CERT_FILE;
  const keyFile = process.env.HTTPS_KEY_FILE;

  if (useHttps && certFile && keyFile) {
    https
      .createServer(
        {
          cert: fs.readFileSync(certFile),
          key: fs.readFileSync(keyFile),
        },
        app,
      )
      .listen(port, () => {
        console.log(`Canva backend listening on https://localhost:${port}`);
      });
    return;
  }

  app.listen(port, () => {
    console.log(`Canva backend listening on http://localhost:${port}`);
  });
}

startServer();
