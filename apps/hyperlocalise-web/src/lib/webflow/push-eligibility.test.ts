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

import { isWebflowJsonSourcePath, isWebflowPushRunActive } from "./push-eligibility";
import { readWebflowPushSourcePaths } from "./push-webflow-translations";

describe("isWebflowJsonSourcePath", () => {
  it("matches webflow JSON source files only", () => {
    expect(isWebflowJsonSourcePath("webflow/site-1/col-1/item.json")).toBe(true);
    expect(isWebflowJsonSourcePath("sanity/project/dataset/doc.json")).toBe(false);
    expect(isWebflowJsonSourcePath("webflow/site-1/col-1/item.txt")).toBe(false);
  });
});

describe("isWebflowPushRunActive", () => {
  it("is true only for queued or running push_approved runs", () => {
    expect(
      isWebflowPushRunActive([{ status: "queued", inputSnapshot: { operation: "push_approved" } }]),
    ).toBe(true);
    expect(
      isWebflowPushRunActive([
        { status: "running", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(true);
    expect(
      isWebflowPushRunActive([
        { status: "completed", inputSnapshot: { operation: "push_approved" } },
      ]),
    ).toBe(false);
    expect(
      isWebflowPushRunActive([{ status: "queued", inputSnapshot: { operation: "import" } }]),
    ).toBe(false);
  });
});

describe("readWebflowPushSourcePaths", () => {
  it("returns undefined without a sourcePaths snapshot", () => {
    expect(readWebflowPushSourcePaths(undefined)).toBeUndefined();
    expect(readWebflowPushSourcePaths({})).toBeUndefined();
    expect(readWebflowPushSourcePaths({ sourcePaths: "webflow/a.json" })).toBeUndefined();
  });

  it("keeps only non-empty string paths", () => {
    expect(
      readWebflowPushSourcePaths({
        sourcePaths: ["webflow/a.json", "", 42, "webflow/b.json"],
      }),
    ).toEqual(["webflow/a.json", "webflow/b.json"]);
  });
});
