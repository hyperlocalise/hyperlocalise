package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReportingAttributedUsageSQL(t *testing.T) {
	sql := reportingAttributedUsageSQL("$1", "u.feature_id <> 'ai_tokens'")
	require.Contains(t, sql, "from usage_events u")
	require.Contains(t, sql, "left join usage_events p on p.organization_id = u.organization_id")
	require.Contains(t, sql, "left join workspace_automation_runs wr")
	require.Contains(t, sql, "left join workspace_automations a")
	require.Contains(t, sql, "left join agent_runs ar")
	require.Contains(t, sql, "left join jobs t")
	require.Contains(t, sql, "left join projects own_project")
	require.Contains(t, sql, "left join projects parent_project")
	require.Contains(t, sql, "where u.organization_id = $1")
	require.Contains(t, sql, "from reporting_workspaces rw")
	require.Contains(t, sql, "u.feature_id <> 'ai_tokens'")
	require.Contains(t, sql, "coalesce(own_project.id, parent_project.id, a.project_id)")
	require.Contains(t, sql, "coalesce(p.source, u.source)")
}
