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
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

export type CrowdinProjectRef = {
  id: string;
  externalProviderKind?: string | null;
};

export function isCrowdinAutomationConnected(
  activeProviderKind: string | null | undefined,
): boolean {
  return activeProviderKind === "crowdin";
}

export function isCrowdinLinkedProject(project: CrowdinProjectRef) {
  if (project.externalProviderKind === "crowdin") {
    return true;
  }
  return parseProviderProjectId(project.id)?.providerKind === "crowdin";
}

export function collectCrowdinProjects<T extends CrowdinProjectRef>(
  nativeProjects: T[],
  liveProjects: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const project of [...nativeProjects, ...liveProjects]) {
    if (!isCrowdinLinkedProject(project)) {
      continue;
    }
    byId.set(project.id, project);
  }
  return [...byId.values()];
}
