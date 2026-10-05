package main

import (
	"net/http"
	"time"

	"golang.org/x/sync/errgroup"
)

func (api *overviewAPI) metricsHandler(r *http.Request, actor overviewActor) (any, int, error) {
	now := time.Now()
	since := overviewSince(now)
	includeAutomations := api.includeAutomations(r.Context(), actor)

	var (
		jobRows          []overviewDayCount
		translationRows  []overviewDayCount
		openIssues       int
		p1Issues         int
		automationTotal  int
		automationPaused int
	)

	g, ctx := errgroup.WithContext(r.Context())
	g.Go(func() error {
		rows, err := api.queryDayCounts(ctx, `
            select to_char(date_trunc('day', j.created_at at time zone 'utc'), 'YYYY-MM-DD'), count(*)::int
            from jobs j
            left join external_job_details e on e.job_id = j.id
            left join projects p on p.id = j.project_id and p.organization_id = j.organization_id
            where `+overviewJobsVisibleSQL()+`
              and j.created_at >= $4
              and `+overviewSyncedJobVisibleSQL()+`
            group by 1`,
			actor.organizationID, actor.canReadAllTeams(), actor.userID, since)
		if err != nil {
			return err
		}
		jobRows = rows
		return nil
	})
	g.Go(func() error {
		rows, err := api.queryDayCounts(ctx, `
            select to_char(date_trunc('day', pt.updated_at at time zone 'utc'), 'YYYY-MM-DD'), count(*)::int
            from project_translations pt
            join projects p on p.id = pt.project_id and p.organization_id = pt.organization_id
            where pt.organization_id = $1
              and `+formatQaProjectTeamAccessSQL(2, 3, 1)+`
              and pt.updated_at >= $4
            group by 1`,
			actor.organizationID, actor.canReadAllTeams(), actor.userID, since)
		if err != nil {
			return err
		}
		translationRows = rows
		return nil
	})
	g.Go(func() error {
		count, err := api.countOpenIssues(ctx, actor, "")
		if err != nil {
			return err
		}
		openIssues = count
		return nil
	})
	g.Go(func() error {
		count, err := api.countOpenIssues(ctx, actor, "P1")
		if err != nil {
			return err
		}
		p1Issues = count
		return nil
	})
	if includeAutomations {
		g.Go(func() error {
			total, paused, err := api.countAutomationStatuses(ctx, actor.organizationID)
			if err != nil {
				return err
			}
			automationTotal, automationPaused = total, paused
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, 0, err
	}

	jobSeries := fillOverviewDailySeries(jobRows, now)
	translationSeries := fillOverviewDailySeries(translationRows, now)

	var automations any
	if includeAutomations {
		automations = map[string]int{"total": automationTotal, "paused": automationPaused}
	}

	return map[string]any{
		"metrics": map[string]any{
			"jobs":         overviewMetricSeries{Count: sumOverviewSeries(jobSeries), Series: jobSeries},
			"translations": overviewMetricSeries{Count: sumOverviewSeries(translationSeries), Series: translationSeries},
			"automations":  automations,
			"issues":       map[string]int{"open": openIssues, "p1": p1Issues},
		},
	}, http.StatusOK, nil
}
