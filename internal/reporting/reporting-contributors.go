package reporting

import (
	"context"
	"fmt"
	"math/big"
	"net/http"
	"slices"
	"sort"
	"strings"
)

// Contributors: each person's finished work in a period, by memory match band and by post-edit
// band, with the time they logged and, for the roles that see what work costs, what their work
// cost. Words come from reporting_daily_by_person; time and money are read from the raw rows, as
// the Time and Costs tabs read them.

// reportingPostEditBuckets are the bands a person's edit of the text they were given falls in,
// strongest first; "" is work with no given text to compare (written from scratch, or unknown).
var reportingPostEditBuckets = []string{"100", "95-99", "85-94", "75-84", "50-74", "new", ""}

type reportingContributorRow struct {
	UserID string `json:"userId"`
	// Null for a member since removed from the workspace's users.
	Person    *string            `json:"person"`
	Finished  float64            `json:"finished"`
	Unchanged float64            `json:"unchanged"`
	Bands     map[string]float64 `json:"bands"`
	// By post-edit band; the "" key is work with no given text to compare.
	PostEditBands map[string]float64 `json:"postEditBands"`
	Languages     []string           `json:"languages"`
	Minutes       float64            `json:"minutes"`
	// Null for roles that cannot see what work costs.
	SpentUSD *string `json:"spentUsd"`
	// Finished strings no rate priced, so not in SpentUSD.
	Unpriced int `json:"unpriced"`
}

type reportingContributorTotals struct {
	Finished      float64            `json:"finished"`
	Unchanged     float64            `json:"unchanged"`
	Bands         map[string]float64 `json:"bands"`
	PostEditBands map[string]float64 `json:"postEditBands"`
	Minutes       float64            `json:"minutes"`
	People        int                `json:"people"`
	SpentUSD      *string            `json:"spentUsd"`
	Unpriced      int                `json:"unpriced"`
}

type reportingContributors struct {
	Period reportingPeriod `json:"period"`
	Unit   string          `json:"unit"`
	// "" when both steps are counted.
	Step string `json:"step"`
	// Whether the answer holds every member's work and money, or only the viewer's own work.
	Financial bool                       `json:"financial"`
	Rows      []reportingContributorRow  `json:"rows"`
	Totals    reportingContributorTotals `json:"totals"`
}

type reportingContributorInput struct {
	scope     reportingScope
	period    reportingPeriod
	unit      string
	step      string
	financial bool
	// Narrows every figure to one person: a viewer who may not see others' work.
	contributorID string
}

// queryReportingContributors reads each person's finished units, logged minutes and (when
// financial) spending in a period, most finished first.
func queryReportingContributors(ctx context.Context, db DB, in reportingContributorInput) (reportingContributors, error) {
	result := reportingContributors{
		Period: in.period, Unit: in.unit, Step: in.step, Financial: in.financial,
		Rows: []reportingContributorRow{},
		Totals: reportingContributorTotals{
			Bands: map[string]float64{}, PostEditBands: map[string]float64{},
		},
	}
	projectIDs := in.scope.scopedProjectIDs()
	if len(projectIDs) == 0 {
		return result, nil
	}
	rows := map[string]*reportingContributorRow{}
	spent := map[string]*big.Int{}
	row := func(userID string) *reportingContributorRow {
		r, ok := rows[userID]
		if !ok {
			r = &reportingContributorRow{UserID: userID, Bands: map[string]float64{}, PostEditBands: map[string]float64{}, Languages: []string{}}
			rows[userID] = r
		}
		return r
	}
	if err := readReportingContributorWords(ctx, db, in, projectIDs, row); err != nil {
		return result, err
	}
	if err := readReportingContributorMinutes(ctx, db, in, projectIDs, row); err != nil {
		return result, err
	}
	if in.financial {
		if err := readReportingContributorSpending(ctx, db, in, projectIDs, row, spent); err != nil {
			return result, err
		}
	}
	if len(rows) == 0 {
		if in.financial {
			zero := usdString(new(big.Int))
			result.Totals.SpentUSD = &zero
		}
		return result, nil
	}
	ids := make([]string, 0, len(rows))
	for id := range rows {
		ids = append(ids, id)
	}
	names, err := readReportingPeople(ctx, db, ids)
	if err != nil {
		return result, err
	}
	total := new(big.Int)
	for id, r := range rows {
		if name, ok := names[id]; ok {
			r.Person = &name
		}
		if in.financial {
			amount := spent[id]
			if amount == nil {
				amount = new(big.Int)
			}
			total.Add(total, amount)
			r.SpentUSD = usdPointer(amount)
		}
		sort.Strings(r.Languages)
		result.Totals.Finished += r.Finished
		result.Totals.Unchanged += r.Unchanged
		result.Totals.Minutes += r.Minutes
		result.Totals.Unpriced += r.Unpriced
		for band, value := range r.Bands {
			result.Totals.Bands[band] += value
		}
		for band, value := range r.PostEditBands {
			result.Totals.PostEditBands[band] += value
		}
		result.Rows = append(result.Rows, *r)
	}
	result.Totals.People = len(result.Rows)
	if in.financial {
		result.Totals.SpentUSD = usdPointer(total)
	}
	sort.SliceStable(result.Rows, func(i, j int) bool {
		left, right := result.Rows[i], result.Rows[j]
		if left.Finished != right.Finished {
			return left.Finished > right.Finished
		}
		if left.Minutes != right.Minutes {
			return left.Minutes > right.Minutes
		}
		if byName := compareReportingNames(reportingOptional(left.Person), reportingOptional(right.Person)); byName != 0 {
			return byName < 0
		}
		return left.UserID < right.UserID
	})
	return result, nil
}

