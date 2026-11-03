package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func rateCardUnitActor() reportingActor {
	return reportingActor{userID: "11111111-1111-4111-8111-111111111111", organizationID: "22222222-2222-4222-8222-222222222222", role: "admin"}
}

func rateCardUnitRequest(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	return r
}

func rateCardUnitAPI(pool *scriptPool) *reportingAPI {
	api := newReportingAPI()
	api.pool = pool
	return api
}

func rateCardUnitLiveRow(id, targetLocale, step, basis, rate, percentages string, retired bool) []any {
	return []any{id, "en-US", targetLocale, step, basis, rate, json.RawMessage(percentages), retired}
}

func requireReportingFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	var failure *reportingError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
}

func TestReportingSamePercentages(t *testing.T) {
	for name, tc := range map[string]struct {
		stored string
		given  map[string]int
		want   bool
	}{
		"both empty":             {`{}`, map[string]int{}, true},
		"explicit full rate":     {`{"100":100}`, nil, true},
		"given full rate":        {`{}`, map[string]int{"new": 100}, true},
		"same discount":          {`{"new":50,"95-99":30}`, map[string]int{"95-99": 30, "new": 50}, true},
		"float stored":           {`{"new":50.0}`, map[string]int{"new": 50}, true},
		"missing discount":       {`{"new":50}`, map[string]int{}, false},
		"different discount":     {`{"repetition":10}`, map[string]int{"repetition": 20}, false},
		"unknown stored bucket":  {`{"bogus":1}`, map[string]int{}, true},
		"null stored":            {`null`, map[string]int{}, true},
		"invalid stored":         {`nope`, map[string]int{}, false},
		"array stored":           {`[1]`, map[string]int{}, false},
		"fractional difference":  {`{"new":50.5}`, map[string]int{"new": 50}, false},
		"unavailable is checked": {`{"unavailable":0}`, map[string]int{}, false},
	} {
		require.Equal(t, tc.want, reportingSamePercentages(json.RawMessage(tc.stored), tc.given), name)
	}
}

func BenchmarkReportingSamePercentages(b *testing.B) {
	stored := json.RawMessage(`{"repetition":10,"100":20,"95-99":40,"85-94":60,"75-84":80,"50-74":90}`)
	given := map[string]int{"repetition": 10, "100": 20, "95-99": 40, "85-94": 60, "75-84": 80, "50-74": 90}
	b.ReportAllocs()
	for b.Loop() {
		if !reportingSamePercentages(stored, given) {
			b.Fatal("percentages differ")
		}
	}
}

func TestReportingLineKey(t *testing.T) {
	require.Equal(t, "en-US\x00fr-FR\x00translation", reportingLineKey("en-US", "fr-FR", "translation"))
	require.NotEqual(t, reportingLineKey("en", "-USfr", "review"), reportingLineKey("en-US", "fr", "review"))
}

func TestReportingLiveRateRowsSQL(t *testing.T) {
	sql := reportingLiveRateRowsSQL("$7")
	require.Contains(t, sql, "where organization_id = $7")
	require.Contains(t, sql, "distinct on (name, source_locale, target_locale, step)")
	require.Contains(t, sql, "created_at desc, id desc")
}

