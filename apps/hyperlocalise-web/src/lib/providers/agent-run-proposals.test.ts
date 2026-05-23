import { describe, expect, it } from "vite-plus/test";

import {
  applyAgentRunProposalReviewUpdates,
  applyBulkAgentRunProposalReview,
  buildAgentRunProposalItemId,
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
});
