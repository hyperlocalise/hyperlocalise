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
import { FormattedMessage, useIntl } from "react-intl";

import { ISSUE_BULK_ACTION_MAX_ITEMS } from "@/api/routes/issues/issues-bulk.schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";

import { IssueAssigneePicker } from "./issue-detail/issue-assignee-picker";
import {
  issuePriorityLabel,
  issuePriorityValues,
  issueStatusLabel,
  issueStatusValues,
  issueTypeLabel,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "./issue-detail/issue-detail-utils";
import {
  issueTypeValues,
  type IssueTypeValue,
} from "../projects/[projectId]/issue-sheet/_components/issue-sheet-constants";
import { useAssignableIssueMembersQuery } from "./issue-detail/use-assignable-issue-members";
import { issueBulkActionBarMessages as messages } from "./issue-bulk-action-bar.messages";

export function IssueBulkActionBar({
  organizationSlug,
  selectedCount,
  allLoadedSelected,
  selectedProjectIds,
  selectionLimitReached,
  isPending,
  onSelectAllLoaded,
  onClearSelection,
  onAssign,
  onUnassign,
  onSetStatus,
  onSetPriority,
  onSetIssueType,
}: {
  organizationSlug: string;
  selectedCount: number;
  allLoadedSelected: boolean;
  selectedProjectIds: Set<string>;
  selectionLimitReached: boolean;
  isPending: boolean;
  onSelectAllLoaded: () => void;
  onClearSelection: () => void;
  onAssign: (assigneeUserId: string) => void;
  onUnassign: () => void;
  onSetStatus: (status: IssueStatusValue) => void;
  onSetPriority: (priority: IssuePriorityValue) => void;
  onSetIssueType: (issueType: IssueTypeValue) => void;
}) {
  const intl = useIntl();
  const singleProjectId = selectedProjectIds.size === 1 ? [...selectedProjectIds][0] : undefined;
  const assignDisabled = selectedProjectIds.size !== 1;
  const membersQuery = useAssignableIssueMembersQuery({
    organizationSlug,
    projectId: singleProjectId,
    enabled: Boolean(singleProjectId) && selectedCount > 0,
  });

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2",
        isPending && "opacity-80",
      )}
      aria-busy={isPending}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          checked={allLoadedSelected}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectAllLoaded();
            } else {
              onClearSelection();
            }
          }}
          aria-label={intl.formatMessage(messages.selectAllLoadedAria)}
          disabled={isPending}
        />
        <span className="text-sm font-medium tabular-nums">
          <FormattedMessage {...messages.selectedCount} values={{ count: selectedCount }} />
        </span>
      </div>

      {selectionLimitReached ? (
        <span className="text-xs text-muted-foreground">
          <FormattedMessage
            {...messages.selectionLimitReached}
            values={{ max: ISSUE_BULK_ACTION_MAX_ITEMS }}
          />
        </span>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {assignDisabled ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <Button type="button" size="sm" variant="outline" disabled>
                      <FormattedMessage {...messages.assign} />
                    </Button>
                  </span>
                }
              />
              <TooltipContent>
                <FormattedMessage {...messages.assignDisabledMixedProjects} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <IssueAssigneePicker
            value={null}
            currentLabel={intl.formatMessage(messages.assign)}
            members={membersQuery.data?.members ?? []}
            isLoading={membersQuery.isLoading}
            disabled={isPending}
            size="sm"
            onChange={(assigneeUserId) => {
              if (assigneeUserId) {
                onAssign(assigneeUserId);
              }
            }}
          />
        )}

        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={onUnassign}>
          <FormattedMessage {...messages.unassign} />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" size="sm" variant="outline" disabled={isPending}>
                <FormattedMessage {...messages.setStatus} />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {issueStatusValues.map((status) => (
              <DropdownMenuItem key={status} onClick={() => onSetStatus(status)}>
                {issueStatusLabel(intl, status)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" size="sm" variant="outline" disabled={isPending}>
                <FormattedMessage {...messages.setPriority} />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {issuePriorityValues.map((priority) => (
              <DropdownMenuItem key={priority} onClick={() => onSetPriority(priority)}>
                {issuePriorityLabel(intl, priority)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" size="sm" variant="outline" disabled={isPending}>
                <FormattedMessage {...messages.setIssueType} />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {issueTypeValues.map((issueType) => (
              <DropdownMenuItem key={issueType} onClick={() => onSetIssueType(issueType)}>
                {issueTypeLabel(intl, issueType)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={onClearSelection}
        >
          <FormattedMessage {...messages.clearSelection} />
        </Button>
      </div>

      {isPending ? (
        <div className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          <FormattedMessage {...messages.bulkPending} />
        </div>
      ) : null}
    </div>
  );
}
