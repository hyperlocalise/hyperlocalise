import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { after } from "next/server";

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { env } from "@/lib/env";
import { getSlackBot } from "@/lib/agents/slack/bot";
import { createLogger } from "@/lib/log";

const logger = createLogger("slack-webhook");

async function verifySlackSignature(request: Request, bodyText: string): Promise<boolean> {
  const signingSecret = env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    logger.warn("missing slack signing secret");
    return false;
  }

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    logger.warn("missing slack webhook headers");
    return false;
  }

  // Prevent replay attacks by checking timestamp freshness (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 300) {
    logger.warn({ timestamp, now }, "slack webhook timestamp out of tolerance");
    return false;
  }

  const baseString = `v0:${timestamp}:${bodyText}`;
  const expectedSignature = `v0=${createHmac("sha256", signingSecret).update(baseString).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch {
    return false;
  }
}

function extractTeamId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  // Event API payloads have event.team_id or team_id
  const event = (payload as Record<string, unknown>).event;
  if (event && typeof event === "object" && event !== null) {
    const teamId = (event as Record<string, unknown>).team_id;
    if (typeof teamId === "string") {
      return teamId;
    }
  }

  const teamId = (payload as Record<string, unknown>).team_id;
  if (typeof teamId === "string") {
    return teamId;
  }

  return null;
}

async function findSlackConnector(teamId: string) {
  const connectors = await db
    .select()
    .from(schema.connectors)
    .where(eq(schema.connectors.kind, "slack"));

  return (
    connectors.find((c) => {
      const config = (c.config ?? {}) as { teamId?: string };
      return config.teamId === teamId;
    }) ?? null
  );
}

export function createSlackWebhookRoutes() {
  return new Hono().post("/", async (c) => {
    logger.info({ method: c.req.method, path: c.req.path }, "slack webhook received");

    const bodyBuffer = await c.req.raw.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);

    const verified = await verifySlackSignature(c.req.raw, bodyText);
    if (!verified) {
      logger.warn("invalid slack webhook signature");
      return c.json({ error: "invalid_signature" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      logger.warn("invalid slack webhook payload json");
      return c.json({ error: "invalid_payload" }, 400);
    }

    // Handle Slack URL verification challenge
    const challenge = (payload as Record<string, unknown>).challenge;
    if (typeof challenge === "string") {
      logger.info("responding to slack url verification challenge");
      return c.json({ challenge }, 200);
    }

    const teamId = extractTeamId(payload);
    if (!teamId) {
      logger.info("ignoring slack webhook: no team_id");
      return c.json({ ok: true, ignored: true }, 200);
    }

    const connector = await findSlackConnector(teamId);
    if (!connector) {
      logger.info({ teamId }, "ignoring slack webhook: unknown workspace");
      return c.json({ ok: true, ignored: true }, 200);
    }

    if (!connector.enabled) {
      logger.info({ teamId }, "ignoring slack webhook: workspace disabled");
      return c.json({ ok: true, ignored: true }, 200);
    }

    try {
      const bot = await getSlackBot();
      const response = await bot.webhooks.slack(
        new Request(c.req.raw.url, {
          method: c.req.raw.method,
          headers: c.req.raw.headers,
          body: bodyBuffer,
        }),
        {
          waitUntil: (task) => {
            after(() => task);
          },
        },
      );

      logger.info({ status: response.status, teamId }, "slack webhook processed");
      return response;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), teamId },
        "slack webhook processing failed",
      );
      throw error;
    }
  });
}
