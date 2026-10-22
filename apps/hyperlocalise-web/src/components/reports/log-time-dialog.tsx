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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiResponseErrorCode } from "@/lib/api-error";
import { REPORT_STEPS, type ReportStep } from "@/lib/reporting/report-units";

import { stepLabel } from "./report-format";
import { ReportSelect, TaskPicker } from "./reports-filter-bar";
import { useLogTime, useReportTasks, type ReportSettings } from "./reports-queries";
import { timeTabMessages as messages } from "./time-tab.messages";

const MAX_MINUTES = 24 * 60;

/** Logs time spent on a task, for the person signed in. */
export function LogTimeDialog({
  organizationSlug,
  settings,
  projectId,
  jobId: fixedJobId,
  languages: fixedLanguages,
  onClose,
}: {
  organizationSlug: string;
  settings: ReportSettings;
  projectId: string | null;
  /** On a task's own report the task is fixed. */
  jobId?: string;
  /** The fixed task's languages, which its project's may not all be; its project's when none. */
  languages?: string[];
  onClose: () => void;
}) {
  const intl = useIntl();
  const logTime = useLogTime(organizationSlug);
  const [jobId, setJobId] = useState<string | null>(fixedJobId ?? null);
  const [step, setStep] = useState<ReportStep>("translation");
  const [targetLocale, setTargetLocale] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState(settings.today);
  const [hours, setHours] = useState("1");
  const [minutes, setMinutes] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ids = { date: useId(), hours: useId(), minutes: useId(), note: useId() };
  const task = useReportTasks({
    organizationSlug,
    projectId: null,
    ids: jobId ? [jobId] : [],
    enabled: Boolean(jobId),
  }).data?.[0];
  const taskProject = settings.projects.find((project) => project.id === task?.projectId);
  const languages = fixedLanguages?.length ? fixedLanguages : (taskProject?.targetLocales ?? []);
  const total = Number(hours || 0) * 60 + Number(minutes || 0);

  async function save() {
    setError(null);
    if (!jobId) return setError(intl.formatMessage(messages.taskRequired));
    if (!targetLocale) return setError(intl.formatMessage(messages.languageRequired));
    if (!Number.isInteger(total) || total < 1 || total > MAX_MINUTES)
      return setError(intl.formatMessage(messages.durationInvalid));
    try {
      await logTime.mutateAsync({
        jobId,
        step,
        targetLocale,
        workDate,
        minutes: total,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(intl.formatMessage(messages.saved));
      onClose();
    } catch (failure) {
      setError(
        isApiResponseErrorCode(failure, "native_job_required")
          ? intl.formatMessage(messages.nativeTaskRequired)
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
          <DialogTitle>{intl.formatMessage(messages.dialogTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.dialogDescription)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {fixedJobId ? null : (
            <TaskPicker
              className="w-full"
              placeholder={intl.formatMessage(messages.chooseTask)}
              organizationSlug={organizationSlug}
              projectId={projectId}
              value={jobId}
              onChange={(next) => {
                setJobId(next);
                setTargetLocale(null);
              }}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <ReportSelect
              className="w-full"
              label={intl.formatMessage(messages.stepColumn)}
              value={step}
              options={REPORT_STEPS.map((value) => ({ value, label: stepLabel(intl, value) }))}
              onChange={(value) => setStep(value as ReportStep)}
            />
            <ReportSelect
              className="w-full"
              label={intl.formatMessage(messages.languageColumn)}
              placeholder={intl.formatMessage(messages.chooseLanguage)}
              value={targetLocale ?? ""}
              disabled={languages.length === 0}
              options={languages.map((locale) => ({ value: locale, label: locale }))}
              onChange={setTargetLocale}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={ids.date}>{intl.formatMessage(messages.date)}</FieldLabel>
              <Input
                id={ids.date}
                type="date"
                value={workDate}
                max={settings.today}
                onChange={(event) => event.target.value && setWorkDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.hours}>{intl.formatMessage(messages.hours)}</FieldLabel>
              <Input
                id={ids.hours}
                type="number"
                min={0}
                max={24}
                inputMode="numeric"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.minutes}>{intl.formatMessage(messages.minutes)}</FieldLabel>
              <Input
                id={ids.minutes}
                type="number"
                min={0}
                max={59}
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </Field>
          </div>
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
          <Button disabled={logTime.isPending} onClick={() => void save()}>
            {intl.formatMessage(logTime.isPending ? messages.saving : messages.save)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
