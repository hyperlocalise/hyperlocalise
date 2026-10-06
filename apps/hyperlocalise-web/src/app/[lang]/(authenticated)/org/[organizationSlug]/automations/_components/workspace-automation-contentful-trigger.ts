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
export type ContentfulConnectionOption = {
  id: string;
  displayName: string;
  contentTypeIds: string[];
  enabled: boolean;
};

export type ContentfulTriggerContentTypes =
  /** The automation's connection is disabled or gone, so no publish reaches it. */
  | { state: "connection_unavailable" }
  | {
      state: "ready";
      /** Content types whose publish starts a run. Empty with `any` false means none does. */
      contentTypeIds: string[];
      /** Every content type starts a run. */
      any: boolean;
      /** Saved types the connection no longer sends. A saved subset of its types is not stale. */
      staleContentTypeIds: string[];
    };

/**
 * A publish starts a run only when the connection's webhook sends it and the automation's saved
 * list accepts it. An empty list on either side lets every type through.
 */
export function resolveContentfulTriggerContentTypes(input: {
  savedContentTypeIds: readonly string[];
  connectionId: string;
  /** Empty while connections load, and then nothing is known about the automation's own. */
  connections: readonly Pick<ContentfulConnectionOption, "id" | "contentTypeIds" | "enabled">[];
}): ContentfulTriggerContentTypes {
  const saved = [...new Set(input.savedContentTypeIds)];
  if (!input.connectionId || input.connections.length === 0) {
    return {
      state: "ready",
      contentTypeIds: saved,
      any: saved.length === 0,
      staleContentTypeIds: [],
    };
  }

  const connection = input.connections.find((entry) => entry.id === input.connectionId);
  if (!connection?.enabled) {
    return { state: "connection_unavailable" };
  }

  const sent = [...new Set(connection.contentTypeIds)];
  if (saved.length === 0) {
    return {
      state: "ready",
      contentTypeIds: sent,
      any: sent.length === 0,
      staleContentTypeIds: [],
    };
  }
  if (sent.length === 0) {
    return { state: "ready", contentTypeIds: saved, any: false, staleContentTypeIds: [] };
  }

  return {
    state: "ready",
    contentTypeIds: saved.filter((contentTypeId) => sent.includes(contentTypeId)),
    any: false,
    staleContentTypeIds: saved.filter((contentTypeId) => !sent.includes(contentTypeId)),
  };
}
