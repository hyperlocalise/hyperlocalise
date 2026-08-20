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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { ArrowDown01Icon, ArrowUp01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import { readApiResponseError } from "@/lib/api-error";

import { IssueAssigneePicker } from "../../../../_components/issue-detail/issue-assignee-picker";
import {
  issuePriorityLabel,
  issuePriorityValues,
  issueSheetApiPath,
  issueTypeLabel,
} from "../../../../_components/issue-detail/issue-detail-utils";
import { useAssignableIssueMembersQuery } from "../../../../_components/issue-detail/use-assignable-issue-members";
import { issueTypeValues } from "../../issue-sheet/_components/issue-sheet-constants";
import { ProjectSectionTitle, useProjectPageQuery } from "../../_components/project-page-shell";
import { RoutingRecipeConditionChipField } from "./routing-recipe-condition-chip-field";
import { projectIssueRoutingRecipesPanelMessages as messages } from "./project-issue-routing-recipes-panel.messages";

type RoutingRecipe = {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  conditions: {
    issueTypes?: string[];
    targetLocales?: string[];
    priorities?: string[];
  };
  actions: {
    assigneeUserId?: string;
    priority?: string;
  };
  assigneeAssignable: boolean | null;
};

type DraftRecipe = {
  name: string;
  enabled: boolean;
  issueTypes: string[];
  targetLocales: string[];
  priorities: string[];
  assigneeUserId: string | null;
  actionPriority: string | null;
};

type RoutingPreview = {
  matchedRecipe: { id: string; name: string } | null;
  wouldAssignUserId: string | null;
  wouldAssignDisplayName: string | null;
  wouldSetPriority: string | null;
  skippedAssignBecauseSet: boolean;
  skippedPriorityBecauseSet: boolean;
  assigneeNotAssignable: boolean;
};

type RoutingFailure = {
  id: string;
  issueId: string;
  recipeId: string | null;
  errorCode: string;
  message: string | null;
  createdAt: string;
};

const routingRecipesQueryKey = (organizationSlug: string, projectId: string) => [
  "issue-sheet-routing-recipes",
  organizationSlug,
  projectId,
];

const routingFailuresQueryKey = (organizationSlug: string, projectId: string) => [
  "issue-sheet-routing-failures",
  organizationSlug,
  projectId,
];

function mapRecipeToDraft(recipe: RoutingRecipe): DraftRecipe {
  return {
    name: recipe.name,
    enabled: recipe.enabled,
    issueTypes: recipe.conditions.issueTypes ?? [],
    targetLocales: recipe.conditions.targetLocales ?? [],
    priorities: recipe.conditions.priorities ?? [],
    assigneeUserId: recipe.actions.assigneeUserId ?? null,
    actionPriority: recipe.actions.priority ?? null,
  };
}

function createEmptyDraft(): DraftRecipe {
  return {
    name: "New recipe",
    enabled: true,
    issueTypes: [],
    targetLocales: [],
    priorities: [],
    assigneeUserId: null,
    actionPriority: null,
  };
}

export function ProjectIssueRoutingRecipesPanel({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const projectQuery = useProjectPageQuery(organizationSlug, projectId);
  const membersQuery = useAssignableIssueMembersQuery({ organizationSlug, projectId });

  const recipesQuery = useQuery({
    queryKey: routingRecipesQueryKey(organizationSlug, projectId),
    queryFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/routing-recipes`,
      );
      if (!response.ok) {
        throw new Error("Unable to load routing recipes");
      }
      const body = (await response.json()) as { recipes: RoutingRecipe[] };
      return body.recipes;
    },
  });

  const failuresQuery = useQuery({
    queryKey: routingFailuresQueryKey(organizationSlug, projectId),
    queryFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/routing-recipes/failures`,
      );
      if (!response.ok) {
        throw new Error("Unable to load routing failures");
      }
      const body = (await response.json()) as { failures: RoutingFailure[] };
      return body.failures;
    },
  });

  const [draftRecipes, setDraftRecipes] = useState<DraftRecipe[]>([]);
  const [previewIssueType, setPreviewIssueType] = useState<string>("qa_failure");
  const [previewLocale, setPreviewLocale] = useState<string>("");
  const [previewPriority, setPreviewPriority] = useState<string>("");
  const [previewAssigneeUserId, setPreviewAssigneeUserId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<RoutingPreview | null>(null);

  useEffect(() => {
    if (!recipesQuery.data) {
      return;
    }
    setDraftRecipes(recipesQuery.data.map(mapRecipeToDraft));
  }, [recipesQuery.data]);

  const targetLocales = projectQuery.data?.targetLocales ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/routing-recipes`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipes: draftRecipes.map((recipe, index) => ({
              name: recipe.name,
              enabled: recipe.enabled,
              sortOrder: index,
              conditions: {
                issueTypes: recipe.issueTypes.length > 0 ? recipe.issueTypes : undefined,
                targetLocales: recipe.targetLocales.length > 0 ? recipe.targetLocales : undefined,
                priorities: recipe.priorities.length > 0 ? recipe.priorities : undefined,
              },
              actions: {
                ...(recipe.assigneeUserId ? { assigneeUserId: recipe.assigneeUserId } : {}),
                ...(recipe.actionPriority ? { priority: recipe.actionPriority } : {}),
              },
            })),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          (await readApiResponseError(response, intl.formatMessage(messages.saveError))).message,
        );
      }
      const body = (await response.json()) as { recipes: RoutingRecipe[] };
      return body.recipes;
    },
    onSuccess: (recipes) => {
      queryClient.setQueryData(routingRecipesQueryKey(organizationSlug, projectId), recipes);
      setDraftRecipes(recipes.map(mapRecipeToDraft));
      toast.success(intl.formatMessage(messages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveError));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${issueSheetApiPath(organizationSlug, projectId)}/routing-recipes/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issueType: previewIssueType,
            targetLocale: previewLocale.trim() ? previewLocale.trim() : null,
            priority: previewPriority || null,
            assigneeUserId: previewAssigneeUserId ?? undefined,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("Unable to preview routing recipe");
      }
      const body = (await response.json()) as { preview: RoutingPreview };
      return body.preview;
    },
    onSuccess: (preview) => {
      setPreviewResult(preview);
    },
    onError: () => {
      toast.error("Unable to preview routing recipe");
    },
  });

  const localeOptions = useMemo(
    () => targetLocales.map((locale) => ({ value: locale, label: locale })),
    [targetLocales],
  );

  const issueTypeOptions = useMemo(
    () =>
      issueTypeValues.map((issueType) => ({
        value: issueType,
        label: issueTypeLabel(intl, issueType),
      })),
    [intl],
  );

  const priorityOptions = useMemo(
    () =>
      issuePriorityValues.map((priority) => ({
        value: priority,
        label: issuePriorityLabel(intl, priority),
      })),
    [intl],
  );

  const addConditionLabel = intl.formatMessage(messages.addConditionButton);
  const anyConditionLabel = intl.formatMessage(messages.anyCondition);
  const allConditionsSelectedLabel = intl.formatMessage(messages.allConditionsSelected);
  const removeConditionChipAriaLabel = (label: string) =>
    intl.formatMessage(messages.removeConditionChipAriaLabel, { label });

  if (recipesQuery.isError) {
    return null;
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-muted p-4">
      <div>
        <ProjectSectionTitle>
          <FormattedMessage {...messages.title} />
        </ProjectSectionTitle>
        <TypographyP className="mt-1 text-sm text-muted-foreground">
          <FormattedMessage {...messages.description} />
        </TypographyP>
      </div>

      <div className="grid gap-3">
        {draftRecipes.map((recipe, index) => (
          <div
            key={`recipe-${index}`}
            className="grid gap-4 rounded-md border border-border bg-background p-3"
          >
            <div className="flex flex-wrap items-start gap-3">
              <Field className="min-w-[12rem] flex-1 gap-1.5">
                <FieldLabel>
                  <FormattedMessage {...messages.recipeNameLabel} />
                </FieldLabel>
                <Input
                  value={recipe.name}
                  disabled={saveMutation.isPending}
                  onChange={(event) =>
                    setDraftRecipes((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, name: event.target.value } : entry,
                      ),
                    )
                  }
                />
              </Field>
              <div className="flex items-center gap-1 self-end">
                <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <Switch
                    checked={recipe.enabled}
                    disabled={saveMutation.isPending}
                    onCheckedChange={(checked) =>
                      setDraftRecipes((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, enabled: checked } : entry,
                        ),
                      )
                    }
                  />
                  <span className="text-sm text-muted-foreground">
                    <FormattedMessage {...messages.enabledLabel} />
                  </span>
                </div>
                {draftRecipes.length > 1 ? (
                  <>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === 0 || saveMutation.isPending}
                      aria-label={intl.formatMessage(messages.moveUp)}
                      onClick={() =>
                        setDraftRecipes((current) => {
                          if (index === 0) return current;
                          const next = [...current];
                          const [item] = next.splice(index, 1);
                          next.splice(index - 1, 0, item);
                          return next;
                        })
                      }
                    >
                      <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.8} />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={index === draftRecipes.length - 1 || saveMutation.isPending}
                      aria-label={intl.formatMessage(messages.moveDown)}
                      onClick={() =>
                        setDraftRecipes((current) => {
                          if (index >= current.length - 1) return current;
                          const next = [...current];
                          const [item] = next.splice(index, 1);
                          next.splice(index + 1, 0, item);
                          return next;
                        })
                      }
                    >
                      <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} />
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={saveMutation.isPending}
                  aria-label={intl.formatMessage(messages.removeRecipe)}
                  onClick={() =>
                    setDraftRecipes((current) =>
                      current.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <TypographyP className="text-sm font-medium">
                  <FormattedMessage {...messages.conditionsLabel} />
                </TypographyP>
                <TypographyP className="mt-0.5 text-xs text-muted-foreground">
                  <FormattedMessage {...messages.conditionsHelper} />
                </TypographyP>
              </div>
              <Field className="gap-1.5">
                <FieldLabel>
                  <FormattedMessage {...messages.issueTypesLabel} />
                </FieldLabel>
                <RoutingRecipeConditionChipField
                  selectedValues={recipe.issueTypes}
                  options={issueTypeOptions}
                  disabled={saveMutation.isPending}
                  placeholder={anyConditionLabel}
                  addButtonLabel={addConditionLabel}
                  removeChipAriaLabel={removeConditionChipAriaLabel}
                  emptyOptionsLabel={allConditionsSelectedLabel}
                  onChange={(issueTypes) =>
                    setDraftRecipes((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, issueTypes } : entry,
                      ),
                    )
                  }
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel>
                  <FormattedMessage {...messages.localesLabel} />
                </FieldLabel>
                <RoutingRecipeConditionChipField
                  selectedValues={recipe.targetLocales}
                  options={localeOptions}
                  disabled={saveMutation.isPending || localeOptions.length === 0}
                  placeholder={anyConditionLabel}
                  addButtonLabel={addConditionLabel}
                  removeChipAriaLabel={removeConditionChipAriaLabel}
                  emptyOptionsLabel={
                    localeOptions.length === 0 ? anyConditionLabel : allConditionsSelectedLabel
                  }
                  onChange={(targetLocales) =>
                    setDraftRecipes((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, targetLocales } : entry,
                      ),
                    )
                  }
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel>
                  <FormattedMessage {...messages.prioritiesLabel} />
                </FieldLabel>
                <RoutingRecipeConditionChipField
                  selectedValues={recipe.priorities}
                  options={priorityOptions}
                  disabled={saveMutation.isPending}
                  placeholder={anyConditionLabel}
                  addButtonLabel={addConditionLabel}
                  removeChipAriaLabel={removeConditionChipAriaLabel}
                  emptyOptionsLabel={allConditionsSelectedLabel}
                  onChange={(priorities) =>
                    setDraftRecipes((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, priorities } : entry,
                      ),
                    )
                  }
                />
              </Field>
            </div>

            <div className="grid gap-3">
              <TypographyP className="text-sm font-medium">
                <FormattedMessage {...messages.actionsLabel} />
              </TypographyP>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <span className="text-sm">
                    <FormattedMessage {...messages.assigneeLabel} />
                  </span>
                  <IssueAssigneePicker
                    value={recipe.assigneeUserId}
                    members={membersQuery.data?.members ?? []}
                    isLoading={membersQuery.isLoading}
                    disabled={saveMutation.isPending}
                    size="sm"
                    onChange={(userId) =>
                      setDraftRecipes((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, assigneeUserId: userId } : entry,
                        ),
                      )
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <span className="text-sm">
                    <FormattedMessage {...messages.priorityActionLabel} />
                  </span>
                  <Select
                    value={recipe.actionPriority ?? "__none__"}
                    items={[
                      { value: "__none__", label: intl.formatMessage(messages.nonePriority) },
                      ...issuePriorityValues.map((priority) => ({
                        value: priority,
                        label: issuePriorityLabel(intl, priority),
                      })),
                    ]}
                    disabled={saveMutation.isPending}
                    onValueChange={(value) =>
                      setDraftRecipes((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                actionPriority: value === "__none__" ? null : value,
                              }
                            : entry,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-[10rem]">
                      {recipe.actionPriority
                        ? issuePriorityLabel(intl, recipe.actionPriority)
                        : intl.formatMessage(messages.nonePriority)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        value="__none__"
                        label={intl.formatMessage(messages.nonePriority)}
                      >
                        <FormattedMessage {...messages.nonePriority} />
                      </SelectItem>
                      {issuePriorityValues.map((priority) => (
                        <SelectItem
                          key={priority}
                          value={priority}
                          label={issuePriorityLabel(intl, priority)}
                        >
                          {issuePriorityLabel(intl, priority)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saveMutation.isPending}
          onClick={() => setDraftRecipes((current) => [...current, createEmptyDraft()])}
        >
          <FormattedMessage {...messages.addRecipe} />
        </Button>
        <Button
          type="button"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? <Spinner className="size-4" /> : null}
          {saveMutation.isPending ? (
            <FormattedMessage {...messages.saving} />
          ) : (
            <FormattedMessage {...messages.saveButton} />
          )}
        </Button>
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <div>
          <TypographyP className="text-sm font-medium">
            <FormattedMessage {...messages.previewTitle} />
          </TypographyP>
          <TypographyP className="mt-0.5 text-xs text-muted-foreground">
            <FormattedMessage {...messages.previewHelper} />
          </TypographyP>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.previewIssueType} />
            </FieldLabel>
            <Select
              value={previewIssueType}
              items={issueTypeValues.map((issueType) => ({
                value: issueType,
                label: issueTypeLabel(intl, issueType),
              }))}
              onValueChange={(value) => value && setPreviewIssueType(value)}
            >
              <SelectTrigger>{issueTypeLabel(intl, previewIssueType)}</SelectTrigger>
              <SelectContent>
                {issueTypeValues.map((issueType) => (
                  <SelectItem
                    key={issueType}
                    value={issueType}
                    label={issueTypeLabel(intl, issueType)}
                  >
                    {issueTypeLabel(intl, issueType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.previewLocale} />
            </FieldLabel>
            <Input
              value={previewLocale}
              placeholder={intl.formatMessage(messages.anyCondition)}
              onChange={(event) => setPreviewLocale(event.target.value)}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.previewPriority} />
            </FieldLabel>
            <Select
              value={previewPriority || "__none__"}
              items={[
                { value: "__none__", label: intl.formatMessage(messages.anyCondition) },
                ...issuePriorityValues.map((priority) => ({
                  value: priority,
                  label: issuePriorityLabel(intl, priority),
                })),
              ]}
              onValueChange={(value) =>
                setPreviewPriority(!value || value === "__none__" ? "" : value)
              }
            >
              <SelectTrigger>
                {previewPriority
                  ? issuePriorityLabel(intl, previewPriority)
                  : intl.formatMessage(messages.anyCondition)}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label={intl.formatMessage(messages.anyCondition)}>
                  <FormattedMessage {...messages.anyCondition} />
                </SelectItem>
                {issuePriorityValues.map((priority) => (
                  <SelectItem
                    key={priority}
                    value={priority}
                    label={issuePriorityLabel(intl, priority)}
                  >
                    {issuePriorityLabel(intl, priority)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-1.5">
            <FieldLabel>
              <FormattedMessage {...messages.previewAssigneeLabel} />
            </FieldLabel>
            <IssueAssigneePicker
              value={previewAssigneeUserId}
              members={membersQuery.data?.members ?? []}
              isLoading={membersQuery.isLoading}
              size="sm"
              onChange={setPreviewAssigneeUserId}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? <Spinner className="size-4" /> : null}
            <FormattedMessage {...messages.previewRunButton} />
          </Button>
        </div>
        {previewResult ? (
          <div className="grid gap-1 text-sm text-muted-foreground">
            {!previewResult.matchedRecipe ? (
              <TypographyP>
                <FormattedMessage {...messages.previewNoMatch} />
              </TypographyP>
            ) : null}
            {previewResult.skippedAssignBecauseSet ? (
              <TypographyP>
                <FormattedMessage {...messages.previewAssigneeSet} />
              </TypographyP>
            ) : null}
            {previewResult.skippedPriorityBecauseSet ? (
              <TypographyP>
                <FormattedMessage {...messages.previewPrioritySet} />
              </TypographyP>
            ) : null}
            {previewResult.assigneeNotAssignable ? (
              <TypographyP>
                <FormattedMessage {...messages.previewAssigneeNotAssignable} />
              </TypographyP>
            ) : null}
            {previewResult.wouldAssignDisplayName ? (
              <TypographyP>
                <FormattedMessage
                  {...messages.previewWouldAssign}
                  values={{ assignee: previewResult.wouldAssignDisplayName }}
                />
              </TypographyP>
            ) : null}
            {previewResult.wouldSetPriority ? (
              <TypographyP>
                <FormattedMessage
                  {...messages.previewWouldSetPriority}
                  values={{
                    priority: issuePriorityLabel(intl, previewResult.wouldSetPriority),
                  }}
                />
              </TypographyP>
            ) : null}
          </div>
        ) : null}
      </div>

      {failuresQuery.data && failuresQuery.data.length > 0 ? (
        <div className="grid gap-2">
          <TypographyP className="text-sm font-medium">
            <FormattedMessage {...messages.failuresTitle} />
          </TypographyP>
          <ul className="grid gap-1 text-sm text-muted-foreground">
            {failuresQuery.data.slice(0, 5).map((failure) => (
              <li key={failure.id}>
                {failure.errorCode}
                {failure.message ? ` — ${failure.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
