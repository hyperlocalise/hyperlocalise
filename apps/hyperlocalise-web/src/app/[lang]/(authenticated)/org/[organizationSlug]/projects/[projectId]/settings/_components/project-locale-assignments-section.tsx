"use client";

import { useEffect, useMemo, useState } from "react";
import { SaveIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { JobAssigneeRole } from "@/lib/database/types";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import { ProjectSectionTitle } from "../../_components/project-page-shell";
import type { ProjectListRow } from "../../../_components/project-list";

type WorkspaceMember = {
  workosUserId: string;
  displayName: string;
  email: string;
  status: "active" | "invited";
};

type LocaleAssignmentRow = {
  locale: string;
  role: JobAssigneeRole;
  workosUserId: string;
  displayName: string;
};

const membersQueryKey = (organizationSlug: string) => ["workspace-members", organizationSlug];

const localeAssignmentsQueryKey = (organizationSlug: string, projectId: string) => [
  "project-locale-assignments",
  organizationSlug,
  projectId,
];

function getRoleLabel(role: JobAssigneeRole) {
  return role === "translator" ? "Translator" : "Reviewer";
}

function buildAssignmentKey(locale: string, role: JobAssigneeRole) {
  return `${locale}:${role}`;
}

export function ProjectLocaleAssignmentsSection({
  canEdit,
  organizationSlug,
  project,
}: {
  canEdit: boolean;
  organizationSlug: string;
  project: ProjectListRow;
}) {
  const queryClient = useQueryClient();
  const targetLocales = useMemo(
    () => project.targetLocales.filter((locale) => locale !== project.sourceLocale),
    [project.sourceLocale, project.targetLocales],
  );

  const membersQuery = useQuery({
    queryKey: membersQueryKey(organizationSlug),
    enabled: canEdit && project.source === "native",
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].members.$get({
        param: { organizationSlug },
      });

      if (!response.ok) {
        throw new Error("Failed to load workspace members");
      }

      const body = (await response.json()) as { members: WorkspaceMember[] };
      return body.members.filter((member) => member.status === "active");
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: localeAssignmentsQueryKey(organizationSlug, project.id),
    enabled: project.source === "native",
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "locale-assignments"
      ].$get({
        param: { organizationSlug, projectId: project.id },
      });

      if (!response.ok) {
        throw new Error("Failed to load locale assignments");
      }

      const body = (await response.json()) as { localeAssignments: LocaleAssignmentRow[] };
      return body.localeAssignments;
    },
  });

  const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!assignmentsQuery.data) {
      return;
    }

    const nextDraft: Record<string, string> = {};
    for (const assignment of assignmentsQuery.data) {
      nextDraft[buildAssignmentKey(assignment.locale, assignment.role)] = assignment.workosUserId;
    }
    setDraftAssignments(nextDraft);
  }, [assignmentsQuery.data]);

  const saveAssignments = useMutation({
    mutationFn: async () => {
      const assignments = Object.entries(draftAssignments)
        .filter(([, workosUserId]) => workosUserId.length > 0)
        .map(([key, assigneeWorkosUserId]) => {
          const [locale, role] = key.split(":");
          return {
            locale,
            role: role as JobAssigneeRole,
            assigneeWorkosUserId,
          };
        });

      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "locale-assignments"
      ].$put({
        param: { organizationSlug, projectId: project.id },
        json: { assignments },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Failed to save locale assignments");
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: localeAssignmentsQueryKey(organizationSlug, project.id),
      });
      toast.success("Locale assignments saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save locale assignments");
    },
  });

  if (project.source !== "native") {
    return null;
  }

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4">
      <div>
        <ProjectSectionTitle>Locale assignments</ProjectSectionTitle>
        <TypographyP className="mt-1 text-sm text-foreground/52">
          Default translators and reviewers for new jobs created in this project.
        </TypographyP>
      </div>

      {targetLocales.length === 0 ? (
        <TypographyP className="mt-4 text-sm text-foreground/52">
          Add target locales before configuring locale assignments.
        </TypographyP>
      ) : (
        <div className="mt-4 space-y-4">
          {targetLocales.map((locale) => (
            <div
              key={locale}
              className="grid gap-3 rounded-lg border border-foreground/8 bg-background/40 p-4 md:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] md:items-end"
            >
              <div>
                <TypographyP className="text-xs font-medium tracking-[0.08em] text-foreground/34 uppercase">
                  Locale
                </TypographyP>
                <TypographyP className="mt-1 text-sm text-foreground/78">{locale}</TypographyP>
              </div>

              {(["translator", "reviewer"] as const).map((role) => {
                const fieldKey = buildAssignmentKey(locale, role);
                return (
                  <Field key={fieldKey}>
                    <FieldLabel>{getRoleLabel(role)}</FieldLabel>
                    <Select
                      value={draftAssignments[fieldKey] ?? "unassigned"}
                      onValueChange={(value) => {
                        if (!value) {
                          return;
                        }

                        setDraftAssignments((current) => {
                          const next = { ...current };
                          if (value === "unassigned") {
                            delete next[fieldKey];
                          } else {
                            next[fieldKey] = value;
                          }
                          return next;
                        });
                      }}
                      disabled={!canEdit || saveAssignments.isPending || membersQuery.isLoading}
                    >
                      <SelectTrigger className="border-foreground/10 bg-foreground/4">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {(membersQuery.data ?? []).map((member) => (
                          <SelectItem key={member.workosUserId} value={member.workosUserId}>
                            {member.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                );
              })}
            </div>
          ))}

          {canEdit ? (
            <div className="flex justify-end">
              <Button
                type="button"
                disabled={saveAssignments.isPending || membersQuery.isLoading}
                onClick={() => saveAssignments.mutate()}
              >
                {saveAssignments.isPending ? <Spinner /> : <SaveIcon />}
                {saveAssignments.isPending ? "Saving..." : "Save locale assignments"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
