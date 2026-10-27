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
import type { CrowdinApiClient } from "@/lib/providers/adapters/crowdin/crowdin-api";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

/** Hidden strings scanned to find candidate files. Files past the cap stay unflagged. */
export const CROWDIN_HIDDEN_FILE_SCAN_MAX_STRINGS = 5_000;
const CROWDIN_HIDDEN_FILE_PROBE_CONCURRENCY = 5;

/**
 * Returns the Crowdin file ids whose strings are all hidden.
 *
 * Crowdin files carry no hidden flag; a file is hidden from translators when every
 * string in it is hidden. Only files that own at least one hidden string are probed
 * for a visible string, so the cost tracks the number of hidden strings, not files.
 * Pass `fileIds` to only probe those files.
 */
export async function findCrowdinHiddenFileIds(
  client: Pick<CrowdinApiClient, "listSourceStrings">,
  projectId: number,
  fileIds?: readonly number[],
): Promise<Set<number>> {
  const listedFileIds = fileIds ? new Set(fileIds) : null;
  if (listedFileIds?.size === 0) {
    return new Set();
  }

  const hiddenStrings = await client.listSourceStrings(projectId, {
    croql: "is hidden",
    maxItems: CROWDIN_HIDDEN_FILE_SCAN_MAX_STRINGS,
  });
  const candidateFileIds = [
    ...new Set(
      hiddenStrings.flatMap((sourceString) =>
        sourceString.fileId !== null && (!listedFileIds || listedFileIds.has(sourceString.fileId))
          ? [sourceString.fileId]
          : [],
      ),
    ),
  ];

  const probed = await mapWithConcurrency(
    candidateFileIds,
    CROWDIN_HIDDEN_FILE_PROBE_CONCURRENCY,
    async (fileId) => {
      const visibleStrings = await client.listSourceStrings(projectId, {
        croql: `id of file = ${fileId} and not is hidden`,
        maxItems: 1,
      });
      return visibleStrings.length === 0 ? fileId : null;
    },
  );

  return new Set(probed.filter((fileId): fileId is number => fileId !== null));
}
