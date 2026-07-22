/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";

import { badRequestResponse, type JsonContext, unauthorizedResponse } from "@/api/response.schema";
import { verifyCrowdinAppEventSignature } from "@/lib/crowdin-app/event-signature";
import { buildCrowdinAppFrameAncestorsCsp } from "@/lib/crowdin-app/frame-ancestors";
import {
  buildCrowdinEmbedSessionCookie,
  mintCrowdinEmbedSessionToken,
} from "@/lib/crowdin-app/embed-session";
import {
  deleteCrowdinAppInstallation,
  upsertCrowdinAppInstallation,
} from "@/lib/crowdin-app/installations";
import { verifyCrowdinAppJwt } from "@/lib/crowdin-app/jwt";
import { resolveCrowdinAppContext } from "@/lib/crowdin-app/resolve-context";
import { createLogger } from "@/lib/log";

import {
  crowdinAppInstalledBodySchema,
  crowdinAppSessionBodySchema,
  crowdinAppUninstallBodySchema,
} from "./crowdin-app.schema";

const logger = createLogger("crowdin-app-route");

const crowdinAppFrameHeaders = createMiddleware(async (c, next) => {
  await next();
  c.res.headers.delete("X-Frame-Options");
  c.res.headers.set("Content-Security-Policy", buildCrowdinAppFrameAncestorsCsp());
});

const validateSessionBody = validator("json", (value, c) => {
  const parsed = crowdinAppSessionBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_crowdin_app_session_payload");
  }
  return parsed.data;
});

async function readVerifiedCrowdinAppEventBody(
  c: JsonContext & {
    req: {
      text(): Promise<string>;
      header(name: string): string | undefined;
    };
  },
) {
  const rawBody = await c.req.text();
  const verified = verifyCrowdinAppEventSignature({
    rawBody,
    contentChecksumHeader: c.req.header("x-crowdin-content-checksum"),
    signatureHeader: c.req.header("x-crowdin-signature"),
  });
  if ("error" in verified) {
    return {
      errorResponse: unauthorizedResponse(
        c,
        verified.error,
        "Crowdin App event signature is invalid.",
      ),
    };
  }

  try {
    return { rawBody, json: JSON.parse(rawBody) as unknown };
  } catch {
    return {
      errorResponse: badRequestResponse(c, "invalid_crowdin_app_event_payload"),
    };
  }
}

export function createCrowdinAppRoutes() {
  return new Hono()
    .use("*", crowdinAppFrameHeaders)
    .post("/session", validateSessionBody, async (c) => {
      const body = c.req.valid("json");
      const claims = verifyCrowdinAppJwt(body.jwtToken);
      if ("error" in claims) {
        return unauthorizedResponse(c, claims.error, "Crowdin App JWT is invalid.");
      }

      const resolved = await resolveCrowdinAppContext(claims);
      if ("error" in resolved) {
        return c.json({ error: resolved.error }, 403);
      }

      const embedToken = mintCrowdinEmbedSessionToken({
        hlUserId: resolved.userId,
        hlOrganizationId: resolved.organizationId,
        hlOrganizationSlug: resolved.organizationSlug,
        hlProjectId: resolved.projectId,
        crowdinUserId: resolved.crowdinUserId,
        crowdinOrganizationId: resolved.crowdinOrganizationId,
        crowdinProjectId: resolved.crowdinProjectId,
      });

      c.header("Set-Cookie", buildCrowdinEmbedSessionCookie(embedToken));

      return c.json(
        {
          session: {
            embedToken,
            organizationSlug: resolved.organizationSlug,
            organizationName: resolved.organizationName,
            projectId: resolved.projectId,
            projectName: resolved.projectName,
            user: {
              id: resolved.userId,
              email: resolved.userEmail,
            },
          },
        },
        200,
      );
    })
    .post("/events/installed", async (c) => {
      const verified = await readVerifiedCrowdinAppEventBody(c);
      if ("errorResponse" in verified) {
        return verified.errorResponse;
      }

      const parsed = crowdinAppInstalledBodySchema.safeParse(verified.json);
      if (!parsed.success) {
        return badRequestResponse(c, "invalid_crowdin_app_install_payload");
      }

      try {
        const installationId = await upsertCrowdinAppInstallation(parsed.data);
        logger.info(
          {
            installationId,
            crowdinOrganizationId: parsed.data.organizationId,
          },
          "crowdin app installation saved",
        );
        return c.json({ ok: true }, 200);
      } catch (error) {
        logger.warn(
          {
            code: error instanceof Error ? error.message : "install_failed",
          },
          "crowdin app installation failed",
        );
        return badRequestResponse(c, "crowdin_app_install_failed");
      }
    })
    .post("/events/uninstall", async (c) => {
      const verified = await readVerifiedCrowdinAppEventBody(c);
      if ("errorResponse" in verified) {
        return verified.errorResponse;
      }

      const parsed = crowdinAppUninstallBodySchema.safeParse(verified.json);
      if (!parsed.success) {
        return badRequestResponse(c, "invalid_crowdin_app_uninstall_payload");
      }

      try {
        await deleteCrowdinAppInstallation(parsed.data);
        logger.info(
          {
            crowdinOrganizationId: parsed.data.organizationId,
          },
          "crowdin app installation removed",
        );
        return c.json({ ok: true }, 200);
      } catch (error) {
        logger.warn(
          {
            code: error instanceof Error ? error.message : "uninstall_failed",
          },
          "crowdin app uninstall failed",
        );
        return badRequestResponse(c, "crowdin_app_uninstall_failed");
      }
    });
}
