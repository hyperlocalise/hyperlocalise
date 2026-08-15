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
import { delay, http, HttpResponse } from "msw";

import { createRunningAudit, createSucceededAudit } from "./localisation-audit.fixture";

export const localisationAuditProgressMswHandlers = [
  http.get("/api/localisation-audit/:domainSlug", async () => {
    await delay("infinite");
    return HttpResponse.json({
      audit: createRunningAudit({ progressStage: "crawling" }),
    });
  }),
];

export const localisationAuditUnlockMswHandlers = [
  http.post("/api/localisation-audit/:domainSlug/unlock", async () => {
    return HttpResponse.json({
      audit: createSucceededAudit(),
      delivery: {
        status: "queued",
        message: "Check your inbox for a summary of this report.",
      },
    });
  }),
];

export const localisationAuditRetryMswHandlers = [
  http.post("/api/localisation-audit", async () => {
    return HttpResponse.json({
      audit: createRunningAudit({ progressStage: "queued" }),
    });
  }),
  ...localisationAuditProgressMswHandlers,
];
