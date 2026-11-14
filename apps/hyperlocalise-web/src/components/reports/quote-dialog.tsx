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

import { useId, useState } from "react";
import type { IntlShape } from "react-intl";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { CostEstimate, ReportQuery } from "@/lib/go-svc/go-svc-reports-api";
import { addDays } from "@/lib/reporting/report-period";

import { quoteDialogMessages as messages } from "./quote-dialog.messages";
import { formatCount, formatRateAmount, formatUsd, stepLabel } from "./report-format";
import { saveReportDownload } from "./report-section";
import { useReportCsv } from "./reports-queries";

const DEFAULT_VALID_DAYS = 30;

export type QuoteDetails = {
  client: string;
  reference: string;
  validDays: number;
  issued: string;
};

/**
 * Turns the estimate on screen into a quote: an Excel workbook from go-svc, or a page the
 * browser prints or saves as PDF. The client, reference and validity are the person's own; the
 * figures are the estimate's.
 */
export function QuoteDialog({
  organizationSlug,
  query,
  estimate,
  today,
  onClose,
}: {
  organizationSlug: string;
  /** The estimate's own query, as its CSV download sends it. */
  query: ReportQuery;
  estimate: CostEstimate | undefined;
  today: string;
  onClose: () => void;
}) {
  const intl = useIntl();
  const downloads = useReportCsv(organizationSlug);
  const [client, setClient] = useState("");
  const [reference, setReference] = useState("");
  const [validDays, setValidDays] = useState(String(DEFAULT_VALID_DAYS));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const clientId = useId();
  const referenceId = useId();
  const validId = useId();

  function details(): QuoteDetails | null {
    const days = Number(validDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError(intl.formatMessage(messages.validDaysInvalid));
      return null;
    }
    setError(null);
    return { client: client.trim(), reference: reference.trim(), validDays: days, issued: today };
  }

  async function downloadExcel() {
    const quote = details();
    if (!quote) return;
    setPending(true);
    try {
      const file = await downloads.quote({
        ...query,
        ...(quote.client ? { client: quote.client } : {}),
        ...(quote.reference ? { reference: quote.reference } : {}),
        validDays: String(quote.validDays),
      });
      saveReportDownload(file);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  }

  function print() {
    const quote = details();
    if (!quote || !estimate) return;
    const page = window.open("", "_blank");
    if (!page) return setError(intl.formatMessage(messages.printBlocked));
    page.document.open();
    page.document.write(quoteDocument(intl, estimate, quote));
    page.document.close();
    page.focus();
    page.print();
  }

  return (
    <Dialog open onOpenChange={(open) => (open || pending ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(messages.title)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.description)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor={clientId}>{intl.formatMessage(messages.client)}</FieldLabel>
            <Input
              id={clientId}
              maxLength={200}
              value={client}
              onChange={(event) => setClient(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={referenceId}>{intl.formatMessage(messages.reference)}</FieldLabel>
            <Input
              id={referenceId}
              maxLength={100}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={validId}>{intl.formatMessage(messages.validDays)}</FieldLabel>
            <Input
              id={validId}
              inputMode="numeric"
              value={validDays}
              onChange={(event) => setValidDays(event.target.value)}
            />
          </Field>
          {error ? <FieldError data-slot="field-error">{error}</FieldError> : null}
        </div>
        <DialogFooter className="flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button variant="outline" disabled={pending || !estimate} onClick={print}>
            {intl.formatMessage(messages.printPdf)}
          </Button>
          <Button disabled={pending} onClick={() => void downloadExcel()}>
            {intl.formatMessage(messages.downloadExcel)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text as HTML: the client and reference are the person's own words, never markup. */
export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

/** The printed quote as a standalone HTML page, every value escaped. */
export function quoteDocument(intl: IntlShape, estimate: CostEstimate, quote: QuoteDetails) {
  const t = (
    descriptor: Parameters<IntlShape["formatMessage"]>[0],
    values?: Record<string, string>,
  ) => escapeHtml(intl.formatMessage(descriptor, values));
  const day = (value: string) =>
    escapeHtml(
      intl.formatDate(`${value}T00:00:00Z`, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    );
  const facts = [
    quote.client ? [t(messages.forLabel), escapeHtml(quote.client)] : null,
    quote.reference ? [t(messages.referenceLabel), escapeHtml(quote.reference)] : null,
    [t(messages.dateLabel), day(quote.issued)],
    [t(messages.validUntilLabel), day(addDays(quote.issued, quote.validDays))],
  ].filter((fact): fact is string[] => fact !== null);
  const lines = estimate.rows
    .filter((row) => row.pricing === "rate")
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.targetLocale)}</td>
        <td>${escapeHtml(stepLabel(intl, row.step))}</td>
        <td class="n">${escapeHtml(formatCount(intl, row.units))}</td>
        <td class="n">${row.rate ? escapeHtml(formatRateAmount(intl, row.rate)) : ""}</td>
        <td class="n">${escapeHtml(formatUsd(intl, row.costUsd))}</td>
      </tr>`,
    );
  const fees = estimate.fixedFees.map(
    (fee) => `<tr>
      <td colspan="2">${t(messages.fixedFee, { task: fee.jobTitle })}</td>
      <td></td><td></td>
      <td class="n">${escapeHtml(formatUsd(intl, fee.amountUsd))}</td>
    </tr>`,
  );
  return `<!doctype html>
<html lang="${escapeHtml(intl.locale)}">
<head>
<meta charset="utf-8">
<title>${t(messages.quoteHeading)}</title>
<style>
  body { font: 13px/1.5 system-ui, sans-serif; color: #111; margin: 40px; }
  h1 { font-size: 24px; margin: 0 0 16px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 24px; }
  dt { font-weight: 600; }
  dd { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
  th { font-weight: 600; }
  .n { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-bottom: none; }
  p.note { color: #555; margin-top: 16px; }
</style>
</head>
<body>
<h1>${t(messages.quoteHeading)}</h1>
<dl>${facts.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("")}</dl>
<table>
  <thead><tr>
    <th>${t(messages.languageColumn)}</th>
    <th>${t(messages.stepColumn)}</th>
    <th class="n">${t(messages.unitsColumn)}</th>
    <th class="n">${t(messages.rateColumn)}</th>
    <th class="n">${t(messages.amountColumn)}</th>
  </tr></thead>
  <tbody>${[...lines, ...fees].join("")}</tbody>
  <tfoot><tr>
    <td colspan="4" class="n">${t(messages.total)}</td>
    <td class="n">${escapeHtml(formatUsd(intl, estimate.totals.costUsd))}</td>
  </tr></tfoot>
</table>
${estimate.totals.incomplete ? `<p class="note">${t(messages.notExact)}</p>` : ""}
</body>
</html>`;
}
