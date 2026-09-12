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

import {
  appendGlossaryHistoryEvent,
  diffGlossaryFields,
  historyActorFromUser,
} from "./glossary-history";

describe("diffGlossaryFields", () => {
  it("returns only fields that changed by value or deep equality", () => {
    expect(
      diffGlossaryFields(
        { name: "Checkout", note: "a", tags: ["a", "b"], count: 1 },
        { name: "Checkout", note: "b", tags: ["a", "b"], count: 2 },
        ["name", "note", "tags", "count"],
      ),
    ).toEqual([
      { field: "note", before: "a", after: "b" },
      { field: "count", before: 1, after: 2 },
    ]);
  });

  it("treats missing fields as null and ignores identical object graphs", () => {
    expect(diffGlossaryFields(null, { name: "Checkout" }, ["name", "note"])).toEqual([
      { field: "name", before: null, after: "Checkout" },
    ]);
    expect(
      diffGlossaryFields({ metadata: { nested: true } }, { metadata: { nested: true } }, [
        "metadata",
      ]),
    ).toEqual([]);
  });
});

describe("appendGlossaryHistoryEvent", () => {
  it("skips empty updated events so no-op edits do not pollute history", async () => {
    const insert = vi.fn();
    const database = {
      insert: (...args: unknown[]) => {
        insert(...args);
        throw new Error("insert must not run for empty updates");
      },
    };

    const event = await appendGlossaryHistoryEvent(database as never, {
      organizationId: "org-1",
      glossaryId: "glossary-1",
      target: { resourceKind: "concept", conceptId: "concept-1" },
      eventType: "updated",
      changes: [],
    });

    expect(event).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("still records non-update events when changes are empty", async () => {
    const returning = vi.fn(async () => [{ id: "event-1" }]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const database = { insert };

    const event = await appendGlossaryHistoryEvent(database as never, {
      organizationId: "org-1",
      glossaryId: "glossary-1",
      target: { resourceKind: "glossary" },
      eventType: "imported",
      actor: historyActorFromUser("user-1"),
    });

    expect(event).toEqual({ id: "event-1" });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "imported",
        actorKind: "user",
        actorUserId: "user-1",
        changedFields: [],
        changes: [],
        attributes: { resourceKind: "glossary" },
      }),
    );
  });
});

describe("historyActorFromUser", () => {
  it("normalizes missing user ids to null", () => {
    expect(historyActorFromUser(undefined)).toEqual({
      kind: "user",
      userId: null,
      credentialId: null,
    });
  });
});
