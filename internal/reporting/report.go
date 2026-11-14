package reporting

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"

	"github.com/jackc/pgx/v5/pgconn"
)

// Kinds the public API and MCP get_report tool can ask for.
var Kinds = []string{"activity", "words", "word-series", "time", "ai", "costs", "budgets", "contributors", "task-report"}

// CSVKinds are the kinds that answer with the page's own CSV when asked.
var CSVKinds = []string{"activity", "words", "time", "ai", "costs", "budgets", "contributors", "task-report"}

// Result is a report as JSON or a download.
type Result struct {
	Status             int
	ContentType        string
	ContentDisposition string
	Body               []byte
}

// QueryTextValues copies a public-api query map as the handlers read URL values.
func queryValues(query map[string]string) url.Values {
	values := url.Values{}
	for key, value := range query {
		values.Set(key, value)
	}
	return values
}

// Report is one of the page's reports for a trusted caller acting as actor: the workspace,
// the Reports flag and billing access apply as they do on the page. format is "csv" or JSON.
func (api *API) Report(ctx context.Context, actor Actor, kind, format string, query map[string]string) (Result, error) {
	if api.Pool == nil {
		return Result{}, reportingFailure(503, "reports_unavailable", "Reports service unavailable")
	}
	if !slices.Contains(Kinds, kind) {
		return Result{}, reportingFailure(400, "invalid_report_kind", "Report kind is invalid")
	}
	if format != "" && format != "json" && format != "csv" {
		return Result{}, reportingFailure(400, "invalid_payload", "Request payload is invalid")
	}
	ctx = withReportingWorkspace(ctx, actor.organizationID)
	if !api.flagEnabled(ctx, actor) {
		return Result{}, reportingFailure(403, "feature_unavailable", reportingFlagMessage)
	}
	if !actor.can("billing:read") {
		return Result{}, reportingFailure(403, "report_forbidden", "Reports require billing access")
	}
	values := queryValues(query)
	jobID := values.Get("jobId")
	if kind == "task-report" {
		values.Del("jobId")
		if jobID == "" {
			return Result{}, reportingInvalidQuery()
		}
	}
	request := func(reportFormat string) (*http.Request, error) {
		query := url.Values{}
		for key, value := range values {
			query[key] = value
		}
		query.Set("format", reportFormat)
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, "/?"+query.Encode(), nil)
		if err == nil && kind == "task-report" {
			request.SetPathValue("jobId", jobID)
		}
		return request, err
	}
	handlers := map[string]func(*http.Request, Actor) (any, int, error){
		"activity": api.Activity, "words": api.Words, "word-series": api.WordSeries, "time": api.Time,
		"ai": api.AIUsage, "costs": api.Costs, "budgets": api.Budgets, "contributors": api.Contributors,
		"task-report": api.TaskReport,
	}
	if format == "csv" {
		if !slices.Contains(CSVKinds, kind) {
			return Result{}, reportingFailure(400, "report_csv_unavailable", "This report has no CSV download")
		}
		req, err := request("csv")
		if err != nil {
			return Result{}, err
		}
		value, status, err := handlers[kind](req, actor)
		if err != nil {
			return Result{}, err
		}
		download, ok := value.(reportingCSV)
		if !ok {
			return Result{}, reportingFailure(400, "report_csv_unavailable", "This report has no CSV download")
		}
		body, err := csvBytes(download)
		if err != nil {
			return Result{}, err
		}
		return Result{
			Status:             status,
			ContentType:        "text/csv; charset=utf-8",
			ContentDisposition: `attachment; filename="` + download.filename + `"`,
			Body:               body,
		}, nil
	}
	read := func(fn func(*http.Request, Actor) (any, int, error)) (map[string]any, error) {
		req, err := request("json")
		if err != nil {
			return nil, err
		}
		value, _, err := fn(req, actor)
		if err != nil {
			return nil, err
		}
		return value.(map[string]any), nil
	}
	answer := map[string]any{"kind": kind}
	var summary reportingSummaryFreshness
	if err := api.read(ctx, func(db DB) error {
		var err error
		summary, err = reportingSummaryFreshnessOf(ctx, db, actor.organizationID)
		return err
	}); err != nil {
		return Result{}, err
	}
	answer["summary"] = summary
	answer["stillUpdating"] = summary.PendingDays > 0
	var err error
	switch kind {
	case "activity":
		err = reportingMerge(answer, read, api.Activity, "activity")
	case "words":
		err = reportingMerge(answer, read, api.Words, "wordCounts")
		if err == nil {
			var series map[string]any
			if series, err = read(api.WordSeries); err == nil {
				counts := answer["wordCounts"].(reportingWordCounts)
				answer["wordCounts"] = struct {
					reportingWordCounts
					Series any `json:"series"`
				}{counts, series["wordSeries"]}
			}
		}
	case "word-series":
		err = reportingMerge(answer, read, api.WordSeries, "wordSeries")
	case "time":
		err = reportingMerge(answer, read, api.Time, "time")
	case "ai":
		answer["stillUpdating"] = false
		err = reportingMerge(answer, read, api.AIUsage, "aiUsage")
	case "budgets":
		err = reportingMerge(answer, read, api.Budgets, "budgets")
	case "contributors":
		err = reportingMerge(answer, read, api.Contributors, "contributors")
	case "task-report":
		err = reportingMerge(answer, read, api.TaskReport, "taskReport")
	default:
		err = reportingMerge(answer, read, api.Costs, "costs")
	}
	if err != nil {
		return Result{}, err
	}
	body, err := json.Marshal(answer)
	if err != nil {
		return Result{}, err
	}
	return Result{Status: http.StatusOK, ContentType: "application/json", Body: body}, nil
}

func reportingMerge(answer map[string]any, read func(func(*http.Request, Actor) (any, int, error)) (map[string]any, error), fn func(*http.Request, Actor) (any, int, error), key string) error {
	value, err := read(fn)
	if err != nil {
		return err
	}
	answer[key] = value[key]
	return nil
}

func csvBytes(download reportingCSV) ([]byte, error) {
	var buf bytes.Buffer
	writer := &reportingCSVWriter{out: bufio.NewWriter(&buf)}
	if err := download.write(writer); err != nil {
		return nil, err
	}
	if err := writer.out.Flush(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// EncodeError maps a Reports refusal to the JSON body the public API writes.
func EncodeError(err error) (Result, bool) {
	var failure *Error
	var pgErr *pgconn.PgError
	switch {
	case errors.As(err, &failure):
	case (errors.As(err, &pgErr) && pgErr.Code == "57014") || errors.Is(err, context.DeadlineExceeded):
		failure = &Error{Status: http.StatusServiceUnavailable, Code: "report_timed_out", Message: "The request took too long; try again, or choose fewer days for a report"}
	default:
		return Result{}, false
	}
	body, marshalErr := json.Marshal(map[string]string{"error": failure.Code, "message": failure.Message})
	if marshalErr != nil {
		return Result{}, false
	}
	return Result{Status: failure.Status, ContentType: "application/json", Body: body}, true
}
