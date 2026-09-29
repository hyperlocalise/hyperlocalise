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

import { decideMerge, type MergeInputSettlement } from "./merge-decision";

const inputIds = ["email", "slack"] as const;

function settlements(
  entries: Array<[string, MergeInputSettlement]>,
): Map<string, MergeInputSettlement> {
  return new Map(entries);
}

describe("decideMerge", () => {
  it("keeps all mode pending until every input settles", () => {
    expect(
      decideMerge({
        mode: "all",
        inputIds,
        settlements: settlements([["email", "succeeded"]]),
      }),
    ).toEqual({
      state: "pending",
    });
  });

  it("completes all mode when every input settles", () => {
    expect(
      decideMerge({
        mode: "all",
        inputIds,
        settlements: settlements([
          ["email", "succeeded"],
          ["slack", "succeeded"],
        ]),
      }),
    ).toEqual({
      state: "completed",
      selectedInputId: "email",
      arrivedInputIds: ["email", "slack"],
    });
  });

  it("allows skipped paths to settle all mode", () => {
    expect(
      decideMerge({
        mode: "all",
        inputIds,
        settlements: settlements([
          ["email", "succeeded"],
          ["slack", "skipped"],
        ]),
      }),
    ).toEqual({
      state: "completed",
      selectedInputId: "email",
      arrivedInputIds: ["email"],
    });
  });

  it("completes any mode after the first arrival", () => {
    expect(
      decideMerge({
        mode: "any",
        inputIds,
        settlements: settlements([["slack", "succeeded"]]),
      }),
    ).toEqual({
      state: "completed",
      selectedInputId: "slack",
      arrivedInputIds: ["slack"],
    });
  });

  it.each(["any", "first_success"] as const)(
    "selects the first settlement rather than the first configured input in %s mode",
    (mode) => {
      expect(
        decideMerge({
          mode,
          inputIds,
          settlements: settlements([
            ["slack", "succeeded"],
            ["email", "succeeded"],
          ]),
        }),
      ).toMatchObject({
        state: "completed",
        selectedInputId: "slack",
        arrivedInputIds: ["slack", "email"],
      });
    },
  );

  it("waits for a successful input in first-success mode", () => {
    expect(
      decideMerge({
        mode: "first_success",
        inputIds,
        settlements: settlements([["email", "failed"]]),
      }),
    ).toEqual({
      state: "pending",
    });
  });

  it("completes first-success mode after a successful input", () => {
    expect(
      decideMerge({
        mode: "first_success",
        inputIds,
        settlements: settlements([
          ["email", "failed"],
          ["slack", "succeeded"],
        ]),
      }),
    ).toEqual({
      state: "completed",
      selectedInputId: "slack",
      arrivedInputIds: ["slack"],
    });
  });

  it("fails first-success mode when every arrived input failed", () => {
    expect(
      decideMerge({
        mode: "first_success",
        inputIds,
        settlements: settlements([
          ["email", "failed"],
          ["slack", "failed"],
        ]),
      }),
    ).toEqual({
      state: "failed",
      code: "merge_no_successful_input",
    });
  });

  it.each(["all", "any", "first_success"] as const)(
    "skips %s mode when every input is unreachable",
    (mode) => {
      expect(
        decideMerge({
          mode,
          inputIds,
          settlements: settlements([
            ["email", "skipped"],
            ["slack", "skipped"],
          ]),
        }),
      ).toEqual({
        state: "skipped",
      });
    },
  );
});
