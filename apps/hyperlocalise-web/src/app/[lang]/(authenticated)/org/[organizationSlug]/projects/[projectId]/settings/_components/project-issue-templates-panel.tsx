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
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import {
  issueSheetTemplateLabel,
  issueSheetTemplates,
} from "@/lib/projects/issue-sheet/issue-sheet-templates";
import { issueSheetTemplateMessages } from "@/lib/projects/issue-sheet/issue-sheet-templates.messages";

import { IssueAssigneePicker } from "../../../../_components/issue-detail/issue-assignee-picker";
import { useAssignableIssueMembersQuery } from "../../../../_components/issue-detail/use-assignable-issue-members";
import {
  issueSheetTemplateConfigQueryKey,
  useIssueSheetTemplateConfigQuery,
  type IssueSheetTemplateConfig,
} from "../../../../_components/issue-detail/use-issue-sheet-template-config-query";
import { ProjectSectionTitle } from "../../_components/project-page-shell";
import { projectIssueTemplatesPanelMessages as messages } from "./project-issue-templates-panel.messages";

const NO_TEMPLATE_VALUE = "__no_template__";

export function ProjectIssueTemplatesPanel({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const configQuery = useIssueSheetTemplateConfigQuery({ organizationSlug, projectId });
  const membersQuery = useAssignableIssueMembersQuery({ organizationSlug, projectId });

  // Draft mirrors the PUT body shape directly. Re-synced from the server whenever configQuery's
  // data changes (including after this panel's own save), matching how the rest of this settings
  // page syncs its form state from the project query — no separate dirty-tracking here.
  const [defaultTemplateKey, setDefaultTemplateKey] = useState<string | null>(null);
  const [assigneeByTemplate, setAssigneeByTemplate] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!configQuery.data) {
      return;
    }
    setDefaultTemplateKey(configQuery.data.defaultTemplateKey);
    setAssigneeByTemplate(
      Object.fromEntries(
        configQuery.data.assigneeByTemplate.map((binding) => [binding.templateKey, binding.userId]),
      ),
    );
  }, [configQuery.data]);

  const serverBindingByTemplate = new Map(
    (configQuery.data?.assigneeByTemplate ?? []).map((binding) => [binding.templateKey, binding]),
  );

  const saveMutation = useMutation({
    mutationFn: async (): Promise<IssueSheetTemplateConfig> => {
      // Never re-send a binding that's still exactly the stale (no-longer-assignable) value the
      // picker displays as "unassigned" — the draft state keeps it around only so isStale can
      // detect it, but sending it back unchanged means the server rejects the same departed user
      // again, blocking a save that never touched this field.
      const assigneeByTemplateToSave = Object.fromEntries(
        Object.entries(assigneeByTemplate).filter(([templateKey, userId]) => {
          const serverBinding = serverBindingByTemplate.get(templateKey);
          return !(serverBinding && !serverBinding.assignable && serverBinding.userId === userId);
        }),
      );
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "issue-sheet"
      ]["template-config"].$put({
        param: { organizationSlug, projectId },
        json: {
          defaultTemplateKey,
          assigneeByTemplate: assigneeByTemplateToSave,
        },
      } as never);
      if (response.status !== 200) {
        throw new Error(
          (await readApiResponseError(response, intl.formatMessage(messages.saveError))).message,
        );
      }
      const body = await response.json();
      return body.templateConfig;
    },
    onSuccess: (templateConfig) => {
      queryClient.setQueryData(
        issueSheetTemplateConfigQueryKey(organizationSlug, projectId),
        templateConfig,
      );
      toast.success(intl.formatMessage(messages.saveSuccess));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.saveError));
    },
  });

  if (configQuery.isError) {
    return null;
  }

  const templateItems = [
    {
      value: NO_TEMPLATE_VALUE,
      label: intl.formatMessage(issueSheetTemplateMessages.noTemplateLabel),
    },
    ...issueSheetTemplates.map((template) => ({
      value: template.key,
      label: issueSheetTemplateLabel(intl, template.key),
    })),
  ];

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

      <Field className="gap-1.5">
        <FieldLabel htmlFor="default-issue-template">
          <FormattedMessage {...messages.defaultTemplateLabel} />
        </FieldLabel>
        <Select
          value={defaultTemplateKey ?? NO_TEMPLATE_VALUE}
          items={templateItems}
          onValueChange={(value) =>
            setDefaultTemplateKey(!value || value === NO_TEMPLATE_VALUE ? null : value)
          }
          disabled={configQuery.isLoading || saveMutation.isPending}
        >
          <SelectTrigger id="default-issue-template">
            {defaultTemplateKey
              ? issueSheetTemplateLabel(intl, defaultTemplateKey)
              : intl.formatMessage(issueSheetTemplateMessages.noTemplateLabel)}
          </SelectTrigger>
          <SelectContent>
            {templateItems.map((item) => (
              <SelectItem key={item.value} value={item.value} label={item.label}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="gap-2">
        <FieldLabel>
          <FormattedMessage {...messages.assigneeByTemplateLabel} />
        </FieldLabel>
        <div className="grid gap-2">
          {issueSheetTemplates.map((template) => {
            const serverBinding = serverBindingByTemplate.get(template.key);
            const draftUserId = assigneeByTemplate[template.key] ?? null;
            // Stale only while the draft still matches the exact binding the server flagged as
            // no-longer-assignable — picking any member from the (already-filtered-to-assignable)
            // picker below replaces it and clears this.
            const isStale = Boolean(
              serverBinding && !serverBinding.assignable && draftUserId === serverBinding.userId,
            );

            return (
              <div
                key={template.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <span className="text-sm">{issueSheetTemplateLabel(intl, template.key)}</span>
                <div className="flex items-center gap-2">
                  {isStale ? (
                    <Badge variant="outline">
                      <FormattedMessage {...messages.staleAssigneeBadge} />
                    </Badge>
                  ) : null}
                  <IssueAssigneePicker
                    value={isStale ? null : draftUserId}
                    members={membersQuery.data?.members ?? []}
                    isLoading={membersQuery.isLoading}
                    disabled={saveMutation.isPending}
                    size="sm"
                    onChange={(userId) =>
                      setAssigneeByTemplate((current) => {
                        const next = { ...current };
                        if (userId) {
                          next[template.key] = userId;
                        } else {
                          delete next[template.key];
                        }
                        return next;
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Field>

      <div>
        <Button
          type="button"
          disabled={configQuery.isLoading || saveMutation.isPending}
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
    </section>
  );
}
