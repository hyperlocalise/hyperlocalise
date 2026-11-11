package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
)

// The Activity tab: headline totals for the period and the one before, the chart of finished
// units by where the text came from, and finished units by language, all from the daily summary.

type reportingActivityQuery struct {
	from, to                       string
	projectID, jobID, targetLocale string
	unit, step, format             string
}

func parseReportingActivityQuery(r *http.Request) (reportingActivityQuery, error) {
	q := readReportingQuery(r)
	var query reportingActivityQuery
	query.from, query.to = q.dates()
	query.projectID, query.jobID, query.targetLocale = q.scope()
	query.unit = q.unit()
	query.step = q.step("translation")
	query.format = q.format()
	return query, q.err()
}

// reportingSourceUnits are units by where the finished text came from.
type reportingSourceUnits struct {
	Memory  float64 `json:"memory"`
	AI      float64 `json:"ai"`
	Person  float64 `json:"person"`
	Import  float64 `json:"import"`
	Unknown float64 `json:"unknown"`
}

type reportingActivityTotals struct {
	// Source units that arrived, each text counted once however many languages it goes into;
	// under a language filter, the units that arrived in that language.
	Source float64 `json:"source"`
	// Units that arrived to translate: the current version of each string, per language.
	Arrived float64 `json:"arrived"`
	// The part of arrived finished since.
	ArrivedDone float64 `json:"arrivedDone"`
	// The part of arrived not finished and held by no open task: work that will not happen.
	Abandoned float64 `json:"abandoned"`
	Finished  float64 `json:"finished"`
	Reviewed  float64 `json:"reviewed"`
	// Strings that arrived whose units could not be counted.
	Uncounted float64 `json:"uncounted"`
	// The part of finished at the chart's step a person did, and of that, where the person kept
	// the text they were given.
	FinishedByPerson  float64              `json:"finishedByPerson"`
	FinishedUnchanged float64              `json:"finishedUnchanged"`
	FinishedBySource  reportingSourceUnits `json:"finishedBySource"`
}

type reportingSeriesPoint struct {
	Start string `json:"start"`
	reportingSourceUnits
}

type reportingLanguageUnits struct {
	TargetLocale string  `json:"targetLocale"`
	Units        float64 `json:"units"`
}

type reportingActivity struct {
	Period     reportingPeriod          `json:"period"`
	Unit       string                   `json:"unit"`
	Step       string                   `json:"step"`
	Current    reportingActivityTotals  `json:"current"`
	Previous   reportingActivityTotals  `json:"previous"`
	Series     []reportingSeriesPoint   `json:"series"`
	ByLanguage []reportingLanguageUnits `json:"byLanguage"`
}

func (api *reportingAPI) activity(r *http.Request, actor reportingActor) (any, int, error) {
	query, err := parseReportingActivityQuery(r)
	if err != nil {
		return nil, 0, err
	}
	ctx := r.Context()
	var activity reportingActivity
	err = api.read(ctx, func(db dictionaryDB) error {
		context, err := api.context(ctx, db, actor)
		if err != nil {
			return err
		}
		activity, err = readReportingActivity(ctx, db, context, query)
		return err
	})
	if err != nil {
		return nil, 0, err
	}
	if query.format == "csv" {
		return reportingActivityCSV(activity), http.StatusOK, nil
	}
	return map[string]any{"activity": activity}, http.StatusOK, nil
}

func readReportingActivity(ctx context.Context, db dictionaryDB, context reportingContext, query reportingActivityQuery) (reportingActivity, error) {
	scope := context.scope(query.projectID, query.jobID, query.targetLocale)
	period := context.period(query.from, query.to)
	activity := reportingActivity{Period: period, Unit: query.unit, Step: query.step}
	var err error
	// The headline totals cover both steps; the charts show the chosen one.
	if activity.Current, activity.Previous, err = queryReportingActivity(ctx, db, scope, period, query.unit, query.step); err != nil {
		return activity, err
	}
	if activity.Series, err = queryReportingFinishedSeries(ctx, db, scope, period, query.unit, query.step); err != nil {
		return activity, err
	}
	activity.ByLanguage, err = queryReportingFinishedByLanguage(ctx, db, scope, period, query.unit, query.step)
	return activity, err
}

