package main

import (
	"context"
	"net/http"
	"time"

	"golang.org/x/sync/errgroup"
)

func (api *overviewAPI) activityHandler(r *http.Request, actor overviewActor) (any, int, error) {
	includeAutomations := api.includeAutomations(r.Context(), actor)

	var (
		jobItems        []overviewActivityItem
		automationItems []overviewActivityItem
	)
	g, ctx := errgroup.WithContext(r.Context())
	g.Go(func() error {
		items, err := api.listRecentJobActivity(ctx, actor)
		if err != nil {
			return err
		}
		jobItems = items
		return nil
	})
	if includeAutomations {
		g.Go(func() error {
			runs, err := api.listRecentAutomationRuns(ctx, actor.organizationID, overviewRecentRunsLimit)
			if err != nil {
				return err
			}
			items := make([]overviewActivityItem, 0, len(runs))
			for _, run := range runs {
				updatedAt := run.createdAt
				if run.completedAt != nil {
					updatedAt = *run.completedAt
				}
				href := overviewAutomationHref(actor.organizationSlug, run.automationID)
				items = append(items, overviewActivityItem{
					ID:        run.id,
					Kind:      "automation",
					Title:     overviewResolvedTitle{Kind: "text", Text: run.automationName},
					Status:    run.status,
					Href:      &href,
					UpdatedAt: overviewISO(updatedAt),
					Attention: run.status == "failed",
				})
			}
			automationItems = items
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, 0, err
	}

	return map[string]any{
		"activity": rankOverviewActivity(append(jobItems, automationItems...)),
	}, http.StatusOK, nil
}

func (api *overviewAPI) listRecentJobActivity(ctx context.Context, actor overviewActor) ([]overviewActivityItem, error) {
	rows, err := api.pool.Query(ctx, `
        select j.id, j.kind, j.status, j.input_payload, j.updated_at, j.project_id, p.name,
               t.type, e.title, r.criteria, s.connector_kind, s.direction
        from jobs j
        left join translation_job_details t on t.job_id = j.id
        left join review_job_details r on r.job_id = j.id
        left join sync_job_details s on s.job_id = j.id
        left join external_job_details e on e.job_id = j.id
        left join projects p on p.id = j.project_id and p.organization_id = j.organization_id
        where `+overviewJobsVisibleSQL()+`
          and `+overviewSyncedJobVisibleSQL()+`
        order by j.updated_at desc
        limit $4`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, overviewRecentJobsLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type jobActivityRow struct {
		id, kind, status             string
		inputPayload                 []byte
		updatedAt                    time.Time
		projectID, projectName       *string
		jobType, externalTitle       *string
		reviewCriteria               *string
		syncConnector, syncDirection *string
	}
	rowsData := make([]jobActivityRow, 0, overviewRecentJobsLimit)
	for rows.Next() {
		var row jobActivityRow
		if err := rows.Scan(
			&row.id, &row.kind, &row.status, &row.inputPayload, &row.updatedAt, &row.projectID, &row.projectName,
			&row.jobType, &row.externalTitle, &row.reviewCriteria, &row.syncConnector, &row.syncDirection,
		); err != nil {
			return nil, err
		}
		rowsData = append(rowsData, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	titles := make([]overviewJobTitleInput, 0, len(rowsData))
	for _, row := range rowsData {
		titles = append(titles, overviewJobTitleInput{
			ID:                row.id,
			Kind:              row.kind,
			InputPayload:      row.inputPayload,
			ExternalTitle:     row.externalTitle,
			ReviewCriteria:    row.reviewCriteria,
			SyncConnectorKind: row.syncConnector,
			SyncDirection:     row.syncDirection,
		})
	}
	if err := api.enrichOverviewJobTitleInputs(ctx, actor.organizationID, titles); err != nil {
		return nil, err
	}

	items := make([]overviewActivityItem, 0, len(rowsData))
	for i, row := range rowsData {
		jobKind, resolvedType := overviewJobKindValue(row.kind, stringPointerValue(row.jobType))
		items = append(items, overviewActivityItem{
			ID:          row.id,
			Kind:        "job",
			Title:       resolveOverviewJobTitle(titles[i]),
			ProjectName: row.projectName,
			JobKind:     jobKind,
			JobType:     resolvedType,
			Status:      row.status,
			Href:        overviewJobHref(actor.organizationSlug, row.projectID, row.id),
			UpdatedAt:   overviewISO(row.updatedAt),
			Attention:   row.status == "failed",
		})
	}
	return items, nil
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
