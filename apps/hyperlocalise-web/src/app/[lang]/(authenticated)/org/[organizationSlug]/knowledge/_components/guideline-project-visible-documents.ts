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

import type { GuidelineDocument } from "@/lib/go-svc/go-svc-guidelines-api";

/**
 * Project lists are server-filtered via ?project=; the client filter is only
 * applied once assignment metadata is loaded so we do not hide rows while
 * `assignedIdsByDocument` is still empty.
 */
export function filterProjectVisibleGuidelineDocuments(
  documents: GuidelineDocument[],
  projectId: string,
  assignedIdsByDocument: Map<string, string[]>,
  assignmentsReady: boolean,
): GuidelineDocument[] {
  if (!assignmentsReady) {
    return documents;
  }
  return documents.filter(
    (document) =>
      document.isGlobal || (assignedIdsByDocument.get(document.id) ?? []).includes(projectId),
  );
}
