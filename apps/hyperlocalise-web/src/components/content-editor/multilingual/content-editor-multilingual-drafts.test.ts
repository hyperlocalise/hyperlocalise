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
import { MultilingualDraft, MultilingualDrafts } from "./content-editor-multilingual-drafts";

describe("multilingual drafts", () => {
  it("serializes writes and retains newer typing while an earlier save completes", async () => {
    const draft = new MultilingualDraft("original");
    let finish!: () => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    draft.change("first");
    const saving = draft.save(write);
    draft.change("second");
    await draft.save(write);
    expect(write).toHaveBeenCalledTimes(1);
    finish();
    await saving;
    expect(write.mock.calls.map(([text]) => text)).toEqual(["first", "second"]);
    expect(draft.text).toBe("second");
    expect(draft.dirty).toBe(false);
  });
  it("keeps failed drafts dirty and retries without losing text", async () => {
    const draft = new MultilingualDraft("original");
    draft.change("new");
    await draft.save(() => Promise.reject(new Error("offline")));
    expect(draft.error).toBe("offline");
    expect(draft.dirty).toBe(true);
    await draft.save(() => Promise.resolve());
    expect(draft.error).toBeNull();
    expect(draft.dirty).toBe(false);
  });
  it("isolates language drafts and retains unsaved text during refetch", () => {
    const drafts = new MultilingualDrafts();
    drafts.get("file:key:fr", "French").change("Bonjour");
    drafts.get("file:key:de", "German").change("Hallo");
    expect(drafts.get("file:key:fr", "stale").text).toBe("Bonjour");
    expect(drafts.get("file:key:de", "stale").text).toBe("Hallo");
    expect(drafts.dirty).toBe(true);
  });
});
