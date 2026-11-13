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
import type { PushLocaleProgressRow } from "@/lib/projects/locale-progress/push-translation-progress";

/**
 * Client-safe Webflow push shapes and path predicates. This module must stay
 * free of server-only imports (database, node builtins): the content-editor
 * push button runs in the browser and imports from here.
 */
export type WebflowPushItem = {
  documentId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export function isWebflowJsonSourcePath(sourcePath: string): boolean {
  return sourcePath.startsWith("webflow/") && sourcePath.endsWith(".json");
}
