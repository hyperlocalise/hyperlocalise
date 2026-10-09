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
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

import { contentEditorIntercomPushButtonMessages as messages } from "./content-editor-intercom-push-button.messages";
import {
  contentEditorIntercomPushArticlesQueryKey,
  defaultSelectedIntercomPushSourcePaths,
  fetchContentEditorIntercomPushArticles,
  intercomArticleTitleFromSourcePath,
  type ContentEditorIntercomPushArticle,
  type ContentEditorIntercomPushCandidate,
} from "./content-editor-intercom-push-queries";

export function ContentEditorIntercomPushDialog({
  open,
  organizationSlug,
  sourcePath,
  candidates,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  organizationSlug: string;
  sourcePath: string | null;
  candidates: ContentEditorIntercomPushCandidate[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { automationId: string; sourcePaths: string[] }) => void;
}) {
  const intl = useIntl();
  const [selectedAutomationId, setSelectedAutomationId] = useState(
    () => candidates[0]?.automationId ?? "",
  );
  const [selectedSourcePaths, setSelectedSourcePaths] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const selectedAutomation =
    candidates.find((candidate) => candidate.automationId === selectedAutomationId) ??
    candidates[0] ??
    null;
  const automationId = selectedAutomation?.automationId ?? "";

  const articlesQuery = useQuery({
    queryKey: contentEditorIntercomPushArticlesQueryKey(organizationSlug, automationId),
    queryFn: () =>
      fetchContentEditorIntercomPushArticles({
        organizationSlug,
        automationId,
      }),
    enabled: open && automationId.length > 0,
  });

  const articles = articlesQuery.data ?? [];
  const visibleArticles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return articles;
    }
    return articles.filter((article) => {
      const title = intercomArticleTitleFromSourcePath(article.sourcePath).toLowerCase();
      return title.includes(query) || article.sourcePath.toLowerCase().includes(query);
    });
  }, [articles, search]);

  const firstAutomationId = candidates[0]?.automationId ?? "";

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedAutomationId(firstAutomationId);
    setSearch("");
    setSelectedSourcePaths([]);
  }, [open, firstAutomationId]);

  useEffect(() => {
    if (!open || !articlesQuery.data) {
      return;
    }
    setSelectedSourcePaths(defaultSelectedIntercomPushSourcePaths(articlesQuery.data, sourcePath));
  }, [open, articlesQuery.data, sourcePath, automationId]);

  const toggleSourcePath = (nextSourcePath: string, checked: boolean) => {
    setSelectedSourcePaths((current) =>
      checked ? [...current, nextSourcePath] : current.filter((value) => value !== nextSourcePath),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.selectArticlesTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.selectArticlesDescription} />{" "}
            <FormattedMessage
              {...(selectedAutomation?.overwriteIntercomDrafts
                ? messages.pushPolicyOverwrite
                : messages.pushPolicyKeepRemote)}
            />
          </DialogDescription>
        </DialogHeader>
        {candidates.length > 1 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="intercom-push-automation">
              <FormattedMessage {...messages.automationLabel} />
            </Label>
            <Select
              value={automationId}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setSelectedAutomationId(value);
                }
              }}
            >
              <SelectTrigger id="intercom-push-automation" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.automationId} value={candidate.automationId}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={intl.formatMessage(messages.searchArticlesPlaceholder)}
          aria-label={intl.formatMessage(messages.searchArticlesLabel)}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={articles.length === 0 || pending}
            onClick={() => setSelectedSourcePaths(articles.map((article) => article.sourcePath))}
          >
            <FormattedMessage {...messages.selectAllArticles} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={selectedSourcePaths.length === 0 || pending}
            onClick={() => setSelectedSourcePaths([])}
          >
            <FormattedMessage {...messages.clearArticleSelection} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
          {articlesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
              <Spinner />
              <FormattedMessage {...messages.loadingArticles} />
            </div>
          ) : articlesQuery.isError ? (
            <p className="p-6 text-center text-sm text-destructive">
              <FormattedMessage {...messages.loadArticlesError} />
            </p>
          ) : visibleArticles.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              <FormattedMessage
                {...(articles.length === 0 ? messages.noArticles : messages.noMatchingArticles)}
              />
            </p>
          ) : (
            <div className="divide-y divide-border">
              {visibleArticles.map((article) => (
                <IntercomPushArticleRow
                  key={article.articleId}
                  article={article}
                  checked={selectedSourcePaths.includes(article.sourcePath)}
                  disabled={pending}
                  onCheckedChange={(checked) => toggleSourcePath(article.sourcePath, checked)}
                />
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            <FormattedMessage {...messages.cancelArticleSelection} />
          </Button>
          <Button
            onClick={() => {
              if (!automationId || selectedSourcePaths.length === 0) {
                return;
              }
              onConfirm({
                automationId,
                sourcePaths: selectedSourcePaths,
              });
            }}
            disabled={selectedSourcePaths.length === 0 || pending || articlesQuery.isLoading}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            <FormattedMessage
              {...messages.pushSelectedArticles}
              values={{ count: selectedSourcePaths.length }}
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntercomPushArticleRow({
  article,
  checked,
  disabled,
  onCheckedChange,
}: {
  article: ContentEditorIntercomPushArticle;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const title = intercomArticleTitleFromSourcePath(article.sourcePath);
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
          {article.sourcePath}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          <FormattedMessage
            {...messages.readyLocales}
            values={{
              ready: article.eligibleLocaleCount,
              total: article.targetLocaleCount,
            }}
          />
          {article.eligibleLocales.length > 0 ? ` · ${article.eligibleLocales.join(", ")}` : null}
        </span>
        {article.status === "push_failed" ? (
          <span className="mt-1 block text-xs text-destructive">
            <FormattedMessage {...messages.lastPushFailed} />
            {article.lastError ? ` · ${article.lastError}` : null}
          </span>
        ) : null}
      </span>
    </label>
  );
}
