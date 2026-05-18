import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@/lib/agents/github/app", () => ({
  getInstallationOctokit: vi.fn(),
}));

import { getCommittableChangedPaths } from "./github-fix";

describe("github fix committable changed paths", () => {
  it("includes modified tracked translation files", () => {
    const paths = getCommittableChangedPaths(" M locales/en.json\0");

    expect(paths).toEqual(["locales/en.json"]);
  });

  it("includes untracked translation output files", () => {
    const paths = getCommittableChangedPaths("?? apps/web/messages/fr.json\0");

    expect(paths).toEqual(["apps/web/messages/fr.json"]);
  });

  it("excludes internal Hyperlocalise reports", () => {
    const paths = getCommittableChangedPaths(
      [
        "?? .hyperlocalise/fix-report.json",
        "?? .hyperlocalise/scoped-check-report.json",
        " M locales/en.json",
      ].join("\0"),
    );

    expect(paths).toEqual(["locales/en.json"]);
  });

  it("returns no committable paths for report-only output", () => {
    const paths = getCommittableChangedPaths("?? .hyperlocalise/fix-report.json\0");

    expect(paths).toEqual([]);
  });
});
