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

import { useId, useRef, useState } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_STEPS, type ReportStep } from "@/lib/reporting/report-units";

import { costsTabMessages as messages } from "./costs-tab.messages";
import { stepLabel } from "./report-format";
import { ReportSelect } from "./reports-filter-bar";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import { useAddExpense, type ReportSettings } from "./reports-queries";

const USD = /^\d{1,12}(\.\d{1,8})?$/;

/** Adds a cost Reports cannot see by itself, such as an agency invoice. Admins only. */
export function AddExpenseDialog({
  organizationSlug,
  settings,
  projectId: chosenProjectId,
  onClose,
}: {
  organizationSlug: string;
  settings: ReportSettings;
  projectId: string | null;
  onClose: () => void;
}) {
  const intl = useIntl();
  const addExpense = useAddExpense(organizationSlug);
  // One key per dialog, so saving twice by accident records one expense.
  const operationKey = useRef(crypto.randomUUID());
  const [projectId, setProjectId] = useState(chosenProjectId ?? "");
  const [step, setStep] = useState<ReportStep>("translation");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ids = { amount: useId(), note: useId() };

  async function save() {
    setError(null);
    if (!projectId) return setError(intl.formatMessage(messages.projectRequired));
    if (!USD.test(amount.trim())) return setError(intl.formatMessage(messages.amountInvalid));
    if (!note.trim()) return setError(intl.formatMessage(messages.noteRequired));
    try {
      await addExpense.mutateAsync({
        projectId,
        step,
        amountUsd: amount.trim(),
        note: note.trim(),
        operationKey: operationKey.current,
      });
      toast.success(intl.formatMessage(messages.saved));
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(messages.expenseTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.expenseDescription)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ReportSelect
              className="w-full"
              label={intl.formatMessage(pageMessages.project)}
              value={projectId}
              options={settings.projects.map((project) => ({
                value: project.id,
                label: project.name,
              }))}
              onChange={setProjectId}
            />
            <ReportSelect
              className="w-full"
              label={intl.formatMessage(pageMessages.step)}
              value={step}
              options={REPORT_STEPS.map((value) => ({ value, label: stepLabel(intl, value) }))}
              onChange={(value) => setStep(value as ReportStep)}
            />
          </div>
          <Field>
            <FieldLabel htmlFor={ids.amount}>{intl.formatMessage(messages.amount)}</FieldLabel>
            <Input
              id={ids.amount}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.note}>{intl.formatMessage(messages.note)}</FieldLabel>
            <Textarea
              id={ids.note}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {error ? <FieldError data-slot="field-error">{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button disabled={addExpense.isPending} onClick={() => void save()}>
            {intl.formatMessage(addExpense.isPending ? messages.saving : messages.save)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
