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
import { FatalError, getWorkflowMetadata } from "workflow";

import type { LocalisationAuditRunEventData } from "@/lib/workflow/types";

import { runLocalisationAuditStep } from "./steps/localisation-audit";

export async function localisationAuditRunWorkflow(event: LocalisationAuditRunEventData) {
  "use workflow";

  getWorkflowMetadata();
  const result = await runLocalisationAuditStep(event);
  if (result.ok) {
    return result.audit;
  }
  if (result.fatal) {
    throw new FatalError(result.message);
  }
  throw new Error(result.message);
}
