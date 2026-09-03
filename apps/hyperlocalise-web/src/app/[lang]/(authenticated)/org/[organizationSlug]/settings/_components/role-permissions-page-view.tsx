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
import { Fragment } from "react";
import { ArrowLeft01Icon, Tick02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import {
  groupRolePermissionRows,
  ROLE_PERMISSION_MATRIX_ROLES,
  type RolePermissionGroupId,
  type RolePermissionRow,
  type RolePermissionRowId,
  roleHasPermissionRow,
} from "@/lib/members/role-permission-matrix";

import { WorkspacePeopleNav } from "../../_components/workspace-people-nav";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";

import { getRoleLabel } from "./members-settings-view-model";
import { rolePermissionsPageViewMessages as messages } from "./role-permissions-page-view.messages";

const ROLE_COLUMN_COUNT = ROLE_PERMISSION_MATRIX_ROLES.length;
const MATRIX_COLUMN_COUNT = ROLE_COLUMN_COUNT + 1;
const ROLE_COLUMN_WIDTH = "1/12" as const;

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
    <Box display="inline-flex" alignItems="center" justifyContent="center">
      <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-4 text-primary" />
      <span className="sr-only">
        <FormattedMessage {...messages.allowed} />
      </span>
    </Box>
  );
}

function MatrixHeaderRow() {
  const intl = useIntl();

  return (
    <Columns spacing="1u" alignY="center" role="row">
      <Column width="fluid" role="columnheader">
        <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          <FormattedMessage {...messages.columnPermission} />
        </span>
      </Column>
      {ROLE_PERMISSION_MATRIX_ROLES.map((role) => (
        <Column key={role} width={ROLE_COLUMN_WIDTH} role="columnheader">
          <Row spacing="0" align="center" alignY="center">
            <span className="text-center text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {getRoleLabel(role, intl)}
            </span>
          </Row>
        </Column>
      ))}
    </Columns>
  );
}

function MatrixGroupHeader({ groupId }: { groupId: RolePermissionGroupId }) {
  return (
    <Columns spacing="0" role="row">
      <Column width="fluid" role="columnheader" aria-colspan={MATRIX_COLUMN_COUNT}>
        <Box background="muted" paddingX="1.5u" paddingY="1u" borderRadius="standard">
          <span className="text-xs font-medium text-muted-foreground">
            <FormattedMessage {...groupMessages[groupId]} />
          </span>
        </Box>
      </Column>
    </Columns>
  );
}

function MatrixPermissionRow({ row }: { row: RolePermissionRow }) {
  return (
    <Columns spacing="1u" alignY="center" role="row">
      <Column width="fluid" role="rowheader">
        <Rows spacing="0.5u">
          <span className="font-medium text-foreground">
            <FormattedMessage {...rowMessages[row.id]} />
          </span>
          <span className="font-mono text-[11px] leading-4 text-muted-foreground">
            {row.capability}
          </span>
        </Rows>
      </Column>
      {ROLE_PERMISSION_MATRIX_ROLES.map((role) => (
        <Column key={role} width={ROLE_COLUMN_WIDTH} role="cell">
          <Row spacing="0" align="center" alignY="center">
            <PermissionMark allowed={roleHasPermissionRow(role, row.capability)} />
          </Row>
        </Column>
      ))}
    </Columns>
  );
}

export function RolePermissionsPageView({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const groups = groupRolePermissionRows();

  return (
    <WorkspacePageShell>
      <WorkspacePeopleNav organizationSlug={organizationSlug} />

      <Rows spacing="2u">
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
      </Rows>

      <Rows
        spacing="1u"
        role="table"
        aria-label={intl.formatMessage(messages.matrixAriaLabel)}
        aria-colcount={MATRIX_COLUMN_COUNT}
      >
        <MatrixHeaderRow />
        {groups.map((group) => (
          <Fragment key={group.id}>
            <MatrixGroupHeader groupId={group.id} />
            {group.rows.map((row) => (
              <MatrixPermissionRow key={row.id} row={row} />
            ))}
          </Fragment>
        ))}
      </Rows>
    </WorkspacePageShell>
  );
}
