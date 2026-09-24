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

import { redactLlmObsContent } from "../../../datadog-content-policy.mjs";
import { createAiTelemetry } from "./ai-telemetry";

describe("AI telemetry content policy", () => {
  it("disables input and output recording and exports only a stable workflow name", () => {
    expect(createAiTelemetry("translation-generation")).toEqual({
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      functionId: "translation-generation",
    });
  });

  it("redacts prohibited content immediately before Datadog export", () => {
    const span = {
      kind: "tool",
      input: [
        {
          content: "source, translation, prompt, tool arguments, credential, user@example.com",
        },
      ],
      output: [{ content: "completion, tool result, extracted document text" }],
      getTag: (name: string) => (name === "model" ? "safe-model" : undefined),
    };

    expect(redactLlmObsContent(span)).toBe(span);
    expect(span.input).toEqual([]);
    expect(span.output).toEqual([]);
    expect(span.getTag("model")).toBe("safe-model");
  });

  it("returns isolated telemetry objects for concurrent requests", async () => {
    const [translation, audit] = await Promise.all([
      Promise.resolve(createAiTelemetry("translation-generation")),
      Promise.resolve(createAiTelemetry("localisation-audit")),
    ]);

    expect(translation).not.toBe(audit);
    expect(translation.functionId).toBe("translation-generation");
    expect(audit.functionId).toBe("localisation-audit");
  });
});
