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
  matchVercelAiGatewayModelId,
  normalizeVercelAiGatewayModelId,
  toVercelAiGatewayModelId,
} from "@/lib/providers/shared/vercel-ai-gateway-model-id";

describe("toVercelAiGatewayModelId", () => {
  it("prefixes OpenAI native ids", () => {
    expect(toVercelAiGatewayModelId({ provider: "openai", model: "gpt-6-luna" })).toBe(
      "openai/gpt-6-luna",
    );
  });

  it("maps Gemini native ids to the Google gateway prefix", () => {
    expect(toVercelAiGatewayModelId({ provider: "gemini", model: "gemini-2.5-pro" })).toBe(
      "google/gemini-2.5-pro",
    );
    expect(toVercelAiGatewayModelId({ provider: "gemini", model: "gemini-3.8-flash" })).toBe(
      "google/gemini-3.8-flash",
    );
  });

  it("maps Anthropic native ids to gateway dotted versions", () => {
    expect(toVercelAiGatewayModelId({ provider: "anthropic", model: "claude-sonnet-4-6" })).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(toVercelAiGatewayModelId({ provider: "anthropic", model: "claude-opus-5-5" })).toBe(
      "anthropic/claude-opus-5.5",
    );
    expect(toVercelAiGatewayModelId({ provider: "anthropic", model: "claude-sonnet-5" })).toBe(
      "anthropic/claude-sonnet-5",
    );
  });

  it("normalizes Anthropic gateway ids that still use native hyphens", () => {
    expect(
      toVercelAiGatewayModelId({ provider: "anthropic", model: "anthropic/claude-sonnet-4-6" }),
    ).toBe("anthropic/claude-sonnet-4.6");
  });

  it("returns empty and whitespace-only models unchanged", () => {
    expect(toVercelAiGatewayModelId({ provider: "openai", model: "" })).toBe("");
    expect(toVercelAiGatewayModelId({ provider: "openai", model: "   " })).toBe("");
  });
});

describe("normalizeVercelAiGatewayModelId", () => {
  it("leaves non-Anthropic gateway ids unchanged", () => {
    expect(normalizeVercelAiGatewayModelId("openai/gpt-6-luna")).toBe("openai/gpt-6-luna");
  });

  it("trims whitespace and leaves bare model ids unchanged", () => {
    expect(normalizeVercelAiGatewayModelId("  openai/gpt-6-luna  ")).toBe("openai/gpt-6-luna");
    expect(normalizeVercelAiGatewayModelId("gpt-6-luna")).toBe("gpt-6-luna");
  });

  it("rewrites hyphenated Anthropic gateway versions to dotted form", () => {
    expect(normalizeVercelAiGatewayModelId("anthropic/claude-opus-5-5")).toBe(
      "anthropic/claude-opus-5.5",
    );
  });
});

describe("matchVercelAiGatewayModelId", () => {
  const allowed = ["anthropic/claude-opus-5.5", "openai/gpt-6-luna"] as const;

  it("matches canonical ids", () => {
    expect(matchVercelAiGatewayModelId("anthropic/claude-opus-5.5", allowed)).toBe(
      "anthropic/claude-opus-5.5",
    );
  });

  it("matches legacy Anthropic hyphenated gateway ids", () => {
    expect(matchVercelAiGatewayModelId("anthropic/claude-opus-5-5", allowed)).toBe(
      "anthropic/claude-opus-5.5",
    );
  });

  it("trims whitespace before matching", () => {
    expect(matchVercelAiGatewayModelId("  anthropic/claude-opus-5-5  ", allowed)).toBe(
      "anthropic/claude-opus-5.5",
    );
  });

  it("returns null when no allowed id matches", () => {
    expect(matchVercelAiGatewayModelId("anthropic/claude-opus-4", allowed)).toBeNull();
    expect(matchVercelAiGatewayModelId("claude-opus-5.5", allowed)).toBeNull();
  });
});
