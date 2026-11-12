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

import { type FormEvent, useEffect, useId, useState } from "react";
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovedTranslationsOnSourceChange } from "@/lib/go-svc/go-svc-client.types";

import {
  ProjectSourceLocalePicker,
  ProjectTargetLocalesPicker,
} from "../../projects/_components/project-locale-picker";
import { projectTemplateDialogMessages as messages } from "./project-template-dialog.messages";
import {
  keepGlossariesForSourceLocale,
  toggleOrderedId,
  validateProjectTemplateForm,
  type ProjectTemplateFormErrors,
  type ProjectTemplateFormValues,
  type ProjectTemplateGlossaryOption,
} from "./project-template-form";

const NO_TEAM_VALUE = "__creator_team__";

export type ProjectTemplateResourceOption = { id: string; name: string };

export function ProjectTemplateDialog({
  open,
  mode,
  initialValues,
  teams,
  memories,
  glossaries,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValues: ProjectTemplateFormValues;
  teams: readonly ProjectTemplateResourceOption[];
  memories: readonly ProjectTemplateResourceOption[];
  glossaries: readonly ProjectTemplateGlossaryOption[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectTemplateFormValues) => void;
}) {
  const intl = useIntl();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<ProjectTemplateFormErrors>({});
  const ids = {
    name: useId(),
    description: useId(),
    projectDescription: useId(),
    translationContext: useId(),
    team: useId(),
    sourceChange: useId(),
    sourceTextEditable: useId(),
    grouping: useId(),
  };

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setErrors({});
    }
  }, [initialValues, open]);

  const matchingGlossaries = glossaries.filter(
    (glossary) => glossary.sourceLocale === values.sourceLocale,
  );
  const update = (patch: Partial<ProjectTemplateFormValues>) =>
    setValues((current) => ({ ...current, ...patch }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProjectTemplateForm(values, intl);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      onSubmit(values);
    }
  }

  const teamItems = [
    { value: NO_TEAM_VALUE, label: intl.formatMessage(messages.creatorTeam) },
    ...teams.map((team) => ({ value: team.id, label: team.name })),
  ];
  const sourceChangeItems: { value: ApprovedTranslationsOnSourceChange; label: string }[] = [
    { value: "stay_approved", label: intl.formatMessage(messages.sourceChangeStayApproved) },
    { value: "needs_review", label: intl.formatMessage(messages.sourceChangeNeedsReview) },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[min(90dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 gap-2 border-b border-border px-6 pt-6 pe-12 pb-4">
            <DialogTitle>
              <FormattedMessage
                {...(mode === "edit" ? messages.editTitle : messages.createTitle)}
              />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.dialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-6 py-4">
            <Field className="gap-1.5">
              <FieldLabel htmlFor={ids.name}>
                <FormattedMessage {...messages.nameLabel} />
              </FieldLabel>
              <Input
                id={ids.name}
                value={values.name}
                disabled={isSaving}
                aria-invalid={Boolean(errors.name)}
                placeholder={intl.formatMessage(messages.namePlaceholder)}
                onChange={(event) => update({ name: event.target.value })}
              />
              <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={ids.description}>
                <FormattedMessage {...messages.descriptionLabel} />
              </FieldLabel>
              <Input
                id={ids.description}
                value={values.description}
                disabled={isSaving}
                aria-invalid={Boolean(errors.description)}
                placeholder={intl.formatMessage(messages.descriptionPlaceholder)}
                onChange={(event) => update({ description: event.target.value })}
              />
              <FieldError
                errors={errors.description ? [{ message: errors.description }] : undefined}
              />
            </Field>

            <ProjectSourceLocalePicker
              value={values.sourceLocale}
              disabled={isSaving}
              error={errors.sourceLocale}
              onChange={(sourceLocale) =>
                update({
                  sourceLocale,
                  glossaryIds: keepGlossariesForSourceLocale(
                    values.glossaryIds,
                    glossaries,
                    sourceLocale,
                  ),
                })
              }
            />
            <ProjectTargetLocalesPicker
              value={values.targetLocales}
              sourceLocale={values.sourceLocale}
              disabled={isSaving}
              error={errors.targetLocales}
              onChange={(targetLocales) => update({ targetLocales })}
            />

            <Field className="gap-1.5">
              <FieldLabel htmlFor={ids.team}>
                <FormattedMessage {...messages.teamLabel} />
              </FieldLabel>
              <Select
                value={values.teamId ?? NO_TEAM_VALUE}
                disabled={isSaving}
                onValueChange={(value) => {
                  if (value) {
                    update({ teamId: value === NO_TEAM_VALUE ? null : value });
                  }
                }}
              >
                <SelectTrigger id={ids.team}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} label={item.label}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <ResourcePicker
              legend={intl.formatMessage(messages.memoriesLabel)}
              hint={intl.formatMessage(messages.memoriesHint)}
              empty={intl.formatMessage(messages.memoriesEmpty)}
              options={memories}
              selected={values.memoryIds}
              disabled={isSaving}
              error={errors.memoryIds}
              onToggle={(id) => update({ memoryIds: toggleOrderedId(values.memoryIds, id) })}
            />
            <ResourcePicker
              legend={intl.formatMessage(messages.glossariesLabel)}
              hint={intl.formatMessage(messages.glossariesHint, { locale: values.sourceLocale })}
              empty={intl.formatMessage(messages.glossariesEmpty, { locale: values.sourceLocale })}
              options={matchingGlossaries}
              selected={values.glossaryIds}
              disabled={isSaving}
              error={errors.glossaryIds}
              onToggle={(id) => update({ glossaryIds: toggleOrderedId(values.glossaryIds, id) })}
            />

            <Field className="gap-1.5">
              <FieldLabel htmlFor={ids.projectDescription}>
                <FormattedMessage {...messages.projectDescriptionLabel} />
              </FieldLabel>
              <Textarea
                id={ids.projectDescription}
                value={values.projectDescription}
                disabled={isSaving}
                className="min-h-16"
                aria-invalid={Boolean(errors.projectDescription)}
                onChange={(event) => update({ projectDescription: event.target.value })}
              />
              <FieldError
                errors={
                  errors.projectDescription ? [{ message: errors.projectDescription }] : undefined
                }
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={ids.translationContext}>
                <FormattedMessage {...messages.translationContextLabel} />
              </FieldLabel>
              <Textarea
                id={ids.translationContext}
                value={values.translationContext}
                disabled={isSaving}
                className="min-h-20"
                aria-invalid={Boolean(errors.translationContext)}
                placeholder={intl.formatMessage(messages.translationContextPlaceholder)}
                onChange={(event) => update({ translationContext: event.target.value })}
              />
              <FieldError
                errors={
                  errors.translationContext ? [{ message: errors.translationContext }] : undefined
                }
              />
            </Field>

            <div className="grid gap-4 rounded-lg border border-border p-4">
              <Field orientation="horizontal" className="items-start justify-between gap-4">
                <div className="grid gap-1">
                  <FieldLabel htmlFor={ids.sourceTextEditable}>
                    <FormattedMessage {...messages.sourceTextEditableLabel} />
                  </FieldLabel>
                  <FieldDescription>
                    <FormattedMessage {...messages.sourceTextEditableHint} />
                  </FieldDescription>
                </div>
                <Switch
                  id={ids.sourceTextEditable}
                  checked={values.sourceTextEditable}
                  disabled={isSaving}
                  onCheckedChange={(checked) => update({ sourceTextEditable: checked })}
                />
              </Field>
              <Field orientation="horizontal" className="items-start justify-between gap-4">
                <div className="grid gap-1">
                  <FieldLabel htmlFor={ids.grouping}>
                    <FormattedMessage {...messages.groupingLabel} />
                  </FieldLabel>
                  <FieldDescription>
                    <FormattedMessage {...messages.groupingHint} />
                  </FieldDescription>
                </div>
                <Switch
                  id={ids.grouping}
                  checked={values.automaticallyGroupIdenticalStrings}
                  disabled={isSaving}
                  onCheckedChange={(checked) =>
                    update({ automaticallyGroupIdenticalStrings: checked })
                  }
                />
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor={ids.sourceChange}>
                  <FormattedMessage {...messages.sourceChangeLabel} />
                </FieldLabel>
                <Select
                  value={values.approvedTranslationsOnSourceChange}
                  disabled={isSaving}
                  onValueChange={(value) => {
                    if (value === "stay_approved" || value === "needs_review") {
                      update({ approvedTranslationsOnSourceChange: value });
                    }
                  }}
                >
                  <SelectTrigger id={ids.sourceChange}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceChangeItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-6 pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner /> : <FloppyDiskIcon />}
              <FormattedMessage {...(isSaving ? messages.saving : messages.save)} />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A checklist whose picks keep the order they were chosen in, shown as priorities. */
function ResourcePicker({
  legend,
  hint,
  empty,
  options,
  selected,
  disabled,
  error,
  onToggle,
}: {
  legend: string;
  hint: string;
  empty: string;
  options: readonly ProjectTemplateResourceOption[];
  selected: readonly string[];
  disabled: boolean;
  error?: string;
  onToggle: (id: string) => void;
}) {
  const baseId = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-border p-2">
          {options.map((option) => {
            const position = selected.indexOf(option.id);
            const checkboxId = `${baseId}-${option.id}`;
            return (
              <div key={option.id} className="flex items-center gap-2 rounded px-1 py-1">
                <Checkbox
                  id={checkboxId}
                  checked={position >= 0}
                  disabled={disabled}
                  onCheckedChange={() => onToggle(option.id)}
                />
                <Label htmlFor={checkboxId} className="min-w-0 flex-1 truncate font-normal">
                  {option.name}
                </Label>
                {position >= 0 ? (
                  <span className="tabular-nums text-xs text-muted-foreground">{position + 1}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </fieldset>
  );
}
