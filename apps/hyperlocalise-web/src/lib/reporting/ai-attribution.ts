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
import { sql, type SQL } from "drizzle-orm";

const UUID = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const UUID_PATTERN = sql.raw(`'${UUID}'`);

/**
 * Billing's usage rows (`usage_events`) of one workspace, each with the task and project it
 * belongs to, so AI usage and AI spending place every call the same way. A row's parent is the
 * row its `dimensions.parent_operation_key` names: the job, run or call it was part of.
 *
 * A row belongs to a task through its own task, its parent's, or the connected TMS run its parent
 * stands for, and then to that task's project only (none, for a task outside any project). With
 * no task, it belongs to the project recorded on it or on its parent, or to its automation's
 * project. A recorded id that is not one of the workspace's projects, such as a connected TMS's
 * own project id or a deleted project, counts as none. Columns: `id`, `feature_id`, `model_id`,
 * `credential_source`, `amount_usd`, `dimensions`, `created_at`, `source` (the parent's when there
 * is one), `agent_run_kind`, `automation_id` (the automation its parent ran for, as text),
 * `job_id` (null with no task), `project_id` (null with no project) and `via_api_key`.
 */
export function attributedUsage(input: { organizationId: string; where: SQL }): SQL {
  return sql`
    select u.id, u.feature_id, u.model_id, u.credential_source, u.amount_usd, u.dimensions,
      u.created_at, coalesce(p.source, u.source) as source, ar.kind as agent_run_kind,
      a.id::text as automation_id,
      t.id as job_id, t.api_key_id is not null as via_api_key,
      case when t.id is not null then t.project_id
        else coalesce(own_project.id, parent_project.id, a.project_id) end as project_id
    from usage_events u
    -- Within the workspace, so the lookup never reaches other workspaces' rows; token rows are
    -- only ever children (\`<parent>:ai_tokens\`), so the lookup leaves them out.
    left join usage_events p on p.organization_id = u.organization_id
      and p.feature_id <> 'ai_tokens'
      and p.operation_key = u.dimensions ->> 'parent_operation_key'
    left join workspace_automations a on a.organization_id = u.organization_id and a.id = case
      when p.dimensions ->> 'automation_id' ~ ${UUID_PATTERN}
      then (p.dimensions ->> 'automation_id')::uuid end
    left join agent_runs ar on ar.organization_id = u.organization_id and ar.id = case
      when p.source = 'agent_run_create' and split_part(p.operation_key, ':', 2) ~ ${UUID_PATTERN}
      then split_part(p.operation_key, ':', 2)::uuid end
    left join jobs t on t.organization_id = u.organization_id
      and t.id = coalesce(u.job_id, p.job_id, ar.hyperlocalise_job_id)
    left join projects own_project on own_project.organization_id = u.organization_id
      and own_project.id = u.dimensions ->> 'project_id'
    left join projects parent_project on parent_project.organization_id = u.organization_id
      and parent_project.id = p.dimensions ->> 'project_id'
    where u.organization_id = ${input.organizationId} and ${input.where}`;
}
