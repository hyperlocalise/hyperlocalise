import { describe, expect, it } from "vite-plus/test";

import {
  buildSavedTargetTextMap,
  collectDirtySegmentIds,
  isSegmentTargetDirty,
  markSegmentTargetSaved,
  syncSavedTargetTexts,
} from "./cat-dirty-state";
import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";

describe("cat dirty state", () => {
  it("detects when a segment target differs from the saved baseline", () => {
    const saved = buildSavedTargetTextMap([
      {
        id: "seg-1",
        index: 1,
        key: "hello",
        sourceText: "Hello",
        targetText: "Saved",
        sourceLocale: "en",
        targetLocale: "vi",
        status: "pending",
      },
    ]);

    expect(isSegmentTargetDirty("seg-1", "Edited", saved)).toBe(true);
    expect(isSegmentTargetDirty("seg-1", "Saved", saved)).toBe(false);
  });

  it("keeps saved baselines for edited segments across server refreshes", () => {
    const previousInitialState = createCatWorkspaceState({
      segments: [
        {
          id: "seg-1",
          index: 1,
          key: "hello",
          sourceText: "Hello",
          targetText: "Saved",
          sourceLocale: "en",
          targetLocale: "vi",
          status: "pending",
        },
      ],
    });
    const currentState = {
      ...previousInitialState,
      segments: previousInitialState.segments.map((segment) => ({
        ...segment,
        targetText: "Unsaved edit",
      })),
    };
    const nextInitialState = createCatWorkspaceState({
      segments: [
        {
          id: "seg-1",
          index: 1,
          key: "hello",
          sourceText: "Hello",
          targetText: "Server refresh",
          sourceLocale: "en",
          targetLocale: "vi",
          status: "pending",
        },
      ],
    });

    const synced = syncSavedTargetTexts({
      savedTargetTexts: buildSavedTargetTextMap(previousInitialState.segments),
      previousInitialState,
      currentState,
      nextInitialState,
    });

    expect(synced["seg-1"]).toBe("Saved");
    expect(collectDirtySegmentIds(currentState.segments, synced)).toEqual(["seg-1"]);
  });

  it("updates saved baselines after approve", () => {
    const saved = markSegmentTargetSaved(buildSavedTargetTextMap([]), "seg-1", "Approved");
    expect(saved["seg-1"]).toBe("Approved");
  });
});
