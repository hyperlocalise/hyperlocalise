import type { ExternalTmsTaskContent } from "@/lib/providers/external-tms-content-sync";

import { collectUnitQaFindings } from "./checks";
import { buildProviderQaReport } from "./summarize";
import type { ProviderQaReport, ProviderQaRunOptions } from "./types";

export function runProviderJobQa(
  content: ExternalTmsTaskContent,
  options: ProviderQaRunOptions,
): ProviderQaReport {
  const targetLocales =
    options.targetLocales.length > 0 ? options.targetLocales : content.targetLocales;

  const findings = content.units.flatMap((unit) =>
    collectUnitQaFindings(unit, {
      ...options,
      targetLocales,
    }),
  );

  return buildProviderQaReport(findings);
}