// reportingMeasure is a summary column such as s.arrived_words. Both parts go into SQL as they
// are, so the unit must be one of the fixed list, as the query parser guarantees.
func reportingMeasure(name, unit string) string {
	if !slices.Contains(reportingUnitOptions, unit) {
		panic("reporting unit not validated: " + unit)
	}
	return "s." + name + "_" + unit
}

// queryReportingActivity reads the totals for a period and the period before it in one scan.
// The cards are about translation, apart from what was reviewed; what people finished, and kept
// as given, follows the chart's step.
func queryReportingActivity(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, unit, step string) (current, previous reportingActivityTotals, err error) {
	var args reportingArgs
	rows, ok := scope.summaryRows(&args, false)
	if !ok {
		return current, previous, nil
	}
	chartStep := args.add(step)
	from, previousTo := args.add(period.From), args.add(period.PreviousTo)
	totals := func(inPeriod string) string {
		translation := "s.step = 'translation' and " + inPeriod
		shown := "s.step = " + chartStep + " and " + inPeriod
		column := func(name, filter string) string {
			return fmt.Sprintf("coalesce(sum(%s) filter (where %s), 0)::float8", reportingMeasure(name, unit), filter)
		}
		source := "source"
		// Source words sit on each text's first language only, so under a language filter the
		// language's arrivals are its source words.
		if scope.targetLocale != "" {
			source = "arrived"
		}
		bySource := make([]string, 0, len(reportingSummarySources))
		for _, name := range reportingSummarySources {
			bySource = append(bySource, fmt.Sprintf("'%s', %s", name, column("finished", translation+" and s.source = '"+name+"'")))
		}
		return fmt.Sprintf(`json_build_object(
            'source', %s, 'arrived', %s, 'arrivedDone', %s, 'abandoned', %s, 'finished', %s,
            'reviewed', %s,
            'uncounted', coalesce(sum(s.arrived_uncounted) filter (where %s), 0)::float8,
            'finishedByPerson', %s, 'finishedUnchanged', %s,
            'finishedBySource', json_build_object(%s))`,
			column(source, translation), column("arrived", translation), column("arrived_done", translation),
			column("abandoned", translation), column("finished", translation),
			column("finished", "s.step = 'review' and "+inPeriod),
			translation,
			column("finished_by_person", shown), column("finished_unchanged", shown),
			strings.Join(bySource, ", "))
	}
	var currentJSON, previousJSON []byte
	err = db.QueryRow(ctx, fmt.Sprintf(`
        select %s as current, %s as previous
        from %s
        where %s and s.day between %s and %s`,
		totals("s.day >= "+from), totals("s.day <= "+previousTo), rows.table, rows.where,
		args.add(period.PreviousFrom), args.add(period.To)), args...).Scan(&currentJSON, &previousJSON)
	if err != nil {
		return current, previous, fmt.Errorf("read activity totals: %w", err)
	}
	if err := json.Unmarshal(currentJSON, &current); err != nil {
		return current, previous, fmt.Errorf("decode activity totals: %w", err)
	}
	if err := json.Unmarshal(previousJSON, &previous); err != nil {
		return current, previous, fmt.Errorf("decode activity totals: %w", err)
	}
	return current, previous, nil
}

// reportingSeriesBars are the bars of a series over a period: each summary row's bar from its
// day, and every bar's start, the first on or before the period's first day. Weeks start on
// Monday and months on the first. Dates are stepped without a time zone, so the session's cannot
// move a day.
func reportingSeriesBars(args *reportingArgs, per string, period reportingPeriod) (start, starts string) {
	from, to := args.add(period.From), args.add(period.To)
	switch per {
	case "week":
		return "date_trunc('week', s.day::timestamp)::date",
			fmt.Sprintf("generate_series(date_trunc('week', %s::timestamp), %s::timestamp, '7 days'::interval)", from, to)
	case "month":
		return "date_trunc('month', s.day::timestamp)::date",
			fmt.Sprintf("generate_series(date_trunc('month', %s::timestamp), %s::timestamp, '1 month'::interval)", from, to)
	default:
		return "s.day", fmt.Sprintf("generate_series(%s::timestamp, %s::timestamp, '1 day'::interval)", from, to)
	}
}

