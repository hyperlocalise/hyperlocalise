import { describe, expect, it } from "vite-plus/test";

import {
  applyAgentRunProposalReviewUpdates,
  applyBulkAgentRunProposalReview,
  buildAgentRunProposalItemId,
  collectAcceptedAgentRunProposalsForJob,
  detectAgentRunProposalWarnings,
  enrichAgentRunProposalItem,
  parseAgentRunProposalItems,
} from "./agent-run-proposals";

describe("agent-run-proposals", () => {
  it("builds stable item ids", () => {
    expect(buildAgentRunProposalItemId({ externalStringId: "1", locale: "fr" })).toBe("1:fr");
  });

  it("detects placeholder and glossary warnings", () => {
    const warnings = detectAgentRunProposalWarnings({
      sourceText: "Hello {name}",
      from: "",
      to: "Bonjour",
      locale: "fr",
      glossaryTerms: [
        {
          sourceTerm: "Hello",
          targetTerm: "Salut",
          targetLocale: "fr",
          forbidden: false,
        },
      ],
    });

    expect(warnings.placeholder).toBe(true);
    expect(warnings.glossary).toBe(true);
  });

  it("enriches raw changed items with review metadata", () => {
    const item = enrichAgentRunProposalItem({
      externalStringId: "1",
      key: "hello",
      locale: "fr",
      sourceText: "Hello",
      from: "",
      to: "Bonjour",
    });

    expect(item).toMatchObject({
      itemId: "1:fr",
      reviewState: "pending",
      changedFields: ["target"],
    });
  });

  it("applies per-item and bulk review updates", () => {
    const changedItems = [
      {
        externalStringId: "1",
        key: "hello",
        locale: "fr",
        sourceText: "Hello",
        from: "",
        to: "Bonjour",
      },
      {
        externalStringId: "2",
        key: "world",
        locale: "fr",
        sourceText: "World",
        from: "Monde",
        to: "Le monde",
      },
    ];

    const parsed = parseAgentRunProposalItems(changedItems);
    expect(parsed).toHaveLength(2);

    const individuallyUpdated = applyAgentRunProposalReviewUpdates({
      changedItems,
      updates: [{ itemId: parsed[0]!.itemId, reviewState: "accepted" }],
    });

    expect(enrichAgentRunProposalItem(individuallyUpdated[0]!)?.reviewState).toBe("accepted");
    expect(enrichAgentRunProposalItem(individuallyUpdated[1]!)?.reviewState).toBe("pending");

    const bulkRejected = applyBulkAgentRunProposalReview({
      changedItems: individuallyUpdated,
      reviewState: "rejected",
      filter: "pending",
    });

    expect(enrichAgentRunProposalItem(bulkRejected[0]!)?.reviewState).toBe("accepted");
    expect(enrichAgentRunProposalItem(bulkRejected[1]!)?.reviewState).toBe("rejected");
  });

  it("collects accepted proposals across translate and qa_fix runs", () => {
    const olderRunId = "run-older";
    const newerRunId = "run-newer";

    const accepted = collectAcceptedAgentRunProposalsForJob({
      runs: [
        {
          id: newerRunId,
          kind: "qa_fix",
          status: "succeeded",
          inputSnapshot: {},
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
          changedItems: [
            {
              externalStringId: "1",
              key: "hello",
              locale: "fr",
              sourceText: "Hello",
              from: "",
              to: "Bonjour",
              reviewState: "accepted",
            },
            {
              externalStringId: "2",
              key: "world",
              locale: "fr",
              sourceText: "World",
              from: "",
              to: "Le monde",
              reviewState: "pending",
            },
          ],
        },
        {
          id: olderRunId,
          kind: "translate",
          status: "succeeded",
          inputSnapshot: {},
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          changedItems: [
            {
              externalStringId: "1",
              key: "hello",
              locale: "fr",
              sourceText: "Hello",
              from: "",
              to: "Salut",
              reviewState: "accepted",
            },
          ],
        },
        {
          id: "writeback-run",
          kind: "translate",
          status: "succeeded",
          inputSnapshot: { action: "push_approved_changes" },
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          changedItems: [],
        },
      ],
    });

    expect(accepted).toEqual([
      expect.objectContaining({
        itemId: "1:fr",
        to: "Bonjour",
        sourceAgentRunId: newerRunId,
      }),
    ]);
  });
});
