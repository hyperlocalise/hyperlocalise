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

import { createDefaultConfig } from "../catalog/node-catalog";
import type { CanonicalVisualWorkflowNode } from "../schema/types";
import {
  getAllowedExecutionSourceHandles,
  getPrimaryExecutionSourceHandle,
  normalizeExecutionSourceHandle,
} from "./execution-handles";

function canonical(
  type: CanonicalVisualWorkflowNode["type"],
  config: CanonicalVisualWorkflowNode["config"] = createDefaultConfig(type),
): CanonicalVisualWorkflowNode {
  return { id: type, type, config };
}

describe("getAllowedExecutionSourceHandles", () => {
  it("lists If true and false handles", () => {
    expect(getAllowedExecutionSourceHandles(canonical("logic.if"))).toEqual(["true", "false"]);
  });

  it("lists Switch case ids and default", () => {
    expect(
      getAllowedExecutionSourceHandles(
        canonical("logic.switch", {
          kind: "logic.switch",
          expression: "status",
          cases: [
            { id: "case-a", value: "a" },
            { id: "case-b", value: "b" },
          ],
        }),
      ),
    ).toEqual(["default", "case-a", "case-b"]);
  });

  it("lists For Each each and done handles", () => {
    expect(getAllowedExecutionSourceHandles(canonical("logic.for_each"))).toEqual(["each", "done"]);
  });

  it("lists Retry attempt, succeeded, and exhausted handles", () => {
    expect(getAllowedExecutionSourceHandles(canonical("logic.retry"))).toEqual([
      "attempt",
      "succeeded",
      "exhausted",
    ]);
  });

  it("allows null and success on single-output actions", () => {
    expect(getAllowedExecutionSourceHandles(canonical("action.http"))).toEqual([null, "success"]);
  });

  it("allows error when onError is branch", () => {
    expect(
      getAllowedExecutionSourceHandles(
        canonical("action.http", {
          kind: "action.http",
          method: "GET",
          url: "https://example.test",
          onError: "branch",
        }),
      ),
    ).toEqual([null, "success", "error"]);
  });
});

describe("normalizeExecutionSourceHandle", () => {
  it("preserves If true and false", () => {
    const node = canonical("logic.if");
    expect(normalizeExecutionSourceHandle(node, "true")).toEqual({ ok: true, handle: "true" });
    expect(normalizeExecutionSourceHandle(node, "false")).toEqual({ ok: true, handle: "false" });
  });

  it("rejects a stale Switch case handle", () => {
    const node = canonical("logic.switch", {
      kind: "logic.switch",
      expression: "status",
      cases: [
        { id: "case-a", value: "a" },
        { id: "case-b", value: "b" },
      ],
    });
    expect(normalizeExecutionSourceHandle(node, "case-b")).toEqual({
      ok: true,
      handle: "case-b",
    });
    expect(normalizeExecutionSourceHandle(node, "default")).toEqual({
      ok: true,
      handle: "default",
    });
    expect(normalizeExecutionSourceHandle(node, "1")).toEqual({ ok: false });
    expect(normalizeExecutionSourceHandle(node, "missing")).toEqual({ ok: false });
  });

  it("keeps unlabeled handles on single-output nodes and rejects foreign pins", () => {
    expect(normalizeExecutionSourceHandle(canonical("action.http"), undefined)).toEqual({
      ok: true,
      handle: null,
    });
    expect(normalizeExecutionSourceHandle(canonical("action.http"), "true")).toEqual({
      ok: false,
    });
  });

  it("keeps For Each each and done", () => {
    const node = canonical("logic.for_each");
    expect(normalizeExecutionSourceHandle(node, "each")).toEqual({ ok: true, handle: "each" });
    expect(normalizeExecutionSourceHandle(node, "done")).toEqual({ ok: true, handle: "done" });
  });

  it("keeps Retry attempt, succeeded, and exhausted", () => {
    const node = canonical("logic.retry");
    expect(normalizeExecutionSourceHandle(node, "attempt")).toEqual({
      ok: true,
      handle: "attempt",
    });
    expect(normalizeExecutionSourceHandle(node, "succeeded")).toEqual({
      ok: true,
      handle: "succeeded",
    });
    expect(normalizeExecutionSourceHandle(node, "exhausted")).toEqual({
      ok: true,
      handle: "exhausted",
    });
    expect(normalizeExecutionSourceHandle(node, "each")).toEqual({ ok: false });
  });

  it("does not invent a primary handle for missing multi-output pins", () => {
    expect(getPrimaryExecutionSourceHandle(canonical("logic.if"))).toBe("true");
    expect(getPrimaryExecutionSourceHandle(canonical("logic.for_each"))).toBe("each");
    expect(
      getPrimaryExecutionSourceHandle(
        canonical("logic.switch", {
          kind: "logic.switch",
          expression: "status",
          cases: [
            { id: "case-a", value: "a" },
            { id: "case-b", value: "b" },
          ],
        }),
      ),
    ).toBe("case-a");
    expect(normalizeExecutionSourceHandle(canonical("logic.if"), undefined)).toEqual({
      ok: false,
    });
  });

  it("lists Wait completed, timed out, and error handles", () => {
    expect(getAllowedExecutionSourceHandles(canonical("flow.wait"))).toEqual([
      "completed",
      "timed_out",
      "error",
    ]);
  });

  it("uses completed as the primary Wait handle", () => {
    expect(getPrimaryExecutionSourceHandle(canonical("flow.wait"))).toBe("completed");
  });
});
