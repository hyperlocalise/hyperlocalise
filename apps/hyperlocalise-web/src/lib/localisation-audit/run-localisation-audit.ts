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
/**
 * Runs the public localisation audit against a live site on this machine, without the database,
 * the workflow queue, or a Vercel Sandbox:
 *
 *   vp run localisation-audit:run https://docs.tilion.dev/ [--locale fr] [--out report.json]
 *
 * Pages render in local Playwright Chromium (`vp run e2e:install` once) with the same script the
 * sandbox runs. AI-scored checks and the company profile call the AI Gateway, so set
 * `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` (`vercel env pull .env.local`). Without either, those
 * checks come back as not applicable.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { isErr } from "@/lib/primitives/result/results";
import { assertResolvablePublicHttpUrl } from "@/lib/security/public-http-fetch";
import { formatSsrfGuardError } from "@/lib/security/ssrf-guard";

import { auditBrowserPaths, buildAuditPlaywrightScript } from "./audit-playwright-script";
import { buildLocalisationAuditCompanyProfile } from "./company-profile";
import { crawlLocalisationAuditSample } from "./crawl";
import type { HtmlPageRenderer, RenderedHtmlPage } from "./crawl-renderer";
import { LOCALISATION_AUDIT_METHODOLOGY_VERSION } from "./credits/catalog";
import { runLocalisationAuditCredits } from "./credits/runner";
import { resolveDomainIdentity } from "./domain-slug";
import { parseAuditPageLayout } from "./layout";
import { hasLocalisationAuditSuccessfulPage } from "./report-coverage";
import { aggregateLocalisationAuditCredits } from "./score";
import type { LocalisationAuditFindingSeverity, LocalisationAuditReport } from "./types";

const execFileAsync = promisify(execFile);

const MAX_FOCUS_LOCALES = 2;
const RENDER_TIMEOUT_MS = 10 * 60 * 1000;
const RENDER_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const SEVERITY_ORDER: LocalisationAuditFindingSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

type ManifestPage = {
  requestedUrl: string;
  url: string;
  status: number;
  htmlPath?: string;
  error?: string;
  layout?: unknown;
};

function options(name: string) {
  return process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] ? [process.argv[index + 1]!] : [],
  );
}

function aiGatewayCredentialProblem(): string | null {
  if (process.env.AI_GATEWAY_API_KEY) return null;
  const token = process.env.VERCEL_OIDC_TOKEN;
  if (!token) return "no AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is set";
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return `VERCEL_OIDC_TOKEN expired at ${new Date(payload.exp * 1000).toISOString()} (run \`vercel env pull .env.local\`)`;
    }
  } catch {
    return "VERCEL_OIDC_TOKEN is not a valid JWT";
  }
  return null;
}

function positionalUrl() {
  const args = process.argv.slice(2);
  return args.find((value, index) => !value.startsWith("--") && !args[index - 1]?.startsWith("--"));
}

async function createLocalAuditBrowserSession(): Promise<HtmlPageRenderer> {
  const paths = auditBrowserPaths(await mkdtemp(path.join(tmpdir(), "hl-audit-browser-")));
  const playwrightModule = createRequire(import.meta.url).resolve("playwright");
  await writeFile(
    paths.scriptPath,
    buildAuditPlaywrightScript({ playwrightModule, outputDir: paths.outputDir }),
  );

  return {
    async render(urls: string[]): Promise<RenderedHtmlPage[]> {
      await writeFile(paths.inputPath, JSON.stringify({ urls }));
      console.error(`Rendering ${urls.length} page(s)...`);
      try {
        await execFileAsync("node", [paths.scriptPath], {
          timeout: RENDER_TIMEOUT_MS,
          maxBuffer: RENDER_MAX_BUFFER_BYTES,
        });
      } catch (error) {
        console.error("Chromium render failed:", error instanceof Error ? error.message : error);
        return [];
      }

      const manifest = JSON.parse(await readFile(paths.manifestPath, "utf8")) as {
        pages?: ManifestPage[];
      };
      const rendered: RenderedHtmlPage[] = [];
      for (const page of manifest.pages ?? []) {
        if (!page.htmlPath || page.error) {
          console.error(`  skipped ${page.requestedUrl}: ${page.error ?? "no html"}`);
          continue;
        }
        rendered.push({
          requestedUrl: page.requestedUrl,
          url: page.url,
          status: page.status,
          html: await readFile(page.htmlPath, "utf8"),
          layout: parseAuditPageLayout(page.layout),
        });
      }
      return rendered;
    },
    async close() {
      await rm(paths.outputDir, { recursive: true, force: true });
    },
  };
}

function printReport(report: LocalisationAuditReport) {
  const lines = [
    "",
    `Localisation audit: ${report.sourceUrl}`,
    `Score: ${report.score}  (locale coverage factor ${report.localeCoverageFactor ?? "n/a"})`,
    `Dimensions: ${Object.entries(report.dimensionScores ?? {})
      .map(([dimension, score]) => `${dimension} ${score ?? "n/a"}`)
      .join(", ")}`,
    `Locales: ${report.detectedLocales.map((entry) => entry.locale).join(", ") || "none detected"}`,
    `Pages crawled: ${report.pagesCrawled}`,
    ...report.pages.map((page) => `  ${page.status} ${page.url} [lang=${page.htmlLang ?? "-"}]`),
    "",
    "Credits:",
    ...(report.credits ?? []).map(
      (credit) =>
        `  ${String(credit.score ?? "n/a").padStart(3)}  ${credit.method.padEnd(9)} ${credit.dimension.padEnd(10)} ${credit.id}`,
    ),
    "",
    `Findings (${report.findings.length}):`,
    ...report.findings
      .toSorted(
        (left, right) =>
          SEVERITY_ORDER.indexOf(left.severity) - SEVERITY_ORDER.indexOf(right.severity),
      )
      .map(
        (finding) =>
          `  [${finding.severity}] ${finding.title}${finding.url ? ` (${finding.url})` : ""}\n      ${finding.summary}`,
      ),
  ];
  console.log(lines.join("\n"));
}

async function main() {
  const url = positionalUrl();
  if (!url) {
    console.error("usage: <url> [--locale <code>]... [--out <report.json>]");
    process.exitCode = 1;
    return;
  }
  const credentialProblem = aiGatewayCredentialProblem();
  if (credentialProblem) {
    console.error(`Warning: ${credentialProblem}, so AI-scored checks will be n/a.`);
  }

  const identity = resolveDomainIdentity(url);
  if (isErr(identity)) {
    console.error(`Invalid URL: ${identity.error.code}`);
    process.exitCode = 1;
    return;
  }
  const { domainKey, domainSlug, sourceUrl } = identity.value;
  const resolvable = await assertResolvablePublicHttpUrl(sourceUrl);
  if (isErr(resolvable)) {
    console.error(formatSsrfGuardError(resolvable.error));
    process.exitCode = 1;
    return;
  }
  const focusLocales = options("--locale").slice(0, MAX_FOCUS_LOCALES);

  console.error(`Crawling ${sourceUrl}...`);
  const crawl = await crawlLocalisationAuditSample(
    { origin: new URL(sourceUrl).origin, sourceUrl, focusLocales },
    { createRenderer: createLocalAuditBrowserSession },
  );
  if (crawl.blockedReason) {
    console.error(`Blocked by the site: ${crawl.blockedReason}`);
    process.exitCode = 1;
    return;
  }
  if (!hasLocalisationAuditSuccessfulPage(crawl.pages)) {
    console.error(`No page loaded successfully (${crawl.pages.length} crawled).`);
    process.exitCode = 1;
    return;
  }

  console.error("Scoring...");
  const [companyProfile, scored] = await Promise.all([
    buildLocalisationAuditCompanyProfile({ domainKey, pages: crawl.pages }),
    runLocalisationAuditCredits({
      pages: crawl.pages,
      focusLocales,
      sitemap: crawl.sitemap,
    }),
  ]);
  const { score, dimensionScores, localeCoverageFactor } = aggregateLocalisationAuditCredits(
    scored.credits,
    { localeCount: scored.detectedLocales.length },
  );

  const report: LocalisationAuditReport = {
    score,
    domainKey,
    domainSlug,
    sourceUrl,
    focusLocales,
    detectedLocales: scored.detectedLocales,
    findings: scored.findings,
    pages: crawl.pages.map((page) => ({
      url: page.url,
      status: page.status,
      htmlLang: page.htmlLang,
      title: page.title,
    })),
    linguisticNotes: scored.linguisticNotes,
    pagesCrawled: crawl.pages.length,
    completedAt: new Date().toISOString(),
    dimensionScores,
    credits: scored.credits,
    companyProfile,
    methodologyVersion: LOCALISATION_AUDIT_METHODOLOGY_VERSION,
    localeCoverageFactor,
  };

  printReport(report);
  const out = options("--out")[0];
  if (out) {
    await writeFile(out, `${JSON.stringify({ report, crawl }, null, 2)}\n`);
    console.error(`\nWrote full report and crawl to ${out}`);
  }
}

await main();