// queryReportingFinishedSeries reads the units finished in each day or week of a period, split by
// where the text came from. Every day or week is present, with zeros where nothing was finished;
// a week starts on Monday, so the first may begin before the period does.
func queryReportingFinishedSeries(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, unit, step string) ([]reportingSeriesPoint, error) {
	var args reportingArgs
	start, starts := reportingSeriesBars(&args, period.Interval, period)
	rows, ok := scope.summaryRows(&args, false)
	sums := make([]string, 0, len(reportingSummarySources))
	selected := make([]string, 0, len(reportingSummarySources))
	for _, name := range reportingSummarySources {
		sums = append(sums, fmt.Sprintf("sum(%s) filter (where s.source = '%s') as %s", reportingMeasure("finished", unit), name, name))
		selected = append(selected, fmt.Sprintf("coalesce(t.%s, 0)::float8 as %s", name, name))
	}
	totals := "select null::date as start, 0 as memory, 0 as ai, 0 as person, 0 as import, 0 as unknown where false"
	if ok {
		totals = fmt.Sprintf(`select %s as start, %s from %s
            where %s and s.step = %s and s.day between %s and %s
            group by 1`,
			start, strings.Join(sums, ", "), rows.table, rows.where, args.add(step), args.add(period.From), args.add(period.To))
	}
	result, err := db.Query(ctx, fmt.Sprintf(`
        with totals as (%s)
        select b.start::date::text as start, %s
        from %s b(start)
        left join totals t on t.start = b.start::date
        order by b.start`, totals, strings.Join(selected, ", "), starts), args...)
	if err != nil {
		return nil, fmt.Errorf("read finished series: %w", err)
	}
	defer result.Close()
	series := []reportingSeriesPoint{}
	for result.Next() {
		var point reportingSeriesPoint
		if err := result.Scan(&point.Start, &point.Memory, &point.AI, &point.Person, &point.Import, &point.Unknown); err != nil {
			return nil, fmt.Errorf("scan finished series: %w", err)
		}
		series = append(series, point)
	}
	return series, result.Err()
}

// queryReportingFinishedByLanguage reads the units finished in a period by target language,
// largest first.
func queryReportingFinishedByLanguage(ctx context.Context, db dictionaryDB, scope reportingScope, period reportingPeriod, unit, step string) ([]reportingLanguageUnits, error) {
	languages := []reportingLanguageUnits{}
	var args reportingArgs
	rows, ok := scope.summaryRows(&args, false)
	if !ok {
		return languages, nil
	}
	finished := reportingMeasure("finished", unit)
	result, err := db.Query(ctx, fmt.Sprintf(`
        select s.target_locale, sum(%s)::float8 as units
        from %s
        where %s and s.step = %s and s.day between %s and %s
        group by 1 having sum(%s) > 0
        order by 2 desc, 1`,
		finished, rows.table, rows.where, args.add(step), args.add(period.From), args.add(period.To), finished), args...)
	if err != nil {
		return nil, fmt.Errorf("read finished by language: %w", err)
	}
	defer result.Close()
	for result.Next() {
		var language reportingLanguageUnits
		if err := result.Scan(&language.TargetLocale, &language.Units); err != nil {
			return nil, fmt.Errorf("scan finished by language: %w", err)
		}
		languages = append(languages, language)
	}
	return languages, result.Err()
}

// reportingActivityCSV is the chart: finished units per day or week, by where the text came from.
func reportingActivityCSV(activity reportingActivity) reportingCSV {
	return reportingCSV{filename: "activity.csv", write: func(w *reportingCSVWriter) error {
		if err := w.row(append([]string{"start"}, reportingSummarySources...)...); err != nil {
			return err
		}
		for _, point := range activity.Series {
			if err := w.row(point.Start, reportingNumber(point.Memory), reportingNumber(point.AI),
				reportingNumber(point.Person), reportingNumber(point.Import), reportingNumber(point.Unknown)); err != nil {
				return err
			}
		}
		return nil
	}}
}
