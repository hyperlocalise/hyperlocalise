"use client";

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
import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { readApiResponseError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import {
  formatLocaleDisplayName,
  formatLocaleOptionLabel,
} from "@/lib/i18n/locale-display-names.messages";
import { getLocaleFlagEmoji } from "@/lib/i18n/locales";
import { inferSupportedTranslationFileFormat } from "@/lib/translation/file-formats";

import { createTranslationJobDialogMessages as messages } from "./create-translation-job-dialog.messages";

type LocaleOption = {
  id: string;
  label: string;
  searchValue: string;
  flag: string | null;
};

function LocaleFlag({ flag }: { flag: string | null }) {
  if (!flag) {
    return null;
  }

  return (
    <span aria-hidden="true" className="text-sm leading-none">
      {flag}
    </span>
  );
}

type CreateTranslationJobDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationSlug: string;
  projectId: string;
  file: ProjectFileRecord | null;
  sourceLocale: string;
  targetLocales: string[];
  onCreated?: (jobId: string) => void;
};

function sortLocaleCodes(locales: string[]) {
  return [...locales].toSorted((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

function TargetLocalesField({
  locales,
  selectedLocales,
  onChange,
  disabled,
}: {
  locales: string[];
  selectedLocales: string[];
  onChange: (locales: string[]) => void;
  disabled?: boolean;
}) {
  const intl = useIntl();
  const fieldId = useId();
  const localeOptions = useMemo<LocaleOption[]>(
    () =>
      locales.map((locale) => ({
        id: locale,
        label: formatLocaleDisplayName(intl, locale),
        searchValue: formatLocaleOptionLabel(intl, locale),
        flag: getLocaleFlagEmoji(locale),
      })),
    [intl, locales],
  );
  const selectedOptions = useMemo(
    () => localeOptions.filter((option) => selectedLocales.includes(option.id)),
    [localeOptions, selectedLocales],
  );
  const allSelected = locales.length > 0 && selectedLocales.length === locales.length;

  return (
    <Field className="gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={fieldId}>
          <FormattedMessage {...messages.targetLocalesLabel} />
        </FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-1.5 py-0.5 text-xs"
          disabled={disabled || locales.length === 0}
          onClick={() => onChange(allSelected ? [] : locales)}
        >
          <FormattedMessage {...(allSelected ? messages.clear : messages.selectAll)} />
        </Button>
      </div>
      <Combobox
        items={localeOptions}
        multiple
        value={selectedOptions}
        onValueChange={(next) => onChange(sortLocaleCodes(next.map((option) => option.id)))}
        itemToStringValue={(option) => option.searchValue}
        disabled={disabled}
      >
        <ComboboxChips className="max-h-28 w-full overflow-y-auto">
          <ComboboxValue>
            {selectedOptions.map((option) => (
              <ComboboxChip
                key={option.id}
                title={option.searchValue}
                removeLabel={intl.formatMessage(messages.removeLocale, { locale: option.id })}
              >
                <span className="inline-flex items-center gap-1">
                  <LocaleFlag flag={option.flag} />
                  {option.id}
                </span>
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            id={fieldId}
            disabled={disabled}
            placeholder={intl.formatMessage(messages.searchLocales)}
          />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>
            <FormattedMessage {...messages.noMatchingLocales} />
          </ComboboxEmpty>
          <ComboboxList>
            {(option: LocaleOption) => (
              <ComboboxItem key={option.id} value={option}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <LocaleFlag flag={option.flag} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block truncate">{option.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.id}
                    </span>
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

export function CreateTranslationJobDialog({
  open,
  onOpenChange,
  organizationSlug,
  projectId,
  file,
  sourceLocale,
  targetLocales,
  onCreated,
}: CreateTranslationJobDialogProps) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const forceId = useId();
  const [selectedLocales, setSelectedLocales] = useState<string[]>(targetLocales);
  const [ignoreTranslationMemory, setIgnoreTranslationMemory] = useState(true);

  useEffect(() => {
    if (open) {
      setSelectedLocales(targetLocales);
      setIgnoreTranslationMemory(true);
    }
  }, [open, targetLocales]);

  const createJob = useMutation({
    mutationFn: async () => {
      if (!file?.storedFileId) {
        throw new Error(intl.formatMessage(messages.uploadSourceRequired));
      }

      const fileFormat = inferSupportedTranslationFileFormat(file.sourcePath);
      if (!fileFormat) {
        throw new Error(intl.formatMessage(messages.unsupportedFormat));
      }

      if (selectedLocales.length === 0) {
        throw new Error(intl.formatMessage(messages.localesRequired));
      }

      const response = await apiClient.api.orgs[":organizationSlug"].projects[
        ":projectId"
      ].jobs.$post({
        param: { organizationSlug, projectId },
        json: {
          type: "file",
          fileInput: {
            sourceFileId: file.storedFileId,
            fileFormat,
            sourceLocale,
            targetLocales: selectedLocales,
            ignoreTranslationMemory,
          },
        },
      });

      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.createFailed));
      }

      const body = (await response.json()) as { job: { id: string } };
      return body.job.id;
    },
    onSuccess: async (jobId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-files", organizationSlug, projectId] }),
        queryClient.invalidateQueries({
          queryKey: ["project-overview-jobs", organizationSlug, projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] }),
      ]);
      toast.success(intl.formatMessage(messages.createSuccess));
      onCreated?.(jobId);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.createFailed),
      );
    },
  });

  const pathLabel = file?.sourcePath ?? intl.formatMessage(messages.thisFile);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...messages.description}
              values={{
                path: <span className="font-mono text-foreground">{pathLabel}</span>,
              }}
            />
          </DialogDescription>
        </DialogHeader>

        {targetLocales.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <FormattedMessage {...messages.noTargetLocales} />
          </p>
        ) : (
          <FieldGroup className="gap-4">
            <Field className="gap-1">
              <FieldLabel>
                <FormattedMessage {...messages.sourceLocaleLabel} />
              </FieldLabel>
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <LocaleFlag flag={getLocaleFlagEmoji(sourceLocale)} />
                {sourceLocale}
              </p>
            </Field>
            <TargetLocalesField
              locales={targetLocales}
              selectedLocales={selectedLocales}
              onChange={setSelectedLocales}
              disabled={createJob.isPending}
            />
            <Field orientation="horizontal">
              <Checkbox
                id={forceId}
                checked={ignoreTranslationMemory}
                onCheckedChange={(checked) => setIgnoreTranslationMemory(checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor={forceId}>
                  <FormattedMessage {...messages.forceUntranslated} />
                </FieldLabel>
                <FieldDescription>
                  <FormattedMessage {...messages.forceUntranslatedDescription} />
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <FormattedMessage {...messages.cancel} />
          </Button>
          <Button
            type="button"
            disabled={
              createJob.isPending ||
              targetLocales.length === 0 ||
              selectedLocales.length === 0 ||
              !file?.storedFileId
            }
            onClick={() => createJob.mutate()}
          >
            {createJob.isPending ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...messages.submit} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
