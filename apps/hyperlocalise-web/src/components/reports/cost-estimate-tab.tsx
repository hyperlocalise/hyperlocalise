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
"use client";

import { useIntl } from "react-intl";

import type { RateBasis } from "@/lib/reporting/report-units";
import { MATCH_BUCKETS, type MatchBucket } from "@/lib/reporting/word-analysis";

import { costEstimateTabMessages as messages } from "./cost-estimate-tab.messages";
import { MatchBandTable, visibleBands } from "./match-band-table";
import {
  formatCount,
  formatRateAmount,
  formatShare,
  formatUsd,
  stepLabel,
  unitLabel,
} from "./report-format";
import { DownloadCsvButton, ReportEmpty, ReportSectionState } from "./report-section";
import { ReportStatCard, ReportStatCards } from "./report-stat-card";
import {
  costEstimateQuery,
  reportDownloadUrl,
  useCostEstimate,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { UnitSwitch } from "./word-counts-tab";

type Estimate = NonNullable<ReturnType<typeof useCostEstimate>["data"]>;
type EstimateRow = Estimate["rows"][number];
type Intl = ReturnType<typeof useIntl>;

const PER_BASIS = {
  word: messages.perBasis_word,
  character: messages.perBasis_character,
  character_with_spaces: messages.perBasis_character_with_spaces,
  hour: messages.perBasis_hour,
} satisfies Record<RateBasis, unknown>;

const BASIS_NOUN = {
  word: messages.basis_word,
  character: messages.basis_character,
  character_with_spaces: messages.basis_character_with_spaces,
  hour: messages.basis_hour,
} satisfies Record<RateBasis, unknown>;

/** A row's rate, with the unit it is charged per: "$0.04 / character". */
export function rateText(intl: Intl, row: Pick<EstimateRow, "pricing" | "rate" | "basis">) {
  if (row.pricing === "fixed") return intl.formatMessage(messages.fixedFee);
  if (row.pricing === "none" || !row.rate || !row.basis) return intl.formatMessage(messages.noRate);
  return intl.formatMessage(PER_BASIS[row.basis], { rate: formatRateAmount(intl, row.rate) });
}

/** The shares a single set of rates pays per band, when every priced row agrees on them. */
function sharedPercentages(rows: EstimateRow[]) {
  const priced = rows.filter((row) => row.pricing === "rate" && row.basis !== "hour");
  if (priced.length === 0) return null;
  const key = (row: EstimateRow) =>
    MATCH_BUCKETS.map((bucket) => row.percentages?.[bucket] ?? 100).join(",");
  return priced.every((row) => key(row) === key(priced[0])) ? priced[0].percentages : null;
}

export function CostEstimateTab({
  input,
  rateCardName,
  onChange,
}: {
  input: SectionInput;
  /** The card the estimate falls back to, shown in its detail line. */
  rateCardName: string | null;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const estimateInput = { ...input, state: { ...input.state, rateCard: rateCardName } };
  const estimate = useCostEstimate(estimateInput);
  if (input.state.jobIds.length === 0)
    return (
      <ReportEmpty
        title={intl.formatMessage(messages.chooseTasksTitle)}
        description={intl.formatMessage(messages.chooseTasksDescription)}
      />
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UnitSwitch value={input.state.unit} onChange={(unit) => onChange({ unit })} />
        <DownloadCsvButton
          href={reportDownloadUrl(
            input.organizationSlug,
            "cost-estimate",
            costEstimateQuery(estimateInput),
          )}
        />
      </div>
      <ReportSectionState query={estimate} skeletonHeight={360}>
        {(data) => <EstimateBody data={data} unitName={unitLabel(intl, input.state.unit)} />}
      </ReportSectionState>
    </div>
  );
}

function EstimateBody({ data, unitName }: { data: Estimate; unitName: string }) {
  const intl = useIntl();
  const { totals } = data;
  const bands = visibleBands(totals.bands);
  const percentages = sharedPercentages(data.rows);
  const unrated = [
    ...new Set(data.rows.filter((row) => row.pricing === "none").map((row) => row.targetLocale)),
  ];
  const showStep = new Set(data.rows.map((row) => row.step)).size > 1;
  return (
    <>
      <ReportStatCards>
        <ReportStatCard
          label={intl.formatMessage(messages.unitsToTranslate, { unit: unitName })}
          value={formatCount(intl, totals.units)}
          detail={intl.formatMessage(messages.unitsDetail, {
            tasks: intl.formatMessage(messages.tasksCount, { count: totals.tasks }),
            languages: intl.formatMessage(messages.languagesCount, { count: totals.languages }),
          })}
        />
        {totals.weighted !== null && totals.weightedBasis ? (
          <ReportStatCard
            label={intl.formatMessage(messages.weighted, {
              basis: intl.formatMessage(BASIS_NOUN[totals.weightedBasis]),
            })}
            value={formatCount(intl, totals.weighted)}
            detail={intl.formatMessage(messages.weightedDetail)}
          />
        ) : null}
        <ReportStatCard
          label={intl.formatMessage(messages.estimatedCost)}
          value={formatUsd(intl, totals.costUsd)}
          detail={
            totals.incomplete
              ? intl.formatMessage(messages.incomplete)
              : data.rateCardName
                ? intl.formatMessage(messages.estimatedCostDetail, { card: data.rateCardName })
                : intl.formatMessage(messages.estimatedCostNoCard)
          }
        />
        <ReportStatCard
          label={intl.formatMessage(messages.memorySavings)}
          value={formatShare(intl, totals.memorySavings)}
          detail={intl.formatMessage(messages.memorySavingsDetail)}
        />
      </ReportStatCards>
      <MatchBandTable
        label={intl.formatMessage(messages.tableLabel)}
        rows={data.rows}
        rowKey={(row) => `${row.targetLocale}:${row.step}:${row.pricing}:${row.rateId}`}
        bands={bands}
        beforeRows={
          percentages
            ? {
                label: intl.formatMessage(messages.paidAt),
                bands: Object.fromEntries(
                  bands.map((bucket: MatchBucket) => [
                    bucket,
                    intl.formatNumber(
                      (percentages[bucket === "unavailable" ? "new" : bucket] ?? 100) / 100,
                      { style: "percent" },
                    ),
                  ]),
                ),
              }
            : undefined
        }
        leading={[
          {
            key: "language",
            header: intl.formatMessage(messages.languageColumn),
            cell: (row) => row.targetLocale,
          },
          ...(showStep
            ? [
                {
                  key: "step",
                  header: intl.formatMessage(messages.stepColumn),
                  cell: (row: EstimateRow) => stepLabel(intl, row.step),
                  muted: true,
                },
              ]
            : []),
        ]}
        trailing={[
          {
            key: "units",
            header: unitName,
            cell: (row) => formatCount(intl, row.units),
            numeric: true,
          },
          {
            key: "weighted",
            header: intl.formatMessage(messages.weightedColumn),
            cell: (row) => (row.weighted === null ? "—" : formatCount(intl, row.weighted)),
            numeric: true,
          },
          {
            key: "rate",
            header: intl.formatMessage(messages.rateColumn),
            cell: (row) => rateText(intl, row),
            numeric: true,
            muted: true,
          },
          {
            key: "cost",
            header: intl.formatMessage(messages.costColumn),
            cell: (row) =>
              row.unestimated && row.costUsd === null
                ? intl.formatMessage(messages.noEstimate)
                : formatUsd(intl, row.costUsd),
            numeric: true,
          },
        ]}
        totals={{
          bands: totals.bands,
          trailing: [
            formatCount(intl, totals.units),
            totals.weighted === null ? null : formatCount(intl, totals.weighted),
            null,
            formatUsd(intl, totals.costUsd),
          ],
        }}
      />
      {data.fixedFees.length ? (
        <div className="flex flex-col gap-1 text-[13px]">
          <p className="font-medium">{intl.formatMessage(messages.fixedFees)}</p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {data.fixedFees.map((fee) => (
              <li key={`${fee.jobId}:${fee.step}`}>
                {fee.jobTitle} · {stepLabel(intl, fee.step)} · {formatUsd(intl, fee.amountUsd)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
        {unrated.length ? (
          <p>
            {intl.formatMessage(messages.noRateNote, {
              languages: intl.formatList(unrated),
              count: unrated.length,
            })}
          </p>
        ) : null}
        {data.fixedFeesLeftOut > 0 ? (
          <p>{intl.formatMessage(messages.fixedFeesLeftOut, { count: data.fixedFeesLeftOut })}</p>
        ) : null}
        {data.rows.some((row) => row.unestimated) ? (
          <p>{intl.formatMessage(messages.unestimatedNote)}</p>
        ) : null}
        {totals.uncounted > 0 ? (
          <p>{intl.formatMessage(messages.uncountedNote, { count: totals.uncounted })}</p>
        ) : null}
        <p>{intl.formatMessage(messages.pricingOrder)}</p>
      </div>
    </>
  );
}
