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
import { describe, expect, it } from "vite-plus/test";

import { isCatQueueGroup, isCatQueueSegmentRow } from "./cat-queue-row";

describe("cat queue row guards", () => {
  it("treats synthetic groups as distinct from persisted segments", () => {
    const group = {
      kind: "group" as const,
      externalStringId: "g".repeat(64),
      groupId: "g".repeat(64),
      sourceTextHash: "h".repeat(64),
      translationKeyId: null,
      projectOccurrenceCount: 2,
      fileOccurrenceCount: 1,
      key: "save",
      sourceText: "Save",
      context: null,
      type: null,
    };
    const segment = {
      externalStringId: "key-1",
      key: "save",
      sourceText: "Save",
      context: null,
      type: null,
    };

    expect(isCatQueueGroup(group)).toBe(true);
    expect(isCatQueueSegmentRow(group)).toBe(false);
    expect(isCatQueueGroup(segment)).toBe(false);
    expect(isCatQueueSegmentRow(segment)).toBe(true);
  });
});
