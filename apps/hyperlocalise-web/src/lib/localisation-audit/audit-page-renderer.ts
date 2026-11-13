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

import type { HtmlPageRenderer } from "./crawl-renderer";

const logger = createLogger("localisation-audit-page-renderer");

/**
 * Renders audit pages in a Tilion cloud browser when `TILION_API_KEY` is set,
 * otherwise in a Vercel Sandbox. Falls back to the sandbox when Tilion cannot
 * start a session.
 */
export async function createAuditPageRenderer(): Promise<HtmlPageRenderer> {
  if (!env.TILION_API_KEY) {
    logger.info("tilion api key not set, rendering audit pages in sandbox");
  } else {
    const { createTilionAuditBrowserSession } = await import("./tilion-browser");
    const startedAt = performance.now();
    const tilion = await createTilionAuditBrowserSession({ apiKey: env.TILION_API_KEY });
    if (!isErr(tilion)) {
      logger.info("tilion audit browser ready", { durationMs: auditElapsedMs(startedAt) });
      return tilion.value;
    }
    const error = tilion.error;
    logger.warn("tilion audit browser unavailable, falling back to sandbox", {
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
  return createAuditBrowserSession();
}
