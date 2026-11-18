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
import { createContext, use } from "react";

/**
 * What the editor offers someone who is here through a task they own and not through the
 * project's team: a vendor, or a member given a task outside their teams. The service refuses
 * them everything about the project itself, so the parts of the editor that would ask for it
 * read this and stay out of the way instead of showing an error.
 */
export type ContentEditorTaskScope = {
  /** True for a person here through a task. */
  taskScoped: boolean;
  /** False on a post-edit task for a vendor, who edits but does not approve. */
  canApprove: boolean;
};

const ContentEditorTaskScopeContext = createContext<ContentEditorTaskScope>({
  taskScoped: false,
  canApprove: true,
});

export const ContentEditorTaskScopeProvider = ContentEditorTaskScopeContext.Provider;

export function useContentEditorTaskScope(): ContentEditorTaskScope {
  return use(ContentEditorTaskScopeContext);
}
