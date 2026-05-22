import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { findMonorepoRoot } from "./find-repo-root";
import { runHlCheckOnProviderContent } from "./run-hl-check";
import { mapHlCheckReportToProviderFindings } from "./map-hl-findings";

async function resolveHlBinary(): Promise<string | null> {
  const candidates = [
    process.env.HL_CLI_PATH,
    path.join(await findMonorepoRoot(), "bin", "hl"),
    "/tmp/hl",
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return null;
}

describe("hl check integration", () => {
  it("runs hl check against materialized provider content", async () => {
    const hlPath = await resolveHlBinary();
    if (!hlPath) {
      return;
    }

    const result = await runHlCheckOnProviderContent({
      content: {
        externalJobId: "job-1",
        sourceLocale: "en",
        targetLocales: ["fr"],
        units: [
          {
            externalStringId: "1",
            key: "greeting",
            sourceText: "Hello {name}",
            translations: [{ locale: "fr", text: "Bonjour" }],
          },
        ],
      },
      targetLocales: ["fr"],
      resolveInvocation: async () => ({
        command: hlPath,
        prefixArgs: [],
        cwd: await findMonorepoRoot(),
      }),
    });

    const findings = mapHlCheckReportToProviderFindings({
      report: result.report,
      manifest: result.keyManifest,
      sourceLocale: "en",
    });

    expect(findings.some((finding) => finding.checkType === "placeholder_mismatch")).toBe(true);
  });
});