// reportingContributorScopeSQL narrows rows (alias a) to the scope's projects, task and language.
func reportingContributorScopeSQL(args *reportingArgs, in reportingContributorInput, projectIDs []string, alias string) string {
	where := fmt.Sprintf("%[1]s.organization_id = %[2]s and %[1]s.project_id = any(%[3]s::text[])", alias, args.add(in.scope.organizationID), args.add(projectIDs))
	if len(in.scope.jobIDs) > 0 {
		where += fmt.Sprintf(" and %s.job_id = any(%s::text[])", alias, args.add(in.scope.jobIDs))
	}
	if in.scope.targetLocale != "" {
		where += fmt.Sprintf(" and %s.target_locale = %s", alias, args.add(in.scope.targetLocale))
	}
	if in.step != "" {
		where += fmt.Sprintf(" and %s.step = %s", alias, args.add(in.step))
	}
	return where
}

func readReportingContributorWords(ctx context.Context, db DB, in reportingContributorInput, projectIDs []string, row func(string) *reportingContributorRow) error {
	var args reportingArgs
	where := reportingContributorScopeSQL(&args, in, projectIDs, "s")
	where += fmt.Sprintf(" and s.day between %s and %s", args.add(in.period.From), args.add(in.period.To))
	if in.contributorID != "" {
		where += " and s.actor_user_id = " + args.add(in.contributorID)
	}
	// The unit is one of reportingUnitOptions, checked by the query parser.
	rows, err := db.Query(ctx, fmt.Sprintf(`
        select s.actor_user_id::text, s.target_locale, s.bucket, s.post_edit_bucket,
            sum(s.finished_%[1]s)::float8, sum(s.finished_unchanged_%[1]s)::float8
        from reporting_daily_by_person s where %[2]s
        group by 1, 2, 3, 4`, in.unit, where), args...)
	if err != nil {
		return fmt.Errorf("read contributor words: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var userID, targetLocale, bucket, postEditBucket string
		var finished, unchanged float64
		if err := rows.Scan(&userID, &targetLocale, &bucket, &postEditBucket, &finished, &unchanged); err != nil {
			return fmt.Errorf("scan contributor words: %w", err)
		}
		if finished == 0 && unchanged == 0 {
			continue
		}
		r := row(userID)
		r.Finished += finished
		r.Unchanged += unchanged
		r.Bands[bucket] += finished
		r.PostEditBands[postEditBucket] += finished
		if !slices.Contains(r.Languages, targetLocale) {
			r.Languages = append(r.Languages, targetLocale)
		}
	}
	return rows.Err()
}

func readReportingContributorMinutes(ctx context.Context, db DB, in reportingContributorInput, projectIDs []string, row func(string) *reportingContributorRow) error {
	var args reportingArgs
	where := reportingContributorScopeSQL(&args, in, projectIDs, "e")
	where += fmt.Sprintf(" and not e.voided and e.work_date >= %s and e.work_date < %s", reportingDayStart(args.add(in.period.From)), reportingDayEnd(args.add(in.period.To)))
	if in.contributorID != "" {
		where += " and e.contributor_id = " + args.add(in.contributorID)
	}
	rows, err := db.Query(ctx, `
        select e.contributor_id::text, e.target_locale, sum(e.minutes)::float8
        from reporting_time_entries e where `+where+` group by 1, 2`, args...)
	if err != nil {
		return fmt.Errorf("read contributor time: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var userID, targetLocale string
		var minutes float64
		if err := rows.Scan(&userID, &targetLocale, &minutes); err != nil {
			return fmt.Errorf("scan contributor time: %w", err)
		}
		r := row(userID)
		r.Minutes += minutes
		if targetLocale != "" && !slices.Contains(r.Languages, targetLocale) {
			r.Languages = append(r.Languages, targetLocale)
		}
	}
	return rows.Err()
}

// readReportingContributorSpending sums people's costs by person: a finished string's cost
// belongs to whoever finished it (its completion, `human:<analysis>:<step>` against
// `completion:<analysis>:<step>`), an hourly cost to whoever logged the time. Fixed fees belong
// to a task, not a person, and are left out.
func readReportingContributorSpending(ctx context.Context, db DB, in reportingContributorInput, projectIDs []string, row func(string) *reportingContributorRow, spent map[string]*big.Int) error {
	var args reportingArgs
	where := reportingContributorScopeSQL(&args, in, projectIDs, "c")
	where += fmt.Sprintf(" and not c.voided and c.kind = 'human' and c.created_at >= %s and c.created_at < %s", reportingDayStart(args.add(in.period.From)), reportingDayEnd(args.add(in.period.To)))
	person := "coalesce(d.actor_user_id, e.contributor_id)"
	having := ""
	if in.contributorID != "" {
		having = " and " + person + " = " + args.add(in.contributorID)
	}
	rows, err := db.Query(ctx, `
        select `+person+`::text as person, round(coalesce(sum(c.amount_usd), 0), 8)::text,
            count(*) filter (where c.amount_usd is null and c.time_entry_id is null)::integer
        from reporting_costs c
        left join reporting_activity d on d.organization_id = c.organization_id
            and c.operation_key like 'human:%'
            and d.operation_key = 'completion:' || substr(c.operation_key, 7)
        left join reporting_time_entries e on e.id = c.time_entry_id
        where `+where+` and `+person+` is not null`+having+`
        group by 1`, args...)
	if err != nil {
		return fmt.Errorf("read contributor spending: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var userID, amount string
		var unpriced int
		if err := rows.Scan(&userID, &amount, &unpriced); err != nil {
			return fmt.Errorf("scan contributor spending: %w", err)
		}
		units, err := usdUnits(amount)
		if err != nil {
			return err
		}
		r := row(userID)
		r.Unpriced += unpriced
		if spent[userID] == nil {
			spent[userID] = new(big.Int)
		}
		spent[userID].Add(spent[userID], units)
	}
	return rows.Err()
}

// readReportingPeople names members by their name, else their email, as the task report does.
func readReportingPeople(ctx context.Context, db DB, userIDs []string) (map[string]string, error) {
	rows, err := db.Query(ctx, `
        select u.id::text, coalesce(nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.email)
        from users u where u.id = any($1::uuid[])`, userIDs)
	if err != nil {
		return nil, fmt.Errorf("read contributor names: %w", err)
	}
	defer rows.Close()
	names := map[string]string{}
	for rows.Next() {
		var id string
		var name *string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, fmt.Errorf("scan contributor name: %w", err)
		}
		if name != nil {
			names[id] = *name
		}
	}
	return names, rows.Err()
}

// contributors is the Contributors tab. Roles that cannot see what work costs see only their own
// row, without money.
func (api *API) Contributors(r *http.Request, actor Actor) (any, int, error) {
	q := readReportingQuery(r)
	from, to := q.dates()
	projectID, jobID, targetLocale := q.scope()
	unit := q.unit()
	step := q.choice("step", "", reportingStepOptions...)
	format := q.format()
	if err := q.err(); err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var contributors reportingContributors
	err := api.read(ctx, func(db DB) error {
		view, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		in := reportingContributorInput{
			scope:     view.scope(projectID, jobID, targetLocale),
			period:    view.period(from, to),
			unit:      unit,
			step:      step,
			financial: view.financial,
		}
		if !view.financial {
			in.contributorID = view.userID
		}
		contributors, err = queryReportingContributors(ctx, db, in)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if format == "csv" {
		return reportingContributorsCSV(contributors), http.StatusOK, nil
	}
	return map[string]any{"contributors": contributors}, http.StatusOK, nil
}

// reportingContributorsCSV is one row per person, with the bands that have units.
func reportingContributorsCSV(contributors reportingContributors) reportingCSV {
	return reportingCSV{filename: "contributors.csv", write: func(w *reportingCSVWriter) error {
		var bands, postEditBands []string
		for _, bucket := range reportingMatchBucket {
			if contributors.Totals.Bands[bucket] > 0 {
				bands = append(bands, bucket)
			}
		}
		for _, bucket := range reportingPostEditBuckets {
			if contributors.Totals.PostEditBands[bucket] > 0 {
				postEditBands = append(postEditBands, bucket)
			}
		}
		header := []string{"Person", "Languages", "Finished (" + contributors.Unit + ")", "Unchanged (" + contributors.Unit + ")"}
		for _, band := range bands {
			header = append(header, "Match "+band)
		}
		for _, band := range postEditBands {
			label := "Post-edit " + band
			if band == "" {
				label = "Post-edit none"
			}
			header = append(header, label)
		}
		header = append(header, "Minutes logged")
		if contributors.Financial {
			header = append(header, "Spent (USD)", "Unpriced strings")
		}
		if err := w.row(header...); err != nil {
			return err
		}
		for _, row := range contributors.Rows {
			person := "Removed member"
			if row.Person != nil {
				person = *row.Person
			}
			cells := []string{person, strings.Join(row.Languages, " "), reportingNumber(row.Finished), reportingNumber(row.Unchanged)}
			for _, band := range bands {
				cells = append(cells, reportingNumber(row.Bands[band]))
			}
			for _, band := range postEditBands {
				cells = append(cells, reportingNumber(row.PostEditBands[band]))
			}
			cells = append(cells, reportingNumber(row.Minutes))
			if contributors.Financial {
				cells = append(cells, reportingOptional(row.SpentUSD), fmt.Sprint(row.Unpriced))
			}
			if err := w.row(cells...); err != nil {
				return err
			}
		}
		return nil
	}}
}
