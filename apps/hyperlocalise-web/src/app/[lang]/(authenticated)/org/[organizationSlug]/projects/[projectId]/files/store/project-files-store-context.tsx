"use client";

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
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { ProjectFilesPageStore } from "./project-files-page-store";

const ProjectFilesPageStoreContext = createContext<ProjectFilesPageStore | null>(null);

export function ProjectFilesPageStoreProvider({
  organizationSlug,
  projectId,
  children,
}: {
  organizationSlug: string;
  projectId: string;
  children: ReactNode;
}) {
  const store = useMemo(
    () => new ProjectFilesPageStore(organizationSlug, projectId),
    [organizationSlug, projectId],
  );
  return (
    <ProjectFilesPageStoreContext.Provider value={store}>
      {children}
    </ProjectFilesPageStoreContext.Provider>
  );
}

export function useProjectFilesPageStore() {
  const store = useContext(ProjectFilesPageStoreContext);
  if (!store) {
    throw new Error("useProjectFilesPageStore must be used within ProjectFilesPageStoreProvider");
  }
  return store;
}
