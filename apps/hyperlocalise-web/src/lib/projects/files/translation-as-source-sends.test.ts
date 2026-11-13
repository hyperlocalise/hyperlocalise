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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vite-plus/test";

import { listTranslationAsSourceSends } from "./translation-as-source-sends";

describe("listTranslationAsSourceSends", () => {
  it("does not query when no destination projects are in the person's scope", async () => {
    await expect(
      listTranslationAsSourceSends({
        organizationId: randomUUID(),
        projectId: "project_source",
        destinationProjectIds: [],
      }),
    ).resolves.toEqual([]);
  });
});
