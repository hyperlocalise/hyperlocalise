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
import Link from "next/link";
import { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { GithubLogoIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";

import type { GithubAutoReviewSettingsDto, GithubAutoReviewSettingsWrite } from "./automations-api";
import { AutomationIconTile } from "./automation-icon-tile";
import { githubAutoReviewCardMessages as messages } from "./github-auto-review-card.messages";

const ADDITIONAL_PROMPT_MAX_LENGTH = 8_000;

function GithubAutoReviewSettingsForm({
  organizationSlug,
  settings,
  isLoading,
  error,
  isSaving = false,
  onSave,
}: {
  organizationSlug: string;
  settings?: GithubAutoReviewSettingsDto | null;
  isLoading: boolean;
  error?: unknown;
  isSaving?: boolean;
  onSave?: (input: GithubAutoReviewSettingsWrite) => Promise<void>;
}) {
  const intl = useIntl();
  const [enabled, setEnabled] = useState(false);
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    setEnabled(settings.enabled);
    setAdditionalPrompt(settings.additionalPrompt);
    setSelectedIds(settings.githubInstallationRepositoryIds);
  }, [settings]);

  const selectableRepositories =
    settings?.repositories.filter((repository) => repository.enabled && !repository.archived) ?? [];
  const hasAnyRepositories = (settings?.repositories.length ?? 0) > 0;
  const hasChanges =
    settings != null &&
    (enabled !== settings.enabled ||
      additionalPrompt !== settings.additionalPrompt ||
      selectedIds.length !== settings.githubInstallationRepositoryIds.length ||
      selectedIds.some((id) => !settings.githubInstallationRepositoryIds.includes(id)));

  function toggleRepository(repositoryId: string, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? current.includes(repositoryId)
          ? current
          : [...current, repositoryId]
        : current.filter((id) => id !== repositoryId),
    );
  }

  async function handleSave() {
    if (!onSave) {
      return;
    }
    await onSave({
      enabled,
      additionalPrompt,
      githubInstallationRepositoryIds: selectedIds,
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-2/5 rounded-full bg-muted" />
        <Skeleton className="h-16 w-full rounded-xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <TypographyP className="text-flame-100" size="small" weight="medium">
        <FormattedMessage {...messages.loadError} />
      </TypographyP>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="github-auto-review-enabled" className="text-sm font-medium">
          <FormattedMessage {...messages.enabledLabel} />
        </Label>
        <Switch
          id="github-auto-review-enabled"
          checked={enabled}
          disabled={isSaving || !settings}
          onCheckedChange={setEnabled}
          aria-label={intl.formatMessage(messages.enabledLabel)}
        />
      </div>

      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.mentionNote} />
      </TypographyP>

      <div className="space-y-2">
        <Label className="text-sm font-medium">
          <FormattedMessage {...messages.repositoriesLabel} />
        </Label>
        {!hasAnyRepositories ? (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.noGithub} />{" "}
            <Link
              href={`/org/${organizationSlug}/integrations`}
              className="text-foreground underline underline-offset-4"
            >
              <FormattedMessage {...messages.integrationsLink} />
            </Link>
          </TypographyP>
        ) : selectableRepositories.length === 0 ? (
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...messages.noEnabledRepos} />{" "}
            <Link
              href={`/org/${organizationSlug}/integrations`}
              className="text-foreground underline underline-offset-4"
            >
              <FormattedMessage {...messages.integrationsLink} />
            </Link>
          </TypographyP>
        ) : (
          <ul className="space-y-2">
            {selectableRepositories.map((repository) => {
              const checkboxId = `github-auto-review-repo-${repository.id}`;
              return (
                <li key={repository.id} className="flex items-center gap-2">
                  <Checkbox
                    id={checkboxId}
                    checked={selectedIds.includes(repository.id)}
                    disabled={isSaving}
                    onCheckedChange={(checked) => toggleRepository(repository.id, checked === true)}
                  />
                  <Label htmlFor={checkboxId} className="text-sm font-normal">
                    {repository.fullName}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="github-auto-review-prompt" className="text-sm font-medium">
          <FormattedMessage {...messages.additionalPromptLabel} />
        </Label>
        <Textarea
          id="github-auto-review-prompt"
          value={additionalPrompt}
          maxLength={ADDITIONAL_PROMPT_MAX_LENGTH}
          disabled={isSaving}
          placeholder={intl.formatMessage(messages.additionalPromptPlaceholder)}
          onChange={(event) => setAdditionalPrompt(event.target.value)}
        />
      </div>

      {onSave ? (
        <Button
          type="button"
          disabled={isSaving || !hasChanges}
          onClick={() => {
            void handleSave();
          }}
        >
          <FormattedMessage {...messages.save} />
        </Button>
      ) : null}
    </div>
  );
}

function GithubAutoReviewState({
  settings,
  isLoading,
}: {
  settings?: GithubAutoReviewSettingsDto | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return <Skeleton className="h-4 w-24 rounded-full bg-muted" />;
  }
  if (!settings) {
    return null;
  }

  return (
    <span className="text-sm text-muted-foreground">
      {settings.enabled ? (
        <FormattedMessage
          {...messages.stateOn}
          values={{ count: settings.githubInstallationRepositoryIds.length }}
        />
      ) : (
        <FormattedMessage {...messages.stateOff} />
      )}
    </span>
  );
}

/**
 * GitHub Auto-review, built into every workspace: one row above the automations list, with its
 * settings in a side panel.
 */
export function GithubAutoReviewRow({
  organizationSlug,
  settings,
  isLoading,
  error,
  isSaving = false,
  onSave,
}: {
  organizationSlug: string;
  settings?: GithubAutoReviewSettingsDto | null;
  isLoading: boolean;
  error?: unknown;
  isSaving?: boolean;
  onSave?: (input: GithubAutoReviewSettingsWrite) => Promise<void>;
}) {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <section
      aria-labelledby="github-auto-review-title"
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <AutomationIconTile tone="builtIn">
          <GithubLogoIcon className="size-4" />
        </AutomationIconTile>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="github-auto-review-title" className="font-sans text-sm font-medium">
              <FormattedMessage {...messages.rowTitle} />
            </h2>
            <Badge variant="secondary">
              <FormattedMessage {...messages.builtIn} />
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <FormattedMessage {...messages.rowDescription} />
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <GithubAutoReviewState settings={settings} isLoading={isLoading} />
        <Button type="button" variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <FormattedMessage {...messages.configure} />
        </Button>
      </div>
      <Sheet open={configOpen} onOpenChange={setConfigOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl md:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              <FormattedMessage {...messages.title} />
            </SheetTitle>
            <SheetDescription>
              <FormattedMessage {...messages.description} />
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <GithubAutoReviewSettingsForm
              key={configOpen ? "open" : "closed"}
              organizationSlug={organizationSlug}
              settings={settings}
              isLoading={isLoading}
              error={error}
              isSaving={isSaving}
              onSave={onSave}
            />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
