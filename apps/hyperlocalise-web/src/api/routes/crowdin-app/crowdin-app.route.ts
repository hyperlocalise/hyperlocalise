import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { validator } from "hono/validator";

import { badRequestResponse, unauthorizedResponse } from "@/api/response.schema";
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

const validateInstalledBody = validator("json", (value, c) => {
  const parsed = crowdinAppInstalledBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_crowdin_app_install_payload");
  }
  return parsed.data;
});

const validateUninstallBody = validator("json", (value, c) => {
  const parsed = crowdinAppUninstallBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_crowdin_app_uninstall_payload");
  }
  return parsed.data;
});

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

      const secure = c.req.url.startsWith("https://");
      c.header("Set-Cookie", buildCrowdinEmbedSessionCookie(embedToken, secure));

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
    .post("/events/installed", validateInstalledBody, async (c) => {
      const body = c.req.valid("json");
      try {
        const installationId = await upsertCrowdinAppInstallation(body);
        logger.info(
          {
            installationId,
            crowdinOrganizationId: body.organizationId,
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
    .post("/events/uninstall", validateUninstallBody, async (c) => {
      const body = c.req.valid("json");
      try {
        await deleteCrowdinAppInstallation(body);
        logger.info(
          {
            crowdinOrganizationId: body.organizationId,
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
