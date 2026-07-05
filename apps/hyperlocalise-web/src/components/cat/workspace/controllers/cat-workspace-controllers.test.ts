import type { IntlShape } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";
import type { CatSegmentConcordanceResult } from "@/components/cat/shared/dependencies";

import { createCatWorkspace } from "../cat-workspace-orchestrator";
import { CatIntelligenceController } from "./cat-intelligence-controller";
import { CatReviewController } from "./cat-review-controller";

const intl = {
  formatMessage: (descriptor: { defaultMessage?: string }) => descriptor.defaultMessage ?? "",
} as IntlShape;

describe("CAT workspace controllers", () => {
  it("deduplicates concurrent concordance requests", async () => {
    let resolveLookup: ((value: CatSegmentConcordanceResult) => void) | undefined;
    const lookup = vi.fn(
      () =>
        new Promise<CatSegmentConcordanceResult>((resolve) => {
          resolveLookup = resolve;
        }),
    );
    const workspace = createCatWorkspace(createCatWorkspaceState());
    const controller = new CatIntelligenceController(workspace, {
      intl,
      services: { lookupSegmentConcordance: lookup },
    });
    controller.start();

    const first = controller.loadConcordance(workspace.selectedSegmentId);
    const second = controller.loadConcordance(workspace.selectedSegmentId);
    resolveLookup?.({ glossaryTerms: [], translationMemoryMatches: [] });

    await Promise.all([first, second]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("stops selected-segment review reactions after disposal", async () => {
    const validateFormat = vi.fn().mockResolvedValue([]);
    const workspace = createCatWorkspace(createCatWorkspaceState());
    const controller = new CatReviewController(workspace, {
      intl,
      services: { validateFormat },
      queueFilter: "all",
      usesServerQueueFilter: false,
    });
    controller.start();
    await vi.waitFor(() => expect(validateFormat).toHaveBeenCalledTimes(1));

    controller.dispose();
    workspace.setSelectedSegmentId(workspace.queueSegments[1]?.id ?? "");

    await Promise.resolve();
    expect(validateFormat).toHaveBeenCalledTimes(1);
  });
});
