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
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";

import { auditElapsedMs } from "./audit-log";
import { auditBrowserLogFields, type HtmlPageRenderer } from "./crawl-renderer";
import { resolveTilionApiKey, tilionApiKeyLogFields } from "./tilion-api-key";

const logger = createLogger("localisation-audit-page-renderer");

/**
 * Renders audit pages in a Tilion cloud browser when `TILION_API_KEY` is set,
 * otherwise in a Vercel Sandbox. Falls back to the sandbox when Tilion cannot
 * start a session.
 */
export async function createAuditPageRenderer(): Promise<HtmlPageRenderer> {
  const key = resolveTilionApiKey({ t3EnvValue: env.TILION_API_KEY });
  const keyFields = tilionApiKeyLogFields(key);
  logger.info("choosing audit page renderer", keyFields);

  if (!key.apiKey) {
    logger.info("tilion api key not set, rendering audit pages in sandbox", {
      ...keyFields,
      rendererKind: "sandbox",
    });
  } else {
    const { createTilionAuditBrowserSession } = await import("./tilion-browser");
    const startedAt = performance.now();
    logger.info("tilion session create starting", {
      ...keyFields,
      rendererKind: "tilion",
    });
    const tilion = await createTilionAuditBrowserSession({ apiKey: key.apiKey });
    if (!isErr(tilion)) {
      logger.info("tilion audit browser ready", {
        ...keyFields,
        ...auditBrowserLogFields(tilion.value),
        durationMs: auditElapsedMs(startedAt),
      });
      return tilion.value;
    }
    const error = tilion.error;
    logger.warn("tilion audit browser unavailable, falling back to sandbox", {
      ...keyFields,
      rendererKind: "sandbox",
      code: error.code,
      status: "status" in error ? error.status : undefined,
      stage: "stage" in error ? error.stage : undefined,
      tilionSessionId: "sessionId" in error ? error.sessionId : undefined,
      errorName: "detail" in error ? error.detail?.name : undefined,
      errorMessage: "detail" in error ? error.detail?.message : undefined,
      errorCauseCode: "detail" in error ? error.detail?.causeCode : undefined,
      durationMs: auditElapsedMs(startedAt),
    });
  }

  const { createAuditBrowserSession } = await import("./sandbox-browser");
  const sandbox = await createAuditBrowserSession();
  logger.info("sandbox audit browser selected", {
    ...keyFields,
    ...auditBrowserLogFields(sandbox),
  });
  return sandbox;
}
