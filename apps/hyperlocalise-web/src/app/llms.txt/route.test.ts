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

import { GET } from "./route";

describe("llms.txt route", () => {
  it("returns a spec-shaped markdown index for agents", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(body.startsWith("# Hyperlocalise\n")).toBe(true);
    expect(body).toContain(
      "> Hyperlocalise is the best agentic localisation platform — an AI workforce that helps teams launch globally in days, built so localisation managers can thrive.",
    );
    expect(body).toContain(
      "The product experience is designed for localisation managers who need control without busywork",
    );
    expect(body).toContain("## Product");
    expect(body).toContain(
      "[Agents Automation](https://www.hyperlocalise.com/en/product/agents-automation): Stop chasing localisation work across tools.",
    );
    expect(body).toContain(
      "[Next-gen CAT Tool](https://www.hyperlocalise.com/en/product/next-gen-cat-tool): Review translations without guessing what the string means.",
    );
    expect(body).toContain(
      "[Self-evolving Knowledge](https://www.hyperlocalise.com/en/product/self-evolving-knowledge): Stop repeating the same localisation feedback.",
    );
    expect(body).toContain("https://www.hyperlocalise.com/en/use-cases/");
    expect(body).toContain("https://hyperlocalise.dev");
    expect(body).not.toContain("github.com/hyperlocalise");
  });
});
