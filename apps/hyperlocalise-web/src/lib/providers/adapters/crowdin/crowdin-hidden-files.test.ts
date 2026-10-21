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
import { describe, expect, it, vi } from "vite-plus/test";

import type { CrowdinSourceString } from "@/lib/providers/adapters/crowdin/crowdin-api";

import { findCrowdinHiddenFileIds } from "./crowdin-hidden-files";

function sourceString(fileId: number | null): CrowdinSourceString {
  return { fileId } as CrowdinSourceString;
}

describe("findCrowdinHiddenFileIds", () => {
  it("flags only listed files that own hidden strings and no visible ones", async () => {
    const listSourceStrings = vi.fn(async (_projectId: number, options?: { croql?: string }) => {
      if (options?.croql === "is hidden") {
        return [
          sourceString(1),
          sourceString(1),
          sourceString(2),
          sourceString(9),
          sourceString(null),
        ];
      }
      return options?.croql === "id of file = 2 and not is hidden" ? [sourceString(2)] : [];
    });

    const hidden = await findCrowdinHiddenFileIds({ listSourceStrings }, 42, [1, 2, 3]);

    expect([...hidden]).toEqual([1]);
    expect(listSourceStrings).toHaveBeenCalledTimes(3);
    expect(listSourceStrings).not.toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        croql: "id of file = 9 and not is hidden",
      }),
    );
  });

  it("skips provider requests when no files are listed", async () => {
    const listSourceStrings = vi.fn();

    const hidden = await findCrowdinHiddenFileIds({ listSourceStrings }, 42, []);

    expect(hidden.size).toBe(0);
    expect(listSourceStrings).not.toHaveBeenCalled();
  });
});
