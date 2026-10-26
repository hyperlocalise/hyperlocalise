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
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { isApiResponseErrorCode } from "@/lib/api-error";

import { stepLabel } from "./report-format";
import { ReportSelect } from "./reports-filter-bar";
import { useSetTaskPricing, type TaskReport } from "./reports-queries";
import { taskReportMessages as messages } from "./task-report.messages";

type StepPricing = NonNullable<TaskReport["pricing"]>[number];

const NONE = "__none__";
const USD = /^\d{1,12}(\.\d{1,8})?$/;
const MAX_MINUTES = 525_600;

/** A step's own pricing for one task: its rate card, time estimate and fixed fee. */
export function TaskPricingDialog({
  organizationSlug,
  jobId,
  pricing,
  rateCardNames,
  onClose,
}: {
  organizationSlug: string;
  jobId: string;
  pricing: StepPricing;
  rateCardNames: string[];
  onClose: () => void;
}) {
  const intl = useIntl();
  const save = useSetTaskPricing(organizationSlug);
  const [rateCard, setRateCard] = useState(pricing.rateCardName ?? NONE);
  const [minutes, setMinutes] = useState(pricing.estimatedMinutes?.toString() ?? "");
  const [fee, setFee] = useState(pricing.overrideUsd ? String(Number(pricing.overrideUsd)) : "");
  const [error, setError] = useState<string | null>(null);
  const ids = { minutes: useId(), fee: useId() };
  const step = stepLabel(intl, pricing.step);

  async function submit() {
    setError(null);
    const estimatedMinutes = minutes.trim() === "" ? null : Number(minutes);
    if (
      estimatedMinutes !== null &&
      (!Number.isInteger(estimatedMinutes) ||
        estimatedMinutes < 0 ||
        estimatedMinutes > MAX_MINUTES)
    )
      return setError(intl.formatMessage(messages.minutesInvalid));
    const overrideUsd = fee.trim() === "" ? null : fee.trim();
    if (overrideUsd !== null && !USD.test(overrideUsd))
      return setError(intl.formatMessage(messages.feeInvalid));
    try {
      await save.mutateAsync({
        jobId,
        step: pricing.step,
        rateCardName: rateCard === NONE ? null : rateCard,
        estimatedMinutes,
        overrideUsd,
      });
      toast.success(intl.formatMessage(messages.pricingSaved));
      onClose();
    } catch (failure) {
      setError(
        isApiResponseErrorCode(failure, "task_rate_locked")
          ? intl.formatMessage(messages.pricingLocked)
          : failure instanceof Error
            ? failure.message
            : String(failure),
      );
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(messages.pricingTitle, { step })}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.pricingDescription)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <ReportSelect
              className="w-full"
              label={intl.formatMessage(messages.rateCardField)}
              value={rateCard}
              options={[
                { value: NONE, label: intl.formatMessage(messages.noCard) },
                ...rateCardNames.map((name) => ({ value: name, label: name })),
              ]}
              onChange={setRateCard}
            />
            <FieldDescription>
              {intl.formatMessage(messages.rateCardHelp, { step })}
            </FieldDescription>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={ids.minutes}>
                {intl.formatMessage(messages.estimateField)}
              </FieldLabel>
              <Input
                id={ids.minutes}
                type="number"
                min={0}
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
              <FieldDescription>{intl.formatMessage(messages.estimateHelp)}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.fee}>{intl.formatMessage(messages.feeField)}</FieldLabel>
              <Input
                id={ids.fee}
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
              <FieldDescription>{intl.formatMessage(messages.feeHelp, { step })}</FieldDescription>
            </Field>
          </div>
          {error ? <FieldError data-slot="field-error">{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button disabled={save.isPending} onClick={() => void submit()}>
            {intl.formatMessage(save.isPending ? messages.saving : messages.savePricing)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
