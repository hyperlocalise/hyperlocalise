package main

import "net/http"

func (api *overviewAPI) automationsHandler(r *http.Request, actor overviewActor) (any, int, error) {
	if !api.includeAutomations(r.Context(), actor) {
		return map[string]any{"automations": []overviewAutomationItem{}}, http.StatusOK, nil
	}

	runs, err := api.listRecentAutomationRuns(r.Context(), actor.organizationID, overviewAutomationLimit)
	if err != nil {
		return nil, 0, err
	}
	items := make([]overviewAutomationItem, 0, len(runs))
	for _, run := range runs {
		updatedAt := run.createdAt
		if run.completedAt != nil {
			updatedAt = *run.completedAt
		}
		items = append(items, overviewAutomationItem{
			ID:            run.id,
			AutomationID:  run.automationID,
			Name:          run.automationName,
			TriggerSource: run.triggerSource,
			Status:        run.status,
			UpdatedAt:     overviewISO(updatedAt),
			Href:          overviewAutomationHref(actor.organizationSlug, run.automationID),
		})
	}
	return map[string]any{"automations": items}, http.StatusOK, nil
}
