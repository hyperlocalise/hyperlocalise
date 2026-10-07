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
import { buildAutomationsPath } from "@/components/app-shell/navigation-config";

export type WorkspaceAutomationEditorTab = "settings" | "history";

export const WORKSPACE_AUTOMATION_EDITOR_TAB_QUERY = "tab";

export function parseWorkspaceAutomationEditorTab(
  value: string | null | undefined,
): WorkspaceAutomationEditorTab | null {
  if (value === "settings" || value === "history") {
    return value;
  }
  return null;
}

export function buildAutomationsDetailHref(
  organizationSlug: string,
  options: {
    automationId: string;
    projectId?: string;
    tab?: WorkspaceAutomationEditorTab;
  },
) {
  const path = buildAutomationsPath(organizationSlug, {
    projectId: options.projectId,
    automationId: options.automationId,
  });
  if (options.tab && options.tab !== "settings") {
    return `${path}?${WORKSPACE_AUTOMATION_EDITOR_TAB_QUERY}=${options.tab}`;
  }
  return path;
}
