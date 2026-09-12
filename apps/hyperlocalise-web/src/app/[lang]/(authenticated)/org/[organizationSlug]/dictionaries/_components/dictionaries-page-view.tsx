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
import { Add01Icon, TextFontIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import {
  PageHeader,
  WorkspaceFilterField,
  WorkspacePageShell,
} from "../../_components/workspace-resource-shared";
import type { DictionaryListRow } from "./dictionary-list";
import { DictionariesTable } from "./dictionaries-table";
import { dictionariesPageViewMessages } from "./dictionaries-page-view.messages";

export type DictionaryCreateForm = {
  name: string;
  description: string;
};

export function DictionariesPageView({
  organizationSlug,
  dictionaries,
  isLoading,
  isError,
  isSuccess,
  error,
  canWriteDictionaries,
  searchQuery,
  onSearchQueryChange,
  createDialogOpen,
  onCreateDialogOpenChange,
  createForm,
  onCreateFormChange,
  createErrors,
  isCreating,
  onSubmitCreateDictionary,
}: {
  organizationSlug: string;
  dictionaries: DictionaryListRow[];
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  canWriteDictionaries: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  createDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  createForm: DictionaryCreateForm;
  onCreateFormChange: (form: DictionaryCreateForm) => void;
  createErrors: { name?: string };
  isCreating: boolean;
  onSubmitCreateDictionary: () => void;
}) {
  const intl = useIntl();

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={TextFontIcon}
        label={intl.formatMessage(dictionariesPageViewMessages.pageLabel)}
        title={intl.formatMessage(dictionariesPageViewMessages.pageTitle)}
        description={intl.formatMessage(dictionariesPageViewMessages.pageDescription)}
        statusLabel={intl.formatMessage(dictionariesPageViewMessages.dictionaryCount, {
          count: dictionaries.length,
        })}
        actions={
          canWriteDictionaries ? (
            <Button size="sm" onClick={() => onCreateDialogOpenChange(true)}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
              <FormattedMessage {...dictionariesPageViewMessages.createDictionary} />
            </Button>
          ) : null
        }
      />

      <WorkspaceFilterField
        label={intl.formatMessage(dictionariesPageViewMessages.searchLabel)}
        className="w-full sm:max-w-xs"
      >
        <Input
          placeholder={intl.formatMessage(dictionariesPageViewMessages.searchPlaceholder)}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="w-full"
        />
      </WorkspaceFilterField>

      <DictionariesTable
        organizationSlug={organizationSlug}
        dictionaries={dictionaries}
        isLoading={isLoading}
        isError={isError}
        isSuccess={isSuccess}
        error={error}
        emptyTitle={intl.formatMessage(
          searchQuery.trim()
            ? dictionariesPageViewMessages.noFilterMatches
            : dictionariesPageViewMessages.emptyTitle,
        )}
        emptyDescription={
          searchQuery.trim()
            ? ""
            : intl.formatMessage(dictionariesPageViewMessages.emptyDescription)
        }
      />

      <Dialog open={createDialogOpen} onOpenChange={onCreateDialogOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...dictionariesPageViewMessages.createDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...dictionariesPageViewMessages.createDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...dictionariesPageViewMessages.nameLabel} />
              </FieldLabel>
              <Input
                value={createForm.name}
                onChange={(event) =>
                  onCreateFormChange({ ...createForm, name: event.target.value })
                }
                placeholder={intl.formatMessage(dictionariesPageViewMessages.namePlaceholder)}
              />
              {createErrors.name ? <FieldError>{createErrors.name}</FieldError> : null}
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>
                <FormattedMessage {...dictionariesPageViewMessages.descriptionLabel} />
              </FieldLabel>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  onCreateFormChange({ ...createForm, description: event.target.value })
                }
                placeholder={intl.formatMessage(
                  dictionariesPageViewMessages.descriptionPlaceholder,
                )}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreateDialogOpenChange(false)}>
              <FormattedMessage {...dictionariesPageViewMessages.cancel} />
            </Button>
            <Button onClick={onSubmitCreateDictionary} disabled={isCreating}>
              <FormattedMessage {...dictionariesPageViewMessages.createDictionary} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspacePageShell>
  );
}
