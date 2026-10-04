package main

import (
	"net/http"
	"time"
)

func (api *overviewAPI) boardHandler(r *http.Request, actor overviewActor) (any, int, error) {
	rows, err := api.pool.Query(r.Context(), `
        select i.id, i.identifier, i.title, p.name, i.target_locale,
               priority_values.value #>> '{}', i.updated_at
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        `+orgIssuePriorityJoinSQL+`
        where i.organization_id = $1
          and `+formatQaProjectTeamAccessSQL(2, 3, 1)+`
          and i.status in ('open', 'in_progress')
        order by case
            when i.status = 'open' then 0
            when i.status = 'in_progress' then 1
            else 2
        end, i.updated_at desc, i.id
        limit $4`,
		actor.organizationID, actor.canReadAllTeams(), actor.userID, overviewBoardLimit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	board := make([]overviewBoardItem, 0, overviewBoardLimit)
	for rows.Next() {
		var (
			id, identifier, title, projectName string
			locale, priority                   *string
			updatedAt                          time.Time
		)
		if err := rows.Scan(&id, &identifier, &title, &projectName, &locale, &priority, &updatedAt); err != nil {
			return nil, 0, err
		}
		board = append(board, overviewBoardItem{
			ID:          id,
			Identifier:  identifier,
			Title:       title,
			ProjectName: projectName,
			Locale:      locale,
			Priority:    priority,
			UpdatedAt:   overviewISO(updatedAt),
			Href:        overviewIssueHref(actor.organizationSlug, identifier),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"board": board}, http.StatusOK, nil
}
