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

import { enrichJobsWithSourceFileDisplay } from "./enrich-jobs-with-source-file-names";

const storedFileId = "file_3b017712-ec57-448f-8015-ca282a5a103a";

function createSelectDb(
  rows: Array<{
    id: string;
    filename: string;
    metadata: Record<string, unknown>;
    sourcePath: string | null;
  }>,
) {
  return {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () => rows,
        }),
      }),
    }),
  };
}

describe("enrichJobsWithSourceFileDisplay", () => {
  it("uses persisted metadata without looking up stored files", async () => {
    const db = createSelectDb([]);

    await expect(
      enrichJobsWithSourceFileDisplay(
        [
          {
            organizationId: "org_1",
            inputPayload: {
              sourceFileId: storedFileId,
              metadata: {
                sourceFilename: "home.json",
                sourcePath: "marketing/home.json",
              },
            },
          },
        ],
        { db: db as never },
      ),
    ).resolves.toEqual([
      {
        organizationId: "org_1",
        inputPayload: {
          sourceFileId: storedFileId,
          metadata: {
            sourceFilename: "home.json",
            sourcePath: "marketing/home.json",
          },
        },
        sourceFilename: "home.json",
        sourcePath: "marketing/home.json",
      },
    ]);
  });

  it("looks up the original stored filename for existing jobs", async () => {
    const db = createSelectDb([
      {
        id: storedFileId,
        filename: "pricing.json",
        metadata: {},
        sourcePath: "marketing/pricing.json",
      },
    ]);

    await expect(
      enrichJobsWithSourceFileDisplay(
        [
          {
            organizationId: "org_1",
            inputPayload: { sourceFileId: storedFileId },
          },
        ],
        { db: db as never },
      ),
    ).resolves.toEqual([
      {
        organizationId: "org_1",
        inputPayload: { sourceFileId: storedFileId },
        sourceFilename: "pricing.json",
        sourcePath: "marketing/pricing.json",
      },
    ]);
  });
});
