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
// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";

import { createCatWorkspace } from "./cat-workspace-orchestrator";

describe("CatWorkspaceOrchestrator lifecycle", () => {
  it("protects dirty drafts from page unload until they are saved or the store is disposed", () => {
    const store = createCatWorkspace(
      createCatWorkspaceState({
        selectedSegmentId: "seg-01",
        queueSegments: [{ id: "seg-01", index: 1, key: "first", sourceText: "First" }],
      }),
    );
    const dispatchBeforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    store.start();
    expect(dispatchBeforeUnload()).toBe(false);

    store.setTargetText("seg-01", "Unsaved");
    expect(dispatchBeforeUnload()).toBe(true);

    store.markSegmentSaved("seg-01", "Unsaved");
    expect(dispatchBeforeUnload()).toBe(false);

    store.setTargetText("seg-01", "Unsaved again");
    store.dispose();
    expect(dispatchBeforeUnload()).toBe(false);
  });
});
