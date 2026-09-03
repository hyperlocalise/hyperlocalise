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
import { ArrowLeft01Icon, Tick02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  groupRolePermissionRows,
  ROLE_PERMISSION_MATRIX_ROLES,
  type RolePermissionGroupId,
  type RolePermissionRowId,
  roleHasPermissionRow,
} from "@/lib/members/role-permission-matrix";

import { WorkspacePeopleNav } from "../../_components/workspace-people-nav";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { getRoleLabel } from "./members-settings-view-model";
import { rolePermissionsPageViewMessages as messages } from "./role-permissions-page-view.messages";

const groupMessages = {
  work: messages.groupWork,
  people: messages.groupPeople,
  workspace: messages.groupWorkspace,
} as const satisfies Record<RolePermissionGroupId, typeof messages.groupWork>;

const rowMessages = {
  "view-workspace": messages.rowViewWorkspace,
  "view-projects": messages.rowViewProjects,
  "view-jobs": messages.rowViewJobs,
  "work-jobs": messages.rowWorkJobs,
  "run-ai": messages.rowRunAi,
  "push-drafts": messages.rowPushDrafts,
  "approve-reviews": messages.rowApproveReviews,
  "approve-write-back": messages.rowApproveWriteBack,
  "create-projects": messages.rowCreateProjects,
  "manage-projects": messages.rowManageProjects,
  "invite-people": messages.rowInvitePeople,
  "manage-teams": messages.rowManageTeams,
  "edit-glossaries": messages.rowEditGlossaries,
  "edit-memories": messages.rowEditMemories,
  "view-integrations": messages.rowViewIntegrations,
  "manage-integrations": messages.rowManageIntegrations,
  "manage-credentials": messages.rowManageCredentials,
  "update-settings": messages.rowUpdateSettings,
  "manage-billing": messages.rowManageBilling,
} as const satisfies Record<RolePermissionRowId, typeof messages.rowViewWorkspace>;

function PermissionMark({ allowed }: { allowed: boolean }) {
  if (!allowed) {
    return (
      <span className="sr-only">
        <FormattedMessage {...messages.notAllowed} />
      </span>
    );
  }

  return (
    <>
      <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 text-primary" />
      <span className="sr-only">
        <FormattedMessage {...messages.allowed} />
      </span>
    </>
  );
}

export function RolePermissionsPageView({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const groups = groupRolePermissionRows();

  return (
    <WorkspacePageShell>
      <WorkspacePeopleNav organizationSlug={organizationSlug} />

      <div className="flex flex-col gap-4">
        <Button
          nativeButton={false}
          render={<Link href={`/org/${organizationSlug}/members`} />}
          variant="ghost"
          size="sm"
          className="w-fit px-2 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
          <FormattedMessage {...messages.backToMembers} />
        </Button>

        <PageHeader
          icon={UserGroupIcon}
          label={intl.formatMessage(messages.pageLabel)}
          title={intl.formatMessage(messages.pageTitle)}
          description={intl.formatMessage(messages.pageDescription)}
        />
      </div>

      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">
            <FormattedMessage {...messages.matrixAriaLabel} />
          </caption>
          <thead>
            <tr className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              <th scope="col" className="px-3 py-3 text-start font-medium">
                <FormattedMessage {...messages.columnPermission} />
              </th>
              {ROLE_PERMISSION_MATRIX_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="w-[6.75rem] px-2 py-3 text-center font-medium"
                >
                  {getRoleLabel(role, intl)}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={ROLE_PERMISSION_MATRIX_ROLES.length + 1}
                  className="rounded-md bg-muted px-3 py-2 text-start text-xs font-medium text-muted-foreground"
                >
                  <FormattedMessage {...groupMessages[group.id]} />
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
                  <th scope="row" className="px-3 py-3 text-start font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">
                        <FormattedMessage {...rowMessages[row.id]} />
                      </span>
                      <span className="font-mono text-[11px] leading-4 text-muted-foreground">
                        {row.capability}
                      </span>
                    </div>
                  </th>
                  {ROLE_PERMISSION_MATRIX_ROLES.map((role) => (
                    <td key={role} className="px-2 py-3 text-center">
                      <span className="inline-flex size-5 items-center justify-center">
                        <PermissionMark allowed={roleHasPermissionRow(role, row.capability)} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </WorkspacePageShell>
  );
}
