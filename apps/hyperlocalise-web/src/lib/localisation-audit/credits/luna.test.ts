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
import { z } from "zod";

import { lunaOutputSchema } from "./luna";

function assertOpenAiRequired(schema: unknown, path: string) {
  if (!schema || typeof schema !== "object") {
    return;
  }
  const node = schema as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
  };
  if (node.properties) {
    const keys = Object.keys(node.properties).toSorted();
    expect(node.required?.toSorted(), path).toEqual(keys);
    for (const [key, value] of Object.entries(node.properties)) {
      assertOpenAiRequired(value, `${path}.${key}`);
    }
  }
  if (node.items) {
    assertOpenAiRequired(node.items, `${path}[]`);
  }
}

describe("lunaOutputSchema", () => {
  it("lists every object property in required for OpenAI json_schema", () => {
    const jsonSchema = z.toJSONSchema(lunaOutputSchema);
    assertOpenAiRequired(jsonSchema, "root");
  });

  it("accepts null evidence and url on findings", () => {
    const parsed = lunaOutputSchema.parse({
      credits: [
        {
          id: "fluency",
          score: 71,
          confidence: 82,
          findings: [
            {
              severity: "low",
              title: "Awkward phrasing",
              summary: "Slightly literal.",
              evidence: null,
              url: null,
            },
          ],
        },
      ],
      notes: [],
    });

    expect(parsed.credits[0]?.findings[0]).toEqual({
      severity: "low",
      title: "Awkward phrasing",
      summary: "Slightly literal.",
      evidence: null,
      url: null,
    });
  });
});
