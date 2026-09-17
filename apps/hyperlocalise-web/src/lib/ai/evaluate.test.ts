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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { experimentalEvaluate, jevModelId } from "./evaluate";

const { evaluateMock } = vi.hoisted(() => ({
  evaluateMock: vi.fn(),
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");

  return {
    ...actual,
    experimental_evaluate: evaluateMock,
  };
});

describe("experimentalEvaluate", () => {
  beforeEach(() => {
    evaluateMock.mockReset();
    evaluateMock.mockResolvedValue({
      answers: {
        refunded: { type: "boolean", probability: 0.99 },
      },
    });
  });

  it("calls AI SDK experimental_evaluate with Jev by default", async () => {
    const result = await experimentalEvaluate({
      state: "The support agent issued a full refund to the customer.",
      questions: {
        refunded: {
          type: "boolean",
          instructions: "Was a refund issued?",
        },
      },
      providerOptions: {
        gateway: { zeroDataRetention: true },
      },
    });

    expect(evaluateMock).toHaveBeenCalledWith({
      model: jevModelId,
      state: "The support agent issued a full refund to the customer.",
      questions: {
        refunded: {
          type: "boolean",
          instructions: "Was a refund issued?",
        },
      },
      providerOptions: {
        gateway: { zeroDataRetention: true },
      },
    });
    expect(result.answers.refunded.probability).toBe(0.99);
  });

  it("passes through an explicit evaluation model", async () => {
    await experimentalEvaluate({
      model: "typesafe-ai/jev-latest",
      state: "I was charged twice.",
      questions: {
        refund: {
          type: "boolean",
          instructions: "Is the customer asking for a refund?",
        },
      },
    });

    expect(evaluateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "typesafe-ai/jev-latest",
      }),
    );
  });
});