func TestListReportingRateCardsScripted(t *testing.T) {
	ctx := context.Background()
	organizationID := rateCardUnitActor().organizationID
	pool := &scriptPool{steps: []dbStep{
		{op: opQuery, table: [][]any{{"Zeta", "hour"}, {"alpha", "word"}}},
		{op: opQuery, table: [][]any{
			{"rate_1", "alpha", "en-US", "fr-FR", "translation", "word", "0.10", json.RawMessage(`{}`), false},
			{"rate_2", "Beta", "en-US", "de-DE", "review", "hour", "30.00", json.RawMessage(`{"new":50}`), false},
			{"rate_3", "Zeta", "en-US", "es-ES", "translation", "hour", "25.00", json.RawMessage(`{}`), true},
		}},
	}}
	cards, err := listReportingRateCards(ctx, pool, organizationID)
	require.NoError(t, err)
	requireScriptDone(t, pool)
	require.Equal(t, []reportingRateCard{
		{Name: "alpha", DefaultBasis: "word", Lines: []reportingRateLine{
			{ID: "rate_1", SourceLocale: "en-US", TargetLocale: "fr-FR", Step: "translation", Basis: "word", Rate: "0.10", Percentages: json.RawMessage(`{}`)},
		}},
		{Name: "Beta", DefaultBasis: "word", Lines: []reportingRateLine{
			{ID: "rate_2", SourceLocale: "en-US", TargetLocale: "de-DE", Step: "review", Basis: "hour", Rate: "30.00", Percentages: json.RawMessage(`{"new":50}`)},
		}},
		{Name: "Zeta", DefaultBasis: "hour", Lines: []reportingRateLine{}},
	}, cards)

	empty := &scriptPool{steps: []dbStep{{op: opQuery}, {op: opQuery}}}
	cards, err = listReportingRateCards(ctx, empty, organizationID)
	require.NoError(t, err)
	require.Equal(t, []reportingRateCard{}, cards)

	boom := errors.New("boom")
	for name, tc := range map[string]struct {
		steps []dbStep
		want  string
	}{
		"cards":      {[]dbStep{{op: opQuery, err: boom}}, "list rate cards"},
		"cards scan": {[]dbStep{{op: opQuery, table: [][]any{{"only"}}}}, "scan rate card"},
		"cards rows": {[]dbStep{{op: opQuery, rowsErr: boom}}, "list rate cards"},
		"lines":      {[]dbStep{{op: opQuery}, {op: opQuery, err: boom}}, "list rate lines"},
		"lines scan": {[]dbStep{{op: opQuery}, {op: opQuery, table: [][]any{{"rate_1"}}}}, "scan rate line"},
		"lines rows": {[]dbStep{{op: opQuery}, {op: opQuery, rowsErr: boom}}, "list rate lines"},
	} {
		t.Run(name, func(t *testing.T) {
			pool := &scriptPool{steps: tc.steps}
			_, err := listReportingRateCards(ctx, pool, organizationID)
			require.ErrorContains(t, err, tc.want)
			requireScriptDone(t, pool)
		})
	}
}

func TestReportingRateCardsHandlerScripted(t *testing.T) {
	pool := &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opExec},
		{op: opExec},
		{op: opQuery, table: [][]any{{"Standard", "word"}}},
		{op: opQuery},
	}}
	value, status, err := rateCardUnitAPI(pool).rateCards(httptest.NewRequest(http.MethodGet, "/", nil), rateCardUnitActor())
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	requireScriptDone(t, pool)
	require.Equal(t, map[string]any{
		"rateCards": []reportingRateCard{{Name: "Standard", DefaultBasis: "word", Lines: []reportingRateLine{}}},
		"canManage": true,
	}, value)

	failing := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opExec}, {op: opQuery, err: errors.New("boom")}}}
	_, _, err = rateCardUnitAPI(failing).rateCards(httptest.NewRequest(http.MethodGet, "/", nil), rateCardUnitActor())
	require.ErrorContains(t, err, "list rate cards")
}

func TestSaveRateCardRejectsInvalidBodies(t *testing.T) {
	line := func(fields string) string {
		return `{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"translation","basis":"word","rate":"0.10"` + fields + `}`
	}
	for name, body := range map[string]string{
		"not json":           `{`,
		"array":              `[]`,
		"missing name":       `{"lines":[]}`,
		"blank name":         `{"name":"  ","lines":[]}`,
		"long name":          `{"name":"` + strings.Repeat("n", 101) + `","lines":[]}`,
		"default basis":      `{"name":"Card","defaultBasis":"page","lines":[]}`,
		"create not boolean": `{"name":"Card","create":"yes","lines":[]}`,
		"missing lines":      `{"name":"Card"}`,
		"null lines":         `{"name":"Card","lines":null}`,
		"null line":          `{"name":"Card","lines":[null]}`,
		"short locale":       `{"name":"Card","lines":[{"sourceLocale":"e","targetLocale":"fr-FR","step":"translation","basis":"word","rate":"1"}]}`,
		"step":               `{"name":"Card","lines":[{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"edit","basis":"word","rate":"1"}]}`,
		"basis":              `{"name":"Card","lines":[{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"review","basis":"page","rate":"1"}]}`,
		"rate precision":     `{"name":"Card","lines":[{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"review","basis":"word","rate":"0.123456789"}]}`,
		"negative rate":      `{"name":"Card","lines":[{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"review","basis":"word","rate":"-1"}]}`,
		"unknown band":       `{"name":"Card","lines":[` + line(`,"percentages":{"90":50}`) + `]}`,
		"band over 100":      `{"name":"Card","lines":[` + line(`,"percentages":{"new":101}`) + `]}`,
		"fractional band":    `{"name":"Card","lines":[` + line(`,"percentages":{"new":50.5}`) + `]}`,
		"null percentages":   `{"name":"Card","lines":[` + line(`,"percentages":null`) + `]}`,
	} {
		t.Run(name, func(t *testing.T) {
			_, _, err := rateCardUnitAPI(&scriptPool{}).saveRateCard(rateCardUnitRequest(body), rateCardUnitActor())
			requireReportingFailure(t, err, http.StatusBadRequest, "invalid_rate_card")
		})
	}

	_, _, err := rateCardUnitAPI(&scriptPool{}).saveRateCard(rateCardUnitRequest(`{"name":"Card","lines":[`+line("")+`,`+line(`,"basis":"hour","rate":"2"`)+`]}`), rateCardUnitActor())
	requireReportingFailure(t, err, http.StatusBadRequest, "duplicate_rate_line")
}

