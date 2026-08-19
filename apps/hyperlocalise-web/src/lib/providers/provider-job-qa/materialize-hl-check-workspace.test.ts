/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
    10| * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";

import { buildHlCheckWorkspaceBundle } from "./materialize-hl-check-workspace";

describe("buildHlCheckWorkspaceBundle", () => {
    20|  it("writes i18n.yml instead of i18n.jsonc", () => {
    const bundle = buildHlCheckWorkspaceBundle(
      {
        externalJobId: "job-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "greeting",
            sourceText: "Hello",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      },
      ["fr"],
    );

    expect(bundle.configPath).toBe("/tmp/hl-provider-qa/i18n.yml");
    const configFile = bundle.files.find((file) => file.path === bundle.configPath);
    expect(configFile?.content).toContain("locales:");
    expect(configFile?.content).toContain("source: en");
    expect(configFile?.content).toContain("- fr");
    expect(configFile?.content).toContain("from:");
    expect(configFile?.content).toContain(`model: ${hyperlocaliseAgentModelId}`);
    expect(bundle.files.some((file) => file.path.endsWith("i18n.jsonc"))).toBe(false);
  });
});
