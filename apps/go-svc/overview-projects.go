package main

import (
	"context"
	"net/http"
	"time"
)

func (api *overviewAPI) projectsHandler(r *http.Request, actor overviewActor) (any, int, error) {
	projects, err := api.listPreviewProjects(r.Context(), actor)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"projects": projects}, http.StatusOK, nil
}

type overviewProjectSource struct {
	id, name, source     string
	externalProviderKind *string
	sourceLocale         *string
	targetLocales        []byte
	openJobCount         int
}

func (api *overviewAPI) listPreviewProjects(ctx context.Context, actor overviewActor) ([]overviewProjectItem, error) {
	rows, err := api.pool.Query(ctx, `
        select p.id, p.name, p.source, p.external_provider_kind, p.source_locale, p.target_locales,
               coalesce(open_jobs.count, 0)
        from projects p
        left join (
            select j.project_id, count(*)::int
            from jobs j
            where j.organization_id = $1
              and j.status in (`+overviewOpenJobStatusesSQL+`)
            group by j.project_id
        ) open_jobs on open_jobs.project_id = p.id
        where p.organization_id = $1
          and p.source in ('native', 'external_tms')
          and p.is_active is distinct from false
          and `+formatQaProjectTeamAccessSQL(2, 3, 1)+`
        order by case p.source when 'external_tms' then 0 else 1 end, p.updated_at desc
        limit $4`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, overviewProjectLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := make([]overviewProjectSource, 0, overviewProjectLimit)
	ids := make([]string, 0, overviewProjectLimit)
	for rows.Next() {
		var source overviewProjectSource
		if err := rows.Scan(
			&source.id, &source.name, &source.source, &source.externalProviderKind,
			&source.sourceLocale, &source.targetLocales, &source.openJobCount,
		); err != nil {
			return nil, err
		}
		sources = append(sources, source)
		ids = append(ids, source.id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	extras, err := api.loadProjectExtras(ctx, actor, ids)
	if err != nil {
		return nil, err
	}

	items := make([]overviewProjectItem, 0, len(sources))
	for _, source := range sources {
		item := overviewProjectItem{
			ID:           source.id,
			Name:         source.name,
			Source:       source.source,
			ProviderKind: source.externalProviderKind,
			LocaleRoute:  formatOverviewLocaleRoute(source.sourceLocale, decodeOverviewStringSlice(source.targetLocales)),
			OpenCount:    source.openJobCount,
			FailedCount:  extras.failedCounts[source.id],
			Href:         overviewProjectHref(actor.organizationSlug, source.id),
		}
		if openCount, ok := extras.openCounts[source.id]; ok {
			item.OpenCount = openCount
		}
		if domain, ok := extras.domains[source.id]; ok {
			item.Domain = &domain
		}
		if latest, ok := extras.latestByProject[source.id]; ok {
			title := resolveOverviewJobTitle(latest.title)
			item.LatestJobTitle = &title
			item.LatestJobAt = overviewOptionalISO(&latest.updatedAt)
		}
		items = append(items, item)
	}
	return items, nil
}

type overviewProjectExtras struct {
	latestByProject map[string]overviewLatestProjectJob
	failedCounts    map[string]int
	openCounts      map[string]int
	domains         map[string]string
}

type overviewLatestProjectJob struct {
	title     overviewJobTitleInput
	updatedAt time.Time
}

func (api *overviewAPI) loadProjectExtras(ctx context.Context, actor overviewActor, projectIDs []string) (overviewProjectExtras, error) {
	empty := overviewProjectExtras{
		latestByProject: map[string]overviewLatestProjectJob{},
		failedCounts:    map[string]int{},
		openCounts:      map[string]int{},
		domains:         map[string]string{},
	}
	if len(projectIDs) == 0 {
		return empty, nil
	}

	latestRows, err := api.pool.Query(ctx, `
        select distinct on (j.project_id)
            j.project_id, j.id, j.kind, j.input_payload, j.updated_at, e.title, r.criteria, s.connector_kind, s.direction
        from jobs j
        left join translation_job_details t on t.job_id = j.id
        left join review_job_details r on r.job_id = j.id
        left join sync_job_details s on s.job_id = j.id
        left join external_job_details e on e.job_id = j.id
        where `+overviewJobsVisibleSQL()+`
          and j.project_id = any($4)
        order by j.project_id, j.updated_at desc`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, projectIDs)
	if err != nil {
		return empty, err
	}
	defer latestRows.Close()
	for latestRows.Next() {
		var (
			projectID, jobID, kind string
			inputPayload           []byte
			updatedAt              time.Time
			externalTitle          *string
			reviewCriteria         *string
			syncConnector          *string
			syncDirection          *string
		)
		if err := latestRows.Scan(
			&projectID, &jobID, &kind, &inputPayload, &updatedAt,
			&externalTitle, &reviewCriteria, &syncConnector, &syncDirection,
		); err != nil {
			return empty, err
		}
		empty.latestByProject[projectID] = overviewLatestProjectJob{
			title: overviewJobTitleInput{
				ID:                jobID,
				Kind:              kind,
				InputPayload:      inputPayload,
				ExternalTitle:     externalTitle,
				ReviewCriteria:    reviewCriteria,
				SyncConnectorKind: syncConnector,
				SyncDirection:     syncDirection,
			},
			updatedAt: updatedAt,
		}
	}
	if err := latestRows.Err(); err != nil {
		return empty, err
	}

	if err := api.scanProjectCounts(ctx, actor, projectIDs, `j.status = 'failed'`, empty.failedCounts); err != nil {
		return empty, err
	}
	if err := api.scanProjectCounts(ctx, actor, projectIDs, `j.status in (`+overviewOpenJobStatusesSQL+`)`, empty.openCounts); err != nil {
		return empty, err
	}

	domainRows, err := api.pool.Query(ctx, `
        select project_id, domain_key
        from linked_domains
        where organization_id = $1
          and status = 'verified'
          and project_id = any($2)`,
		actor.organizationID, projectIDs)
	if err != nil {
		return empty, err
	}
	defer domainRows.Close()
	for domainRows.Next() {
		var projectID, domainKey string
		if err := domainRows.Scan(&projectID, &domainKey); err != nil {
			return empty, err
		}
		if projectID != "" {
			empty.domains[projectID] = domainKey
		}
	}
	return empty, domainRows.Err()
}

func (api *overviewAPI) scanProjectCounts(ctx context.Context, actor overviewActor, projectIDs []string, statusSQL string, dest map[string]int) error {
	rows, err := api.pool.Query(ctx, `
        select j.project_id, count(*)::int
        from jobs j
        where `+overviewJobsVisibleSQL()+`
          and j.project_id = any($4)
          and `+statusSQL+`
        group by j.project_id`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, projectIDs)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var projectID *string
		var count int
		if err := rows.Scan(&projectID, &count); err != nil {
			return err
		}
		if projectID != nil {
			dest[*projectID] = count
		}
	}
	return rows.Err()
}

func (api *overviewAPI) queryDayCounts(ctx context.Context, statement string, args ...any) ([]overviewDayCount, error) {
	rows, err := api.pool.Query(ctx, statement, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]overviewDayCount, 0)
	for rows.Next() {
		var row overviewDayCount
		if err := rows.Scan(&row.Day, &row.Count); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (api *overviewAPI) countOpenIssues(ctx context.Context, actor overviewActor, priority string) (int, error) {
	args := []any{actor.organizationID, actor.canReadAllTeams(), actor.userID}
	statement := `
        select count(*)::int
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        ` + orgIssuePriorityJoinSQL + `
        where i.organization_id = $1
          and ` + formatQaProjectTeamAccessSQL(2, 3, 1) + `
          and i.status in ('open', 'in_progress')`
	if priority != "" {
		args = append(args, priority)
		statement += ` and priority_values.value #>> '{}' = $4`
	}
	var count int
	if err := api.pool.QueryRow(ctx, statement, args...).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (api *overviewAPI) countAutomationStatuses(ctx context.Context, organizationID string) (int, int, error) {
	rows, err := api.pool.Query(ctx, `
        select status, count(*)::int
        from workspace_automations
        where organization_id = $1
          and status in ('active', 'paused')
        group by status`, organizationID)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()
	var counted []struct {
		Status string
		Count  int
	}
	for rows.Next() {
		var row struct {
			Status string
			Count  int
		}
		if err := rows.Scan(&row.Status, &row.Count); err != nil {
			return 0, 0, err
		}
		counted = append(counted, row)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	total, paused := countOverviewAutomationStatuses(counted)
	return total, paused, nil
}

type overviewAutomationRun struct {
	id, automationID, automationName, triggerSource, status string
	createdAt                                               time.Time
	completedAt                                             *time.Time
}

func (api *overviewAPI) listRecentAutomationRuns(ctx context.Context, organizationID string, limit int) ([]overviewAutomationRun, error) {
	rows, err := api.pool.Query(ctx, `
        select r.id, r.automation_id, a.name, r.trigger_source, r.status, r.created_at, r.completed_at
        from workspace_automation_runs r
        join workspace_automations a on a.id = r.automation_id
        where r.organization_id = $1
          and a.organization_id = $1
          and a.status in ('active', 'paused')
        order by r.created_at desc
        limit $2`, organizationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]overviewAutomationRun, 0, limit)
	for rows.Next() {
		var run overviewAutomationRun
		if err := rows.Scan(
			&run.id, &run.automationID, &run.automationName, &run.triggerSource,
			&run.status, &run.createdAt, &run.completedAt,
		); err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}