func TestSaveRateCardScripted(t *testing.T) {
	begin := []dbStep{{op: opBegin}, {op: opExec}, {op: opExec}}
	with := func(steps ...dbStep) []dbStep { return append(append([]dbStep{}, begin...), steps...) }
	exists := func(found bool) dbStep { return dbStep{op: opQueryRow, scan: []any{found}} }
	body := `{"name":"Standard","defaultBasis":"hour","lines":[` +
		`{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"translation","basis":"word","rate":"0.1","percentages":{"100":100}},` +
		`{"sourceLocale":"en-US","targetLocale":"it-IT","step":"review","basis":"hour","rate":"30","percentages":{"new":50}}]}`

	t.Run("adds changed lines and retires removed ones", func(t *testing.T) {
		pool := &scriptPool{steps: with(
			exists(true),
			dbStep{op: opQuery, table: [][]any{
				rateCardUnitLiveRow("rate_fr", "fr-FR", "translation", "word", "0.10", `{}`, false),
				rateCardUnitLiveRow("rate_de", "de-DE", "translation", "word", "0.20", `{}`, false),
				rateCardUnitLiveRow("rate_es", "es-ES", "translation", "word", "0.30", `{}`, true),
			}},
			dbStep{op: opQueryRow, scan: []any{"word"}},
			dbStep{op: opQueryRow, scan: []any{"card_1"}},
			dbStep{op: opExec},
			dbStep{op: opExec},
			dbStep{op: opExec},
			dbStep{op: opQuery, table: [][]any{
				rateCardUnitLiveRow("rate_fr", "fr-FR", "translation", "word", "0.10", `{}`, false),
				rateCardUnitLiveRow("rate_de2", "de-DE", "translation", "word", "0.20", `{}`, true),
				rateCardUnitLiveRow("rate_it", "it-IT", "review", "hour", "30.00", `{"new":50}`, false),
			}},
		)}
		value, status, err := rateCardUnitAPI(pool).saveRateCard(rateCardUnitRequest(body), rateCardUnitActor())
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		requireScriptDone(t, pool)
		saved := value.(map[string]any)["rateCard"].(reportingRateCard)
		require.Equal(t, "Standard", saved.Name)
		require.Equal(t, "hour", saved.DefaultBasis)
		require.Equal(t, []string{"rate_fr", "rate_it"}, []string{saved.Lines[0].ID, saved.Lines[1].ID})
	})

	t.Run("creates a new card with default basis", func(t *testing.T) {
		pool := &scriptPool{steps: with(
			exists(false),
			dbStep{op: opQuery},
			dbStep{op: opQueryRow, err: pgx.ErrNoRows},
			dbStep{op: opQueryRow, scan: []any{"card_1"}},
			dbStep{op: opExec},
			dbStep{op: opExec},
			dbStep{op: opQuery},
		)}
		value, _, err := rateCardUnitAPI(pool).saveRateCard(rateCardUnitRequest(`{"name":" New ","create":true,"lines":[{"sourceLocale":"en-US","targetLocale":"fr-FR","step":"translation","basis":"word","rate":"1"}]}`), rateCardUnitActor())
		require.NoError(t, err)
		requireScriptDone(t, pool)
		require.Equal(t, reportingRateCard{Name: "New", DefaultBasis: "word", Lines: []reportingRateLine{}}, value.(map[string]any)["rateCard"])
	})

	t.Run("existing card without a record keeps word basis in audit", func(t *testing.T) {
		pool := &scriptPool{steps: with(
			exists(true),
			dbStep{op: opQuery},
			dbStep{op: opQueryRow, err: pgx.ErrNoRows},
			dbStep{op: opQueryRow, scan: []any{"card_1"}},
			dbStep{op: opExec},
			dbStep{op: opQuery},
		)}
		_, _, err := rateCardUnitAPI(pool).saveRateCard(rateCardUnitRequest(`{"name":"Legacy","lines":[]}`), rateCardUnitActor())
		require.NoError(t, err)
		requireScriptDone(t, pool)
	})

	t.Run("name conflicts", func(t *testing.T) {
		_, _, err := rateCardUnitAPI(&scriptPool{steps: with(exists(true))}).saveRateCard(rateCardUnitRequest(`{"name":"Card","create":true,"lines":[]}`), rateCardUnitActor())
		requireReportingFailure(t, err, http.StatusConflict, "rate_card_exists")
		_, _, err = rateCardUnitAPI(&scriptPool{steps: with(exists(false))}).saveRateCard(rateCardUnitRequest(`{"name":"Card","lines":[]}`), rateCardUnitActor())
		requireReportingFailure(t, err, http.StatusNotFound, "rate_card_not_found")
	})

	boom := errors.New("boom")
	live := dbStep{op: opQuery, table: [][]any{rateCardUnitLiveRow("rate_fr", "fr-FR", "translation", "word", "0.10", `{}`, false)}}
	for name, tc := range map[string]struct {
		steps []dbStep
		body  string
		want  string
	}{
		"begin":          {[]dbStep{{op: opBegin, err: boom}}, body, "boom"},
		"timeout":        {[]dbStep{{op: opBegin}, {op: opExec, err: boom}}, body, "boom"},
		"lock":           {[]dbStep{{op: opBegin}, {op: opExec}, {op: opExec, err: boom}}, body, "boom"},
		"exists":         {with(dbStep{op: opQueryRow, err: boom}), body, "boom"},
		"live":           {with(exists(true), dbStep{op: opQuery, err: boom}), body, "read rate lines"},
		"live scan":      {with(exists(true), dbStep{op: opQuery, table: [][]any{{"rate_1"}}}), body, "scan rate line"},
		"live rows":      {with(exists(true), dbStep{op: opQuery, rowsErr: boom}), body, "boom"},
		"previous basis": {with(exists(true), live, dbStep{op: opQueryRow, err: boom}), body, "read rate card"},
		"upsert":         {with(exists(true), live, dbStep{op: opQueryRow, scan: []any{"word"}}, dbStep{op: opQueryRow, err: boom}), body, "save rate card"},
		"stored rate": {with(exists(true),
			dbStep{op: opQuery, table: [][]any{rateCardUnitLiveRow("rate_fr", "fr-FR", "translation", "word", "garbage", `{}`, false)}},
			dbStep{op: opQueryRow, scan: []any{"word"}}, dbStep{op: opQueryRow, scan: []any{"card_1"}}), body, ""},
		"insert line": {with(exists(true), live, dbStep{op: opQueryRow, scan: []any{"word"}}, dbStep{op: opQueryRow, scan: []any{"card_1"}},
			dbStep{op: opExec, err: boom}), body, "save rate line"},
		"audit": {with(exists(true), live, dbStep{op: opQueryRow, scan: []any{"word"}}, dbStep{op: opQueryRow, scan: []any{"card_1"}},
			dbStep{op: opExec}, dbStep{op: opExec, err: boom}), body, "write reporting audit"},
		"after": {with(exists(true), live, dbStep{op: opQueryRow, scan: []any{"word"}}, dbStep{op: opQueryRow, scan: []any{"card_1"}},
			dbStep{op: opExec}, dbStep{op: opExec}, dbStep{op: opQuery, err: boom}), body, "read rate lines"},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: tc.steps}
			_, _, err := rateCardUnitAPI(pool).saveRateCard(rateCardUnitRequest(tc.body), rateCardUnitActor())
			require.Error(t, err)
			require.ErrorContains(t, err, tc.want)
			requireScriptDone(t, pool)
		})
	}
}

func TestReportingAuditScripted(t *testing.T) {
	ctx := context.Background()
	actor := rateCardUnitActor()

	pool := &scriptPool{steps: []dbStep{{op: opExec}}}
	require.NoError(t, reportingAudit(ctx, pool, actor, "card_1", "rate_card_created", nil, map[string]any{"name": "Card"}))
	requireScriptDone(t, pool)

	require.Error(t, reportingAudit(ctx, &scriptPool{}, actor, "card_1", "x", make(chan int), nil))
	require.Error(t, reportingAudit(ctx, &scriptPool{}, actor, "card_1", "x", nil, func() {}))

	failing := &scriptPool{steps: []dbStep{{op: opExec, err: errors.New("boom")}}}
	require.ErrorContains(t, reportingAudit(ctx, failing, actor, "card_1", "x", map[string]any{}, nil), "write reporting audit")
}
