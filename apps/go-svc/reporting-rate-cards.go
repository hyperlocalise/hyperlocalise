package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
)

// Rate cards: named sets of rate lines, one per language pair and step. Lines are versioned rows
// in reporting_rates: saving a card adds a row for each line that changed and a retired row for
// each line taken off, so work recorded earlier keeps the rate it was recorded at.

type reportingRateLine struct {
	ID           string          `json:"id"`
	SourceLocale string          `json:"sourceLocale"`
	TargetLocale string          `json:"targetLocale"`
	Step         string          `json:"step"`
	Basis        string          `json:"basis"`
	Rate         string          `json:"rate"`
	Percentages  json.RawMessage `json:"percentages"`
}

type reportingRateCard struct {
	Name         string              `json:"name"`
	DefaultBasis string              `json:"defaultBasis"`
	Lines        []reportingRateLine `json:"lines"`
}

// reportingLiveRateRowsSQL is the newest row of every card, language pair and step, retired
// ones included, as a subquery over the workspace in the given parameter.
func reportingLiveRateRowsSQL(organizationParam string) string {
	return `select distinct on (name, source_locale, target_locale, step)
        id, name, source_locale, target_locale, step, basis, rate, percentages, retired, created_at
        from reporting_rates where organization_id = ` + organizationParam + `
        order by name, source_locale, target_locale, step, created_at desc, id desc`
}

// listReportingRateCards lists every rate card with its current lines, by name. Cards made
// before cards had their own record start with per-word lines.
func listReportingRateCards(ctx context.Context, db dictionaryDB, organizationID string) ([]reportingRateCard, error) {
	cards := map[string]*reportingRateCard{}
	rows, err := db.Query(ctx, `select name, default_basis from reporting_rate_cards where organization_id = $1`, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list rate cards: %w", err)
	}
	for rows.Next() {
		var card reportingRateCard
		if err := rows.Scan(&card.Name, &card.DefaultBasis); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan rate card: %w", err)
		}
		card.Lines = []reportingRateLine{}
		cards[card.Name] = &card
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list rate cards: %w", err)
	}
	lines, err := db.Query(ctx, `
        select id, name, source_locale, target_locale, step, basis, rate::text, percentages, retired
        from (`+reportingLiveRateRowsSQL("$1")+`) live
        order by name, source_locale, target_locale, step`, organizationID)
	if err != nil {
		return nil, fmt.Errorf("list rate lines: %w", err)
	}
	defer lines.Close()
	for lines.Next() {
		var line reportingRateLine
		var name string
		var retired bool
		if err := lines.Scan(&line.ID, &name, &line.SourceLocale, &line.TargetLocale, &line.Step, &line.Basis, &line.Rate, &line.Percentages, &retired); err != nil {
			return nil, fmt.Errorf("scan rate line: %w", err)
		}
		if retired {
			continue
		}
		card, ok := cards[name]
		if !ok {
			card = &reportingRateCard{Name: name, DefaultBasis: "word", Lines: []reportingRateLine{}}
			cards[name] = card
		}
		card.Lines = append(card.Lines, line)
	}
	if err := lines.Err(); err != nil {
		return nil, fmt.Errorf("list rate lines: %w", err)
	}
	result := make([]reportingRateCard, 0, len(cards))
	for _, card := range cards {
		result = append(result, *card)
	}
	sort.SliceStable(result, func(i, j int) bool { return compareReportingNames(result[i].Name, result[j].Name) < 0 })
	return result, nil
}

func (api *reportingAPI) rateCards(r *http.Request, actor reportingActor) (any, int, error) {
	ctx := r.Context()
	var cards []reportingRateCard
	err := api.read(ctx, func(db dictionaryDB) error {
		var err error
		cards, err = listReportingRateCards(ctx, db, actor.organizationID)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"rateCards": cards, "canManage": actor.can("billing:write")}, http.StatusOK, nil
}
