import type { IntlShape } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCatWorkspaceState } from "@/components/cat/shared/cat.fixture";
import type { CatSegmentConcordanceResult } from "@/components/cat/shared/dependencies";

import { createCatWorkspace } from "../cat-workspace-orchestrator";
import { CatIntelligenceController } from "./cat-intelligence-controller";

const intl = {
  formatMessage: (descriptor: { defaultMessage?: string }) => descriptor.defaultMessage ?? "",
} as IntlShape;

function createTestWorkspace(overrides: Parameters<typeof createCatWorkspaceState>[0] = {}) {
  return createCatWorkspace(
    createCatWorkspaceState({
      selectedSegmentId: "seg-02",
      segments: [
        {
          id: "seg-01",
          index: 1,
          key: "first",
          sourceText: "First",
          targetText: "Premier",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "reviewed",
        },
        {
          id: "seg-02",
          index: 2,
          key: "second",
          sourceText: "Second",
          targetText: "",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
        {
          id: "seg-03",
          index: 3,
          key: "third",
          sourceText: "Third",
          targetText: "Troisième",
          sourceLocale: "en-US",
          targetLocale: "vi",
          status: "pending",
        },
      ],
      ...overrides,
    }),
  );
}

function createController(
  workspace = createTestWorkspace(),
  ports: ConstructorParameters<typeof CatIntelligenceController>[1] = { intl },
) {
  const controller = new CatIntelligenceController(workspace, ports);
  controller.start();
  return { controller, workspace };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CatIntelligenceController", () => {
  describe("loadConcordance", () => {
    it("returns undefined when the lookup service is missing", async () => {
      const { controller } = createController();

      await expect(controller.loadConcordance("seg-02")).resolves.toBeUndefined();
    });

    it("returns undefined when the segment does not exist", async () => {
      const lookup = vi.fn();
      const { controller } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      await expect(controller.loadConcordance("missing-segment")).resolves.toBeUndefined();
      expect(lookup).not.toHaveBeenCalled();
    });

    it("deduplicates concurrent concordance requests", async () => {
      let resolveLookup: ((value: CatSegmentConcordanceResult) => void) | undefined;
      const lookup = vi.fn(
        () =>
          new Promise<CatSegmentConcordanceResult>((resolve) => {
            resolveLookup = resolve;
          }),
      );
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      const first = controller.loadConcordance(workspace.selectedSegmentId);
      const second = controller.loadConcordance(workspace.selectedSegmentId);
      resolveLookup?.({ glossaryTerms: [], translationMemoryMatches: [] });

      await Promise.all([first, second]);
      expect(lookup).toHaveBeenCalledTimes(1);
    });

    it("returns cached intelligence without calling lookup again", async () => {
      const concordance: CatSegmentConcordanceResult = {
        glossaryTerms: [
          { id: "term-1", source: "Second", target: "Deuxième", approved: true, forbidden: false },
        ],
        translationMemoryMatches: [],
      };
      const lookup = vi.fn().mockResolvedValue(concordance);
      const { controller } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      await controller.loadConcordance("seg-02");
      const cached = await controller.loadConcordance("seg-02");

      expect(lookup).toHaveBeenCalledTimes(1);
      expect(cached).toEqual(concordance);
    });

    it("auto-fills empty targets from high-confidence TM matches", async () => {
      const onTargetChange = vi.fn();
      const lookup = vi.fn().mockResolvedValue({
        glossaryTerms: [],
        translationMemoryMatches: [
          {
            id: "tm-1",
            sourceText: "Second",
            targetText: "Deuxième",
            matchPercent: 100,
          },
        ],
      } satisfies CatSegmentConcordanceResult);
      const { controller, workspace } = createController(undefined, {
        intl,
        editing: { onTargetChange },
        services: { lookupSegmentConcordance: lookup },
      });

      await controller.loadConcordance("seg-02");

      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("Deuxième");
      expect(workspace.autoFilledSegmentIds.has("seg-02")).toBe(true);
      expect(workspace.dirtySegmentIds.has("seg-02")).toBe(true);
      expect(onTargetChange).toHaveBeenCalledWith("seg-02", "Deuxième");
    });

    it("does not auto-fill when autoFill is false", async () => {
      const lookup = vi.fn().mockResolvedValue({
        glossaryTerms: [],
        translationMemoryMatches: [
          {
            id: "tm-1",
            sourceText: "Second",
            targetText: "Deuxième",
            matchPercent: 100,
          },
        ],
      } satisfies CatSegmentConcordanceResult);
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      await controller.loadConcordance("seg-02", { autoFill: false });

      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("");
      expect(workspace.autoFilledSegmentIds.has("seg-02")).toBe(false);
    });

    it("does not auto-fill when the target already has text", async () => {
      const lookup = vi.fn().mockResolvedValue({
        glossaryTerms: [],
        translationMemoryMatches: [
          {
            id: "tm-1",
            sourceText: "Third",
            targetText: "Autre",
            matchPercent: 100,
          },
        ],
      } satisfies CatSegmentConcordanceResult);
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      await controller.loadConcordance("seg-03");

      expect(workspace.getSegmentView("seg-03")?.targetText).toBe("Troisième");
    });

    it("does not auto-fill when the best match is below the threshold", async () => {
      const lookup = vi.fn().mockResolvedValue({
        glossaryTerms: [],
        translationMemoryMatches: [
          {
            id: "tm-1",
            sourceText: "Second",
            targetText: "Deuxième",
            matchPercent: 85,
          },
        ],
      } satisfies CatSegmentConcordanceResult);
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      await controller.loadConcordance("seg-02");

      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("");
    });

    it("does not auto-fill the same segment twice", async () => {
      const lookup = vi.fn().mockResolvedValue({
        glossaryTerms: [],
        translationMemoryMatches: [
          {
            id: "tm-1",
            sourceText: "Second",
            targetText: "Deuxième",
            matchPercent: 100,
          },
        ],
      } satisfies CatSegmentConcordanceResult);
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      workspace.autoFilledSegmentIds.add("seg-02");
      await controller.loadConcordance("seg-02");

      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("");
    });

    it("records concordance lookup failures as format checks", async () => {
      const lookup = vi.fn().mockRejectedValue(new Error("TM unavailable"));
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      await controller.loadConcordance("seg-02");

      expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "concordance-failed-seg-02",
            message: "TM unavailable",
          }),
        ]),
      );
    });

    it("does not merge intelligence after disposal", async () => {
      let resolveLookup: ((value: CatSegmentConcordanceResult) => void) | undefined;
      const lookup = vi.fn(
        () =>
          new Promise<CatSegmentConcordanceResult>((resolve) => {
            resolveLookup = resolve;
          }),
      );
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: lookup },
      });

      const pending = controller.loadConcordance("seg-02");
      controller.dispose();
      resolveLookup?.({
        glossaryTerms: [
          { id: "term-1", source: "Second", target: "Deuxième", approved: true, forbidden: false },
        ],
        translationMemoryMatches: [],
      });
      await pending;

      expect(workspace.segmentIntelligence["seg-02"]?.glossaryTerms).toBeUndefined();
    });
  });

  describe("configure", () => {
    it("clears concordance cache when the lookup service changes", async () => {
      const firstLookup = vi.fn().mockResolvedValue({
        glossaryTerms: [],
        translationMemoryMatches: [],
      } satisfies CatSegmentConcordanceResult);
      const secondLookup = vi.fn().mockResolvedValue({
        glossaryTerms: [
          { id: "term-2", source: "Second", target: "Deuxième", approved: true, forbidden: false },
        ],
        translationMemoryMatches: [],
      } satisfies CatSegmentConcordanceResult);
      const { controller } = createController(undefined, {
        intl,
        services: { lookupSegmentConcordance: firstLookup },
      });

      await controller.loadConcordance("seg-02");
      controller.configure({
        intl,
        services: { lookupSegmentConcordance: secondLookup },
      });
      await controller.loadConcordance("seg-02");

      expect(firstLookup).toHaveBeenCalledTimes(1);
      expect(secondLookup).toHaveBeenCalledTimes(1);
    });
  });

  describe("panelVisible", () => {
    it("loads visual context for non-native providers", async () => {
      const visualContext = {
        screenshots: [
          {
            id: "shot-1",
            name: "Sign-in",
            imageUrl: "https://example.com/shot.png",
            width: 800,
            height: 600,
            markers: [],
          },
        ],
      };
      const lookupSegmentVisualContext = vi.fn().mockResolvedValue(visualContext);
      const workspace = createTestWorkspace({
        fileContext: {
          sourcePath: "app/page.tsx",
          filename: "page.tsx",
          sourceLocale: "en-US",
          targetLocale: "vi",
          providerKind: "crowdin",
          canEditTranslations: true,
          canAddComments: true,
        },
      });
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentVisualContext },
      });

      controller.panelVisible("seg-02");
      await vi.waitFor(() =>
        expect(workspace.segmentIntelligence["seg-02"]?.visualContext).toEqual(visualContext),
      );
      expect(workspace.isLoadingVisualContext).toBe(false);
    });

    it("skips visual context lookup for native providers", async () => {
      const lookupSegmentVisualContext = vi.fn();
      const workspace = createTestWorkspace({
        fileContext: {
          sourcePath: "app/page.tsx",
          filename: "page.tsx",
          sourceLocale: "en-US",
          targetLocale: "vi",
          providerKind: "native",
          canEditTranslations: true,
          canAddComments: true,
        },
      });
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentVisualContext },
      });

      controller.panelVisible("seg-02");
      await Promise.resolve();

      expect(lookupSegmentVisualContext).not.toHaveBeenCalled();
    });

    it("records visual context failures as warn checks", async () => {
      const lookupSegmentVisualContext = vi
        .fn()
        .mockRejectedValue(new Error("Screenshots offline"));
      const workspace = createTestWorkspace({
        fileContext: {
          sourcePath: "app/page.tsx",
          filename: "page.tsx",
          sourceLocale: "en-US",
          targetLocale: "vi",
          providerKind: "phrase",
          canEditTranslations: true,
          canAddComments: true,
        },
      });
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentVisualContext },
      });

      controller.panelVisible("seg-02");
      await vi.waitFor(() =>
        expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "visual-context-failed-seg-02",
              status: "warn",
            }),
          ]),
        ),
      );
      expect(workspace.isLoadingVisualContext).toBe(false);
    });

    it("clears visual context loading when cached visual context already exists", () => {
      const lookupSegmentVisualContext = vi.fn();
      const workspace = createTestWorkspace({
        segmentIntelligence: {
          "seg-02": {
            ...createCatWorkspaceState().intelligence,
            visualContext: { screenshots: [] },
          },
        },
        fileContext: {
          sourcePath: "app/page.tsx",
          filename: "page.tsx",
          sourceLocale: "en-US",
          targetLocale: "vi",
          providerKind: "crowdin",
          canEditTranslations: true,
          canAddComments: true,
        },
      });
      workspace.isLoadingVisualContext = true;
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentVisualContext },
      });

      controller.panelVisible("seg-02");

      expect(lookupSegmentVisualContext).not.toHaveBeenCalled();
      expect(workspace.isLoadingVisualContext).toBe(false);
    });

    it("loads cached agent context without requiring fresh lookup availability", async () => {
      const lookupSegmentContext = vi.fn().mockResolvedValue("Cached repository context.");
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentContext },
      });

      controller.panelVisible("seg-02");

      await vi.waitFor(() =>
        expect(lookupSegmentContext).toHaveBeenCalledWith(
          expect.objectContaining({ id: "seg-02" }),
          {
            cachedOnly: true,
          },
        ),
      );
      expect(workspace.segmentIntelligence["seg-02"]?.agentContext).toBe(
        "Cached repository context.",
      );
      expect(workspace.revealedAgentContextSegmentIds.has("seg-02")).toBe(true);
    });

    it("replaces repository context without resetting CAT state or accepting a stale response", async () => {
      let resolveOldContext: ((context: string) => void) | undefined;
      const oldLookup = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveOldContext = resolve;
          }),
      );
      const newLookup = vi.fn().mockResolvedValue("New repository context.");
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentContext: oldLookup },
      });
      workspace.setTargetText("seg-02", "Unsaved draft");

      controller.panelVisible("seg-02");
      controller.configure({
        intl,
        services: { lookupSegmentContext: newLookup },
      });

      await vi.waitFor(() =>
        expect(workspace.segmentIntelligence["seg-02"]?.agentContext).toBe(
          "New repository context.",
        ),
      );
      expect(workspace.getSegmentView("seg-02")?.targetText).toBe("Unsaved draft");
      expect(workspace.selectedSegmentId).toBe("seg-02");

      resolveOldContext?.("Old repository context.");
      await Promise.resolve();

      expect(workspace.segmentIntelligence["seg-02"]?.agentContext).toBe("New repository context.");
    });
  });

  describe("askQuestion", () => {
    it("reveals cached context without refetching when forceRefresh is false", async () => {
      const lookupSegmentContext = vi.fn();
      const workspace = createTestWorkspace({
        segmentIntelligence: {
          "seg-02": {
            ...createCatWorkspaceState().intelligence,
            agentContext: "Existing context.",
          },
        },
      });
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentContext },
      });

      await controller.askQuestion("seg-02");

      expect(lookupSegmentContext).not.toHaveBeenCalled();
      expect(workspace.revealedAgentContextSegmentIds.has("seg-02")).toBe(true);
    });

    it("returns false when revealing cached context without refetching", async () => {
      const lookupSegmentContext = vi.fn();
      const workspace = createTestWorkspace({
        segmentIntelligence: {
          "seg-02": {
            ...createCatWorkspaceState().intelligence,
            agentContext: "Existing context.",
          },
        },
      });
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentContext },
      });

      await expect(controller.askQuestion("seg-02")).resolves.toBe(false);
    });

    it("refetches agent context when forceRefresh is true", async () => {
      const lookupSegmentContext = vi.fn().mockResolvedValue("Updated context.");
      const workspace = createTestWorkspace({
        segmentIntelligence: {
          "seg-02": {
            ...createCatWorkspaceState().intelligence,
            agentContext: "Old context.",
          },
        },
      });
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentContext },
      });

      await controller.askQuestion("seg-02", { forceRefresh: true });

      expect(lookupSegmentContext).toHaveBeenCalledWith(expect.objectContaining({ id: "seg-02" }), {
        forceRefresh: true,
      });
      expect(workspace.segmentIntelligence["seg-02"]?.agentContext).toBe("Updated context.");
    });

    it("returns true after a successful fresh lookup", async () => {
      const lookupSegmentContext = vi.fn().mockResolvedValue("Fresh context.");
      const workspace = createTestWorkspace();
      const { controller } = createController(workspace, {
        intl,
        services: { lookupSegmentContext },
      });

      await expect(controller.askQuestion("seg-02")).resolves.toBe(true);
    });

    it("records context lookup failures as format checks", async () => {
      const lookupSegmentContext = vi.fn().mockRejectedValue(new Error("Repository not selected."));
      const { controller, workspace } = createController(undefined, {
        intl,
        services: { lookupSegmentContext },
      });

      await controller.askQuestion("seg-02");

      expect(workspace.segmentFormatChecks["seg-02"]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "context-lookup-failed-seg-02",
            message: "Repository not selected.",
          }),
        ]),
      );
    });
  });
});
