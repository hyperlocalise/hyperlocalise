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

import {
  generationModelFromGatewayId,
  generationTriggerFromJobSource,
  glossaryUses,
  parseGenerationProvenance,
  parseGenerationTrigger,
  translationMemoryUses,
} from "./generation-provenance";

const emptyProvenance = {
  guidelines: { documents: [] },
  glossaries: [],
  translationMemories: [],
  customInstructions: false,
};

describe("parseGenerationProvenance", () => {
  it("accepts a minimal valid object", () => {
    expect(parseGenerationProvenance(emptyProvenance)).toEqual(emptyProvenance);
  });

  it("rejects zero glossary term counts and omitted-false documents", () => {
    expect(
      parseGenerationProvenance({
        ...emptyProvenance,
        glossaries: [{ glossaryId: "g1", name: "Brand", termCount: 0 }],
      }),
    ).toBeNull();
    expect(
      parseGenerationProvenance({
        ...emptyProvenance,
        guidelines: {
          documents: [
            {
              documentId: "doc-1",
              revisionId: "rev-1",
              version: 1,
              title: "Style",
              mandatory: true,
              omitted: false,
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it("accepts an omitted mandatory document and a workspace guideline id", () => {
    const provenance = {
      ...emptyProvenance,
      guidelines: {
        workspace: { revisionId: "rev-ws", version: 0 },
        documents: [
          {
            documentId: "doc-1",
            revisionId: "rev-1",
            version: 2,
            title: "Tone",
            mandatory: true,
            omitted: true as const,
          },
        ],
      },
    };
    expect(parseGenerationProvenance(provenance)).toEqual(provenance);
  });
});

describe("parseGenerationTrigger", () => {
  it("parses each trigger kind and rejects a missing automation id", () => {
    expect(
      parseGenerationTrigger({
        kind: "automation",
        automationId: "auto-1",
        runId: "run-1",
        name: "Nightly",
      }),
    ).toEqual({
      kind: "automation",
      automationId: "auto-1",
      runId: "run-1",
      name: "Nightly",
    });
    expect(parseGenerationTrigger({ kind: "api_key", apiKeyId: "key-1" })).toEqual({
      kind: "api_key",
      apiKeyId: "key-1",
    });
    expect(parseGenerationTrigger({ kind: "conversation", interactionId: "ix-1" })).toEqual({
      kind: "conversation",
      interactionId: "ix-1",
    });
    expect(parseGenerationTrigger({ kind: "user", userId: "user-1" })).toEqual({
      kind: "user",
      userId: "user-1",
    });
    expect(
      parseGenerationTrigger({
        kind: "automation",
        runId: "run-1",
        name: "Nightly",
      }),
    ).toBeNull();
  });
});

describe("generationModelFromGatewayId", () => {
  it("splits provider/model and treats a bare id as unknown", () => {
    expect(generationModelFromGatewayId("anthropic/claude-3", "gateway")).toEqual({
      provider: "anthropic",
      model: "claude-3",
      credentialSource: "gateway",
    });
    expect(generationModelFromGatewayId("solo-model", "byok")).toEqual({
      provider: "unknown",
      model: "solo-model",
      credentialSource: "byok",
    });
    expect(generationModelFromGatewayId("/claude", "gateway")).toEqual({
      provider: "unknown",
      model: "/claude",
      credentialSource: "gateway",
    });
  });
});

describe("generationTriggerFromJobSource", () => {
  it("prefers api key, then conversation, then creator", () => {
    expect(
      generationTriggerFromJobSource({
        apiKeyId: "key-1",
        interactionId: "ix-1",
        createdByUserId: "user-1",
      }),
    ).toEqual({ kind: "api_key", apiKeyId: "key-1" });
    expect(
      generationTriggerFromJobSource({
        apiKeyId: null,
        interactionId: "ix-1",
        createdByUserId: "user-1",
      }),
    ).toEqual({ kind: "conversation", interactionId: "ix-1" });
    expect(
      generationTriggerFromJobSource({
        apiKeyId: null,
        interactionId: null,
        createdByUserId: "user-1",
      }),
    ).toEqual({ kind: "user", userId: "user-1" });
    expect(
      generationTriggerFromJobSource({
        apiKeyId: null,
        interactionId: null,
        createdByUserId: null,
      }),
    ).toBeUndefined();
  });
});

describe("glossaryUses and translationMemoryUses", () => {
  it("aggregates by first-seen id and keeps the first name", () => {
    expect(
      glossaryUses([
        { glossaryId: "g-brand", glossaryName: "Brand" },
        { glossaryId: "g-legal", glossaryName: "Legal" },
        { glossaryId: "g-brand", glossaryName: "Brand renamed" },
      ]),
    ).toEqual([
      { glossaryId: "g-brand", name: "Brand", termCount: 2 },
      { glossaryId: "g-legal", name: "Legal", termCount: 1 },
    ]);
    expect(
      translationMemoryUses([
        { memoryId: "tm-1", memoryName: "Product" },
        { memoryId: "tm-1", memoryName: "Product copy" },
        { memoryId: "tm-2", memoryName: "Support" },
      ]),
    ).toEqual([
      { memoryId: "tm-1", name: "Product", matchCount: 2 },
      { memoryId: "tm-2", name: "Support", matchCount: 1 },
    ]);
  });
});
