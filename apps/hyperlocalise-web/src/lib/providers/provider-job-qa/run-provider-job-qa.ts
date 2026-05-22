import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";

import { mapHlCheckReportToProviderFindings } from "./map-hl-findings";
import { runHlCheckOnProviderContent } from "./run-hl-check";
import { collectSupplementalQaFindings } from "./supplemental-checks";
import { buildProviderQaReport } from "./summarize";
import type { ProviderQaReport, ProviderQaRunOptions } from "./types";

export async function runProviderJobQa(
  content: ExternalTmsTaskContent,
  options: ProviderQaRunOptions,
): Promise<ProviderQaReport> {
  const targetLocales =
    options.targetLocales.length > 0 ? options.targetLocales : content.targetLocales;
  const sourceLocale = options.sourceLocale ?? content.sourceLocale ?? "en";

  const hlResult = await runHlCheckOnProviderContent({
    content,
    targetLocales,
  });

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
