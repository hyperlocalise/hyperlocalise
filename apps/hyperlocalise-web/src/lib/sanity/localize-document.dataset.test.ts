/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 */
import { describe, expect, it } from "vite-plus/test";

import { sanityJobMatchesPage } from "./localize-document";

describe("sanityJobMatchesPage", () => {
  const basePayload = {
    metadata: {
      integration: "sanity-plugin",
      sanityProjectId: "proj",
      sanityDocumentId: "doc-1",
    },
  };

  it("requires matching sanityDataset metadata", () => {
    expect(
      sanityJobMatchesPage(
        {
          ...basePayload,
          metadata: { ...basePayload.metadata, sanityDataset: "production" },
        },
        { sanityProjectId: "proj", documentId: "doc-1", dataset: "production" },
      ),
    ).toBe(true);

    expect(
      sanityJobMatchesPage(
        {
          ...basePayload,
          metadata: { ...basePayload.metadata, sanityDataset: "staging" },
        },
        { sanityProjectId: "proj", documentId: "doc-1", dataset: "production" },
      ),
    ).toBe(false);
  });

  it("rejects jobs without sanityDataset metadata", () => {
    expect(
      sanityJobMatchesPage(basePayload, {
        sanityProjectId: "proj",
        documentId: "doc-1",
        dataset: "production",
      }),
    ).toBe(false);
  });
});
