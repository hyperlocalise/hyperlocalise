"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { JobAssigneeRole } from "@/lib/database/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TypographyH2 } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";

import type { JobDetailRecord } from "./job-detail-types";

type WorkspaceMember = {
  workosUserId: string;
  displayName: string;
  email: string;
  role: string;
  status: "active" | "invited";
};

const assigneeRoles: JobAssigneeRole[] = ["translator", "reviewer"];

const membersQueryKey = (organizationSlug: string) => ["workspace-members", organizationSlug];

function getRoleLabel(role: JobAssigneeRole) {
  return role === "translator" ? "Translator" : "Reviewer";
}

function formatAssigneeSummary(job: JobDetailRecord) {
  if (job.externalAssignedUsers?.length) {
    return job.externalAssignedUsers.join(", ");
  }

  if (!job.ownerUserId) {
    return "Unassigned";
  }

  const name = job.ownerDisplayName ?? job.ownerEmail ?? job.ownerUserId;
  return job.assigneeRole ? `${name} (${getRoleLabel(job.assigneeRole)})` : name;
}

export function JobAssigneeSection({
  canEdit,
  job,
  jobId,
  organizationSlug,
}: {
  canEdit: boolean;
  job: JobDetailRecord;
  jobId: string;
  organizationSlug: string;
}) {
  const memberFieldId = useId();
  const roleFieldId = useId();
  const queryClient = useQueryClient();
  const jobQueryKey = ["job", organizationSlug, job.projectId, jobId] as const;

  const membersQuery = useQuery({
    queryKey: membersQueryKey(organizationSlug),
    enabled: canEdit,
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

  const [assigneeWorkosUserId, setAssigneeWorkosUserId] = useState<string | null>(null);
  const [assigneeRole, setAssigneeRole] = useState<JobAssigneeRole>("translator");

  useEffect(() => {
    if (!membersQuery.data) {
      return;
    }

    if (!job.ownerUserId) {
      setAssigneeWorkosUserId(null);
      setAssigneeRole("translator");
      return;
    }

    const matchedMember = membersQuery.data.find((member) => member.email === job.ownerEmail);
    setAssigneeWorkosUserId(matchedMember?.workosUserId ?? null);
    setAssigneeRole(job.assigneeRole ?? "translator");
  }, [job.assigneeRole, job.ownerEmail, job.ownerUserId, membersQuery.data]);

  const saveAssignment = useMutation({
    mutationFn: async (input: {
      assigneeWorkosUserId: string | null;
      assigneeRole: JobAssigneeRole | null;
    }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[
        ":jobId"
      ].assignment.$patch({
        param: { organizationSlug, jobId },
        json: input,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Failed to update job assignment");
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jobQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success("Job assignment updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update job assignment");
    },
  });

  return (
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
        Assignment
      </TypographyH2>

      {canEdit ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
          <Field>
            <FieldLabel htmlFor={memberFieldId}>Assignee</FieldLabel>
            <Select
              value={assigneeWorkosUserId ?? "unassigned"}
              onValueChange={(value) => {
                if (value === "unassigned") {
                  setAssigneeWorkosUserId(null);
                  return;
                }

                setAssigneeWorkosUserId(value);
              }}
              disabled={saveAssignment.isPending || membersQuery.isLoading}
            >
              <SelectTrigger id={memberFieldId} className="border-foreground/10 bg-foreground/4">
                <SelectValue placeholder="Select a member" />
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
            <FieldDescription>
              Assign a translator or reviewer responsible for this job.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={roleFieldId}>Role</FieldLabel>
            <Select
              value={assigneeRole}
              onValueChange={(value) => setAssigneeRole(value as JobAssigneeRole)}
              disabled={!assigneeWorkosUserId || saveAssignment.isPending}
            >
              <SelectTrigger id={roleFieldId} className="border-foreground/10 bg-foreground/4">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assigneeRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {getRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button
            type="button"
            disabled={saveAssignment.isPending || membersQuery.isLoading}
            onClick={() =>
              saveAssignment.mutate({
                assigneeWorkosUserId,
                assigneeRole: assigneeWorkosUserId ? assigneeRole : null,
              })
            }
          >
            {saveAssignment.isPending ? <Spinner /> : null}
            {saveAssignment.isPending ? "Saving..." : "Save assignment"}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-foreground/68">{formatAssigneeSummary(job)}</p>
      )}
    </section>
  );
}
