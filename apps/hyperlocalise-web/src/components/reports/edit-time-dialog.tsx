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

import { useDeleteTime, useEditTime, type TaskReport } from "./reports-queries";
import { taskReportMessages as messages } from "./task-report.messages";
import { timeTabMessages as timeMessages } from "./time-tab.messages";

type TimeEntry = TaskReport["time"]["entries"][number];

const MAX_MINUTES = 24 * 60;

/** Changes the day, time or note of a time entry, or deletes it. */
export function EditTimeDialog({
  organizationSlug,
  entry,
  today,
  onClose,
}: {
  organizationSlug: string;
  entry: TimeEntry;
  today: string;
  onClose: () => void;
}) {
  const intl = useIntl();
  const edit = useEditTime(organizationSlug);
  const remove = useDeleteTime(organizationSlug);
  const [workDate, setWorkDate] = useState(entry.workDate.slice(0, 10));
  const [hours, setHours] = useState(String(Math.floor(entry.minutes / 60)));
  const [minutes, setMinutes] = useState(String(entry.minutes % 60));
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const ids = { date: useId(), hours: useId(), minutes: useId(), note: useId() };
  const total = Number(hours || 0) * 60 + Number(minutes || 0);
  const busy = edit.isPending || remove.isPending;

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await action();
      toast.success(done);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  function save() {
    if (!Number.isInteger(total) || total < 1 || total > MAX_MINUTES)
      return setError(intl.formatMessage(timeMessages.durationInvalid));
    void run(
      () =>
        edit.mutateAsync({
          id: entry.id,
          workDate,
          minutes: total,
          // Sent even when empty, so a note can be cleared.
          note: note.trim(),
        }),
      intl.formatMessage(messages.timeSaved),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(messages.editTimeTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(messages.editTimeDescription)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor={ids.date}>{intl.formatMessage(timeMessages.date)}</FieldLabel>
              <Input
                id={ids.date}
                type="date"
                value={workDate}
                max={today}
                onChange={(event) => event.target.value && setWorkDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.hours}>{intl.formatMessage(timeMessages.hours)}</FieldLabel>
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
              <FieldLabel htmlFor={ids.minutes}>
                {intl.formatMessage(timeMessages.minutes)}
              </FieldLabel>
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
            <FieldLabel htmlFor={ids.note}>{intl.formatMessage(timeMessages.note)}</FieldLabel>
            <Textarea
              id={ids.note}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          {error ? <FieldError data-slot="field-error">{error}</FieldError> : null}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void run(() => remove.mutateAsync(entry.id), intl.formatMessage(messages.timeDeleted))
            }
          >
            {intl.formatMessage(remove.isPending ? messages.deleting : messages.deleteTime)}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              {intl.formatMessage(messages.cancel)}
            </Button>
            <Button disabled={busy} onClick={save}>
              {intl.formatMessage(edit.isPending ? messages.saving : messages.saveTime)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
