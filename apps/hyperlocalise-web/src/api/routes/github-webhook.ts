import { createHmac, timingSafeEqual } from "node:crypto";

import { Hono } from "hono";
import { z } from "zod";

import { env } from "@/lib/env";

const githubWebhookPayloadSchema = z.record(z.string(), z.unknown());

function verifyGitHubWebhookSignature(input: {
  body: string;
  signatureHeader: string | null | undefined;
  secret: string;
}): boolean {
  if (!input.signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac("sha256", input.secret).update(input.body, "utf8").digest("hex")}`;
  const providedBuffer = Buffer.from(input.signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseGitHubWebhookPayload(body: string, contentType: string | null | undefined): unknown {
  if (contentType?.toLowerCase().includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    const payload = params.get("payload");

    if (!payload) {
      throw new Error("missing_form_payload");
    }

    return JSON.parse(payload) as unknown;
  }

  return JSON.parse(body) as unknown;
}

export const githubWebhookRoutes = new Hono().post("/", async (c) => {
  if (!env.GITHUB_APP_WEBHOOK_SECRET) {
    return c.json({ error: "github_webhook_not_configured" }, 503);
  }

  const body = await c.req.text();

  const isValid = verifyGitHubWebhookSignature({
    body,
    signatureHeader: c.req.header("x-hub-signature-256"),
    secret: env.GITHUB_APP_WEBHOOK_SECRET,
  });

  if (!isValid) {
    return c.json({ error: "invalid_signature" }, 401);
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = parseGitHubWebhookPayload(body, c.req.header("content-type"));
  } catch {
    return c.json({ error: "invalid_payload" }, 400);
  }

  const parseResult = githubWebhookPayloadSchema.safeParse(parsedPayload);

  if (!parseResult.success) {
    return c.json({ error: "invalid_payload" }, 400);
  }

  const githubEvent = c.req.header("x-github-event");

  switch (githubEvent) {
    case "installation":
      // TODO: Sync GitHub App installation records when installation events are needed.
      break;
    case "installation_repositories":
      // TODO: Track repository access changes for existing installations.
      break;
    case "marketplace_purchase":
      // TODO: Handle Marketplace purchase state changes if this app is listed on GitHub Marketplace.
      break;
    case "pull_request":
      // TODO: React to pull request activity after the app starts processing repo events.
      break;
    default:
      // TODO: Decide which additional GitHub webhook events should be handled here.
      break;
  }

  return c.json(
    {
      ok: true,
      deliveryId: c.req.header("x-github-delivery") ?? null,
      event: githubEvent ?? null,
    },
    200,
  );
});
