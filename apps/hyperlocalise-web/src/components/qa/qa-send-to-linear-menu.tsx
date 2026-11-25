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

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { CaretDownIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api-client-instance";
import { LINEAR_QA_FINDING_ISSUES_MAX } from "@/lib/linear/qa-finding-issues-limits";

import { qaSendToLinearMenuMessages as messages } from "./qa-send-to-linear-menu.messages";

type LinearTeamOption = { id: string; key: string; name: string };

type TeamsState =
  | { kind: "ready"; teams: LinearTeamOption[] }
  | { kind: "not_connected" }
  | { kind: "error" };

async function readErrorCode(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : null;
}

function isNotConnectedCode(code: string | null) {
  return code === "linear_not_connected" || code === "linear_pipes_needs_reauthorization";
}

/** Files the selected QA findings as Linear issues in a team the person picks. */
export function QaSendToLinearMenu({
  organizationSlug,
  findingIds,
  disabled,
  onSent,
}: {
  organizationSlug: string;
  findingIds: readonly string[];
  disabled: boolean;
  onSent: () => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  const teamsQuery = useQuery({
    queryKey: ["linear-teams", organizationSlug],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TeamsState> => {
      const response = await apiClient.api.orgs[":organizationSlug"].linear.teams.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        const code = await readErrorCode(response);
        return isNotConnectedCode(code) ? { kind: "not_connected" } : { kind: "error" };
      }
      const body = await response.json();
      return { kind: "ready", teams: body.teams };
    },
  });

  const send = useMutation({
    mutationFn: async (team: LinearTeamOption) => {
      const issues: { identifier: string; url: string }[] = [];
      let missed = 0;
      for (let offset = 0; offset < findingIds.length; offset += LINEAR_QA_FINDING_ISSUES_MAX) {
        const batch = findingIds.slice(offset, offset + LINEAR_QA_FINDING_ISSUES_MAX);
        const response = await apiClient.api.orgs[":organizationSlug"].linear[
          "qa-finding-issues"
        ].$post({
          param: { organizationSlug },
          json: { teamId: team.id, findingIds: [...batch] },
        });
        if (response.status !== 201) {
          if (issues.length === 0) {
            throw new Error((await readErrorCode(response)) ?? "linear_request_failed");
          }
          missed += batch.length;
          continue;
        }
        const body = await response.json();
        issues.push(...body.issues);
        missed += body.failedCount + body.skippedCount;
      }
      return { team, issues, missed };
    },
    onSuccess: ({ team, issues, missed }) => {
      const first = issues[0];
      const values = { count: issues.length, total: issues.length + missed, team: team.name };
      toast.success(
        intl.formatMessage(missed > 0 ? messages.partlySent : messages.sent, values),
        first
          ? {
              action: {
                label: intl.formatMessage(messages.openIssue, { identifier: first.identifier }),
                onClick: () => window.open(first.url, "_blank", "noopener,noreferrer"),
              },
            }
          : undefined,
      );
      onSent();
    },
    onError: (error) => {
      toast.error(
        intl.formatMessage(
          isNotConnectedCode(error.message) ? messages.notConnected : messages.sendError,
        ),
      );
    },
  });

  const state = teamsQuery.data;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || send.isPending || findingIds.length === 0}
          />
        }
      >
        {intl.formatMessage(messages.trigger)}
        <CaretDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{intl.formatMessage(messages.chooseTeam)}</DropdownMenuLabel>
          {teamsQuery.isPending ? (
            <DropdownMenuItem disabled>
              {intl.formatMessage(messages.loadingTeams)}
            </DropdownMenuItem>
          ) : teamsQuery.isError || state?.kind === "error" ? (
            <DropdownMenuItem disabled>{intl.formatMessage(messages.loadError)}</DropdownMenuItem>
          ) : state?.kind === "not_connected" ? (
            <DropdownMenuItem disabled>
              {intl.formatMessage(messages.notConnected)}
            </DropdownMenuItem>
          ) : state?.kind === "ready" && state.teams.length === 0 ? (
            <DropdownMenuItem disabled>{intl.formatMessage(messages.noTeams)}</DropdownMenuItem>
          ) : state?.kind === "ready" ? (
            state.teams.map((team) => (
              <DropdownMenuItem key={team.id} onClick={() => send.mutate(team)}>
                <span className="font-mono text-xs text-muted-foreground">{team.key}</span>
                {team.name}
              </DropdownMenuItem>
            ))
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
