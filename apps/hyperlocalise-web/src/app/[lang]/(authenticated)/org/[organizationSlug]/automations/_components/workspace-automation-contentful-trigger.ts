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

export type ContentfulTriggerContentTypes = {
  /** Content types whose publish starts a run. Empty with `any` false means none does. */
  contentTypeIds: string[];
  /** Every content type starts a run. */
  any: boolean;
  /** The automation's saved list no longer equals the connection's, so it can be brought in line. */
  differsFromConnection: boolean;
};

/**
 * A publish starts a run only when the connection's webhook sends it and the automation's saved
 * list accepts it. An empty list on either side lets every type through.
 */
export function resolveContentfulTriggerContentTypes(input: {
  savedContentTypeIds: readonly string[];
  /** Undefined while connections load, or when the automation's connection is gone. */
  connection: Pick<ContentfulConnectionOption, "contentTypeIds"> | undefined;
}): ContentfulTriggerContentTypes {
  const saved = [...new Set(input.savedContentTypeIds)];
  if (!input.connection) {
    return { contentTypeIds: saved, any: saved.length === 0, differsFromConnection: false };
  }

  const sent = [...new Set(input.connection.contentTypeIds)];
  if (saved.length === 0) {
    return { contentTypeIds: sent, any: sent.length === 0, differsFromConnection: false };
  }

  const differsFromConnection =
    saved.length !== sent.length || saved.some((contentTypeId) => !sent.includes(contentTypeId));
  if (sent.length === 0) {
    return { contentTypeIds: saved, any: false, differsFromConnection };
  }

  return {
    contentTypeIds: saved.filter((contentTypeId) => sent.includes(contentTypeId)),
    any: false,
    differsFromConnection,
  };
}
