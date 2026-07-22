/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "server-only";

import { mergeWorkspaceTemplateSkills } from "@/agents/automations/workspace/agent/workspace-template-manifest";

import { WORKSPACE_AUTOMATION_TEMPLATES_BASE } from "./workspace-automation-templates";

export function getMergedWorkspaceAutomationTemplates() {
  return mergeWorkspaceTemplateSkills(WORKSPACE_AUTOMATION_TEMPLATES_BASE);
}
