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

import { useEffect, useId, useState } from "react";
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

import { budgetsTabMessages as messages } from "./budgets-tab.messages";
import { ReportSelect } from "./reports-filter-bar";
import { useBudgets, useSetBudget, type ReportSettings } from "./reports-queries";

const USD = /^\d{1,12}(\.\d{1,8})?$/;
const NONE = "__none__";

/** Sets one project's all-time budget and the rate card that prices its unfinished work. */
export function SetBudgetDialog({
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
  const setBudget = useSetBudget(organizationSlug);
  // Every project's budget, whatever the page is filtered to, so choosing a project here shows
  // what it has and saving never clears its rate card by mistake.
  const budgets = useBudgets(organizationSlug, null);
  const existing = (id: string) => budgets.data?.find((row) => row.projectId === id);
  const [projectId, setProjectId] = useState(chosenProjectId ?? "");
  const [amount, setAmount] = useState("");
  const [rateCard, setRateCard] = useState(NONE);
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();

  function chooseProject(id: string) {
    setProjectId(id);
    const current = existing(id);
    setAmount(current ? String(Number(current.budgetUsd)) : "");
    setRateCard(current?.rateCardName ?? NONE);
  }

  // Fill in the chosen project's budget once the budgets have loaded.
  const loaded = budgets.isSuccess;
  useEffect(() => {
    if (loaded && chosenProjectId) chooseProject(chosenProjectId);
    // Only when the budgets first arrive; later choices are the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  async function save() {
    setError(null);
    if (!projectId) return setError(intl.formatMessage(messages.projectRequired));
    if (!USD.test(amount.trim())) return setError(intl.formatMessage(messages.amountInvalid));
    try {
      await setBudget.mutateAsync({
        projectId,
        budget: amount.trim(),
        rateCardName: rateCard === NONE ? null : rateCard,
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
          <DialogTitle>{intl.formatMessage(messages.dialogTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.dialogDescription)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <ReportSelect
            className="w-full"
            label={intl.formatMessage(messages.project)}
            placeholder={intl.formatMessage(messages.chooseProject)}
            value={projectId}
            options={settings.projects.map((project) => ({
              value: project.id,
              label: project.name,
            }))}
            onChange={chooseProject}
            disabled={!budgets.isSuccess}
          />
          <Field>
            <FieldLabel htmlFor={amountId}>{intl.formatMessage(messages.amount)}</FieldLabel>
            <Input
              id={amountId}
              inputMode="decimal"
              disabled={!budgets.isSuccess}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <ReportSelect
            className="w-full"
            label={intl.formatMessage(messages.rateCard)}
            value={rateCard}
            options={[
              { value: NONE, label: intl.formatMessage(messages.noRateCard) },
              ...settings.rateCardNames.map((name) => ({ value: name, label: name })),
            ]}
            onChange={setRateCard}
            disabled={!budgets.isSuccess}
          />
          {budgets.isError ? (
            <FieldError data-slot="field-error">
              {intl.formatMessage(messages.loadFailed)}
            </FieldError>
          ) : null}
          {error ? <FieldError data-slot="field-error">{error}</FieldError> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button disabled={setBudget.isPending || !budgets.isSuccess} onClick={() => void save()}>
            {intl.formatMessage(setBudget.isPending ? messages.saving : messages.save)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
