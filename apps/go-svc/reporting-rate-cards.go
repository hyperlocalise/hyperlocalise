package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"

	"github.com/jackc/pgx/v5"
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

// reportingLineKey names a line by its language pair and step.
func reportingLineKey(sourceLocale, targetLocale, step string) string {
	return sourceLocale + "\x00" + targetLocale + "\x00" + step
}

type reportingRateLineInput struct {
	SourceLocale string          `json:"sourceLocale"`
	TargetLocale string          `json:"targetLocale"`
	Step         string          `json:"step"`
	Basis        string          `json:"basis"`
	Rate         string          `json:"rate"`
	Percentages  map[string]int  `json:"percentages"`
	percentages  json.RawMessage // as given, for the rows
}

// reportingSamePercentages compares percentages by value: a band left out is paid at 100%.
func reportingSamePercentages(left json.RawMessage, right map[string]int) bool {
	var stored map[string]int
	_ = json.Unmarshal(left, &stored)
	for _, bucket := range reportingMatchBucket {
		l, r := 100, 100
		if v, ok := stored[bucket]; ok {
			l = v
		}
		if v, ok := right[bucket]; ok {
			r = v
		}
		if l != r {
			return false
		}
	}
	return true
}

// reportingLockRateCard holds a card's save lock until the transaction ends, so its lines cannot
// change meanwhile. The key is the web app's, byte for byte.
func reportingLockRateCard(ctx context.Context, tx dictionaryDB, organizationID, name string) error {
	_, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext($1))`, "reporting-rate-card:"+organizationID+":"+name)
	return err
}

// reportingRateCardExists is true when a card of this name has a record or any rate line.
func reportingRateCardExists(ctx context.Context, db dictionaryDB, organizationID, name string) (bool, error) {
	var found bool
	err := db.QueryRow(ctx, `
        select exists(select 1 from reporting_rate_cards where organization_id = $1 and name = $2)
            or exists(select 1 from reporting_rates where organization_id = $1 and name = $2)`, organizationID, name).Scan(&found)
	return found, err
}

type reportingLiveRateRow struct {
	reportingRateLine
	retired bool
}

// reportingLiveRateLines are a card's newest rows per language pair and step, in order.
func reportingLiveRateLines(ctx context.Context, db dictionaryDB, organizationID, name string) ([]reportingLiveRateRow, error) {
	rows, err := db.Query(ctx, `
        select id, source_locale, target_locale, step, basis, rate::text, percentages, retired
        from (`+reportingLiveRateRowsSQL("$1")+`) live where name = $2
        order by name, source_locale, target_locale, step`, organizationID, name)
	if err != nil {
		return nil, fmt.Errorf("read rate lines: %w", err)
	}
	defer rows.Close()
	var lines []reportingLiveRateRow
	for rows.Next() {
		var line reportingLiveRateRow
		if err := rows.Scan(&line.ID, &line.SourceLocale, &line.TargetLocale, &line.Step, &line.Basis, &line.Rate, &line.Percentages, &line.retired); err != nil {
			return nil, fmt.Errorf("scan rate line: %w", err)
		}
		lines = append(lines, line)
	}
	return lines, rows.Err()
}

// saveRateCard saves a card's default basis and its whole set of lines. create makes a new card
// and fails if the name is taken; otherwise the card must exist. Only changed lines get a new
// row, and removed lines a retired row, so work already recorded keeps its rate.
func (api *reportingAPI) saveRateCard(r *http.Request, actor reportingActor) (any, int, error) {
	body, err := readReportingBody(r, "invalid_rate_card")
	if err != nil {
		return nil, 0, err
	}
	name := body.trimmedText("name", 1, 100)
	defaultBasis := "word"
	if _, given := body.field("defaultBasis"); given {
		defaultBasis = body.choice("defaultBasis", reportingRateBases...)
	}
	create := body.boolean("create", false)
	var lines []reportingRateLineInput
	seen := map[string]bool{}
	var duplicate *reportingRateLineInput
	for _, item := range body.objects("lines", 1000) {
		line := reportingRateLineInput{
			SourceLocale: item.text("sourceLocale", 2, 35),
			TargetLocale: item.text("targetLocale", 2, 35),
			Step:         item.step("step"),
			Basis:        item.choice("basis", reportingRateBases...),
			Rate:         item.usd("rate"),
			Percentages:  item.percentages("percentages"),
		}
		if raw, ok := item.field("percentages"); ok {
			line.percentages = raw
		} else {
			line.percentages = json.RawMessage("{}")
		}
		if !item.valid {
			body.fail()
		}
		key := reportingLineKey(line.SourceLocale, line.TargetLocale, line.Step)
		if seen[key] && duplicate == nil {
			copy := line
			duplicate = &copy
		}
		seen[key] = true
		lines = append(lines, line)
	}
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_rate_card")
	}
	if duplicate != nil {
		return nil, 0, reportingFailure(400, "duplicate_rate_line", "Each language pair and step can have one rate on a card.")
	}
	ctx := r.Context()
	var saved reportingRateCard
	err = api.write(ctx, func(tx pgx.Tx) error {
		// Two saves of one card would each add rows for the other's lines.
		if err := reportingLockRateCard(ctx, tx, actor.organizationID, name); err != nil {
			return err
		}
		exists, err := reportingRateCardExists(ctx, tx, actor.organizationID, name)
		if err != nil {
			return err
		}
		if create && exists {
			return reportingFailure(409, "rate_card_exists", "A rate card with this name exists.")
		}
		if !create && !exists {
			return reportingFailure(404, "rate_card_not_found", "Resource not found")
		}
		live, err := reportingLiveRateLines(ctx, tx, actor.organizationID, name)
		if err != nil {
			return err
		}
		var before []reportingLiveRateRow
		current := map[string]reportingLiveRateRow{}
		for _, row := range live {
			if row.retired {
				continue
			}
			before = append(before, row)
			current[reportingLineKey(row.SourceLocale, row.TargetLocale, row.Step)] = row
		}
		var previousBasis *string
		if err := tx.QueryRow(ctx, `select default_basis from reporting_rate_cards where organization_id = $1 and name = $2`, actor.organizationID, name).Scan(&previousBasis); err != nil && !isNoRows(err) {
			return fmt.Errorf("read rate card: %w", err)
		}
		var cardID string
		if err := tx.QueryRow(ctx, `
            insert into reporting_rate_cards (organization_id, name, default_basis) values ($1, $2, $3)
            on conflict (organization_id, name) do update set default_basis = excluded.default_basis
            returning id`, actor.organizationID, name, defaultBasis).Scan(&cardID); err != nil {
			return fmt.Errorf("save rate card: %w", err)
		}
		type newRow struct {
			sourceLocale, targetLocale, step, basis, rate string
			percentages                                   json.RawMessage
			retired                                       bool
		}
		var rows []newRow
		for _, line := range lines {
			row, ok := current[reportingLineKey(line.SourceLocale, line.TargetLocale, line.Step)]
			changed := !ok || row.Basis != line.Basis || !reportingSamePercentages(row.Percentages, line.Percentages)
			if !changed {
				stored, err := usdUnits(row.Rate)
				if err != nil {
					return err
				}
				given, err := usdUnits(line.Rate)
				if err != nil {
					return err
				}
				changed = stored.Cmp(given) != 0
			}
			if changed {
				rows = append(rows, newRow{line.SourceLocale, line.TargetLocale, line.Step, line.Basis, line.Rate, line.percentages, false})
			}
		}
		for _, row := range before {
			if !seen[reportingLineKey(row.SourceLocale, row.TargetLocale, row.Step)] {
				rows = append(rows, newRow{row.SourceLocale, row.TargetLocale, row.Step, row.Basis, row.Rate, row.Percentages, true})
			}
		}
		for _, row := range rows {
			// After the lock, so a save that waited for another is always the newer version.
			if _, err := tx.Exec(ctx, `
                insert into reporting_rates (organization_id, name, source_locale, target_locale, step, basis, rate, percentages, retired, created_at)
                values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::jsonb, $9, clock_timestamp())`,
				actor.organizationID, name, row.sourceLocale, row.targetLocale, row.step, row.basis, row.rate, string(row.percentages), row.retired); err != nil {
				return fmt.Errorf("save rate line: %w", err)
			}
		}
		action := "rate_card_saved"
		if create {
			action = "rate_card_created"
		}
		var auditBefore any
		if exists {
			basis := "word"
			if previousBasis != nil {
				basis = *previousBasis
			}
			beforeLines := []reportingRateLine{}
			for _, row := range before {
				beforeLines = append(beforeLines, row.reportingRateLine)
			}
			auditBefore = map[string]any{"defaultBasis": basis, "lines": beforeLines}
		}
		afterLines := []map[string]any{}
		for _, line := range lines {
			afterLines = append(afterLines, map[string]any{
				"sourceLocale": line.SourceLocale, "targetLocale": line.TargetLocale, "step": line.Step,
				"basis": line.Basis, "rate": line.Rate, "percentages": line.Percentages,
			})
		}
		if err := reportingAudit(ctx, tx, actor, cardID, action, auditBefore, map[string]any{"defaultBasis": defaultBasis, "lines": afterLines}); err != nil {
			return err
		}
		after, err := reportingLiveRateLines(ctx, tx, actor.organizationID, name)
		if err != nil {
			return err
		}
		saved = reportingRateCard{Name: name, DefaultBasis: defaultBasis, Lines: []reportingRateLine{}}
		for _, row := range after {
			if !row.retired {
				saved.Lines = append(saved.Lines, row.reportingRateLine)
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"rateCard": saved}, http.StatusOK, nil
}

// reportingAudit records who changed what, with the row before and after as the web app
// records them.
func reportingAudit(ctx context.Context, tx dictionaryDB, actor reportingActor, resourceID, action string, before, after any) error {
	encode := func(value any) (*string, error) {
		if value == nil {
			return nil, nil
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		text := string(encoded)
		return &text, nil
	}
	beforeJSON, err := encode(before)
	if err != nil {
		return err
	}
	afterJSON, err := encode(after)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `insert into reporting_audit (organization_id, actor_id, resource_id, action, before, after) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
		actor.organizationID, actor.userID, resourceID, action, beforeJSON, afterJSON); err != nil {
		return fmt.Errorf("write reporting audit: %w", err)
	}
	return nil
}
