import type { ExternalTmsTaskContent } from "@/lib/providers/sync/external-tms-content-sync";

import { mapHlCheckReportToProviderFindings } from "./map-hl-findings";
import { runHlCheckOnProviderContent } from "./run-hl-check";
import { collectSupplementalQaFindings } from "./supplemental-checks";
import { buildProviderQaReport } from "./summarize";
import type { ProviderQaReport, ProviderQaRunOptions } from "./types";

export async function buildProviderJobQaReport(
  content: ExternalTmsTaskContent,
  options: ProviderQaRunOptions,
  hlResult: Awaited<ReturnType<typeof runHlCheckOnProviderContent>>,
): Promise<ProviderQaReport> {
  const targetLocales =
    options.targetLocales.length > 0 ? options.targetLocales : content.targetLocales;
  const sourceLocale = options.sourceLocale ?? content.sourceLocale ?? "en";

  const hlFindings = mapHlCheckReportToProviderFindings({
    report: hlResult.report,
    manifest: hlResult.keyManifest,
    sourceLocale,
  });

  const supplementalFindings = content.units.flatMap((unit) =>
    collectSupplementalQaFindings(unit, {
      ...options,
      targetLocales,
      sourceLocale,
    }),
  );

  return buildProviderQaReport([...hlFindings, ...supplementalFindings]);
}

export async function runProviderJobQa(
  content: ExternalTmsTaskContent,
  options: ProviderQaRunOptions,
): Promise<ProviderQaReport> {
  const targetLocales =
    options.targetLocales.length > 0 ? options.targetLocales : content.targetLocales;

  const hlResult = await runHlCheckOnProviderContent({
    content,
    targetLocales,
  });

  return buildProviderJobQaReport(content, options, hlResult);
}
