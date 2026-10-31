package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

// The task picker: tasks that have Reports data, newest first.

type reportingTaskOption struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	ProjectID *string `json:"projectId"`
	Status    string  `json:"status"`
	// As the database writes it, which is how the web route answers.
	CreatedAt string `json:"createdAt"`
}

type reportingTaskSearch struct {
	projectID, q string
	open         bool
	ids          []string
	limit        int
	// Whether to offer only tasks Reports has counted (a search), or any task the viewer can
	// see (logging time on a task not analysed yet).
	counted bool
}

func parseReportingTaskSearch(r *http.Request) (reportingTaskSearch, error) {
	q := readReportingQuery(r)
	search := reportingTaskSearch{
		projectID: q.id("projectId"),
		q:         q.trimmed("q", 200),
		open:      q.flag("open", false),
		ids:       q.idList("ids"),
		limit:     q.number("limit", 1, 200, 50),
		counted:   q.flag("counted", true),
	}
	return search, q.err()
}

func (api *reportingAPI) tasks(r *http.Request, actor reportingActor) (any, int, error) {
	search, err := parseReportingTaskSearch(r)
	if err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	tasks := []reportingTaskOption{}
	err = api.read(ctx, func(db dictionaryDB) error {
		projectIDs, err := reportingProjectIDs(ctx, db, actor)
		if err != nil {
			return err
		}
		tasks, err = listReportingTasks(ctx, db, actor.organizationID, projectIDs, search)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"jobs": tasks}, http.StatusOK, nil
}

// reportingTaskTitleSQL is the title of a task, falling back to its id.
func reportingTaskTitleSQL(alias string) string {
	return "coalesce(" + alias + ".input_payload -> 'metadata' ->> 'title', " + alias + ".id)"
}

// listReportingTasks lists tasks with Reports data, newest first: optionally only open ones,
// those whose title or id contains the search, or the given ids. A failed task is offered only
// when asked for by id: it has no work to estimate or to log time on.
func listReportingTasks(ctx context.Context, db dictionaryDB, organizationID string, projectIDs []string, search reportingTaskSearch) ([]reportingTaskOption, error) {
	tasks := []reportingTaskOption{}
	if len(projectIDs) == 0 {
		return tasks, nil
	}
	var args reportingArgs
	title := reportingTaskTitleSQL("j")
	where := fmt.Sprintf("j.organization_id = %s and j.project_id = any(%s::text[])", args.add(organizationID), args.add(projectIDs))
	if search.projectID != "" {
		where += " and j.project_id = " + args.add(search.projectID)
	}
	if search.open {
		where += " and j.status in ('queued', 'running', 'waiting_for_review')"
	}
	if len(search.ids) == 0 {
		where += " and j.status <> 'failed'"
	}
	if search.q != "" {
		// Wildcards in the search are matched as themselves.
		pattern := args.add("%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(search.q) + "%")
		where += fmt.Sprintf(" and (%s ilike %s or j.id ilike %s)", title, pattern, pattern)
	}
	if len(search.ids) > 0 {
		where += " and j.id = any(" + args.add(search.ids) + "::text[])"
	} else if search.counted {
		// Tasks chosen elsewhere (AI usage lists tasks from billing's records) are named even
		// with nothing counted; a search offers only tasks Reports has counted.
		where += ` and exists (
            select 1 from reporting_analyses a
            where a.organization_id = j.organization_id and a.job_id = j.id)`
	}
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select j.id, %s as title, j.project_id, j.status, j.created_at::text
        from jobs j where %s
        order by j.created_at desc
        limit %s`, title, where, args.add(search.limit)), args...)
	if err != nil {
		return nil, fmt.Errorf("list reporting tasks: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var task reportingTaskOption
		if err := rows.Scan(&task.ID, &task.Title, &task.ProjectID, &task.Status, &task.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan reporting task: %w", err)
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}
