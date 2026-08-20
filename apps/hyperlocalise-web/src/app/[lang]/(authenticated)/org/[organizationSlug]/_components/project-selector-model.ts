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
export type ChatProjectOption = {
  id: string;
  name: string;
  source: "native" | "external_tms";
  externalProviderKind?: string | null;
};

type ProjectLike = {
  id: string;
  name: string;
  source?: "native" | "external_tms" | null;
  externalProviderKind?: string | null;
  isActive?: boolean;
};

export function buildChatProjectOptions(input: {
  nativeProjects: ProjectLike[];
  tmsProjects: ProjectLike[];
}): ChatProjectOption[] {
  const tms = input.tmsProjects
    .filter((project) => project.isActive !== false && project.id.trim().length > 0)
    .map((project) => ({
      id: project.id,
      name: project.name,
      source: "external_tms" as const,
      externalProviderKind: project.externalProviderKind ?? null,
    }));

  const native = input.nativeProjects
    .filter((project) => (project.source ?? "native") === "native" && project.id.trim().length > 0)
    .map((project) => ({
      id: project.id,
      name: project.name,
      source: "native" as const,
      externalProviderKind: null,
    }));

  return [...tms, ...native];
}

export function resolveChatProjectSelection(input: {
  projects: ChatProjectOption[];
  selectedProjectId: string;
  lockedProjectId?: string | null;
  initialProjectId?: string | null;
}) {
  if (input.lockedProjectId) {
    return input.lockedProjectId;
  }

  if (
    input.selectedProjectId &&
    input.projects.some((project) => project.id === input.selectedProjectId)
  ) {
    return input.selectedProjectId;
  }

  // Trust page context (e.g. CAT) even before the project appears in the list.
  if (input.initialProjectId) {
    return input.initialProjectId;
  }

  if (input.projects.length === 1) {
    return input.projects[0]!.id;
  }

  return "";
}

export function resolveChatProjectLabel(input: {
  projects: ChatProjectOption[];
  projectId: string;
  fallbackName?: string | null;
  placeholder: string;
}) {
  if (!input.projectId) {
    return input.placeholder;
  }

  const match = input.projects.find((project) => project.id === input.projectId);
  if (match?.name.trim()) {
    return match.name;
  }

  if (input.fallbackName?.trim()) {
    return input.fallbackName.trim();
  }

  return input.projectId;
}
