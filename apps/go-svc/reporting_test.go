package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func reportingBodyFrom(t *testing.T, raw string) *reportingBody {
	t.Helper()
	body, err := readReportingBody(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(raw)), "invalid_rate")
	require.NoError(t, err)
	return body
}

func TestReadReportingBodyMapsUnparseableJSONToRouteCode(t *testing.T) {
	for _, raw := range []string{"{", "[]", "123", `"text"`} {
		_, err := readReportingBody(httptest.NewRequest(http.MethodPost, "/", strings.NewReader(raw)), "invalid_rate")
		var failure *reportingError
		require.True(t, errors.As(err, &failure), raw)
		require.Equal(t, 400, failure.status)
		require.Equal(t, "invalid_rate", failure.code)
	}
	for _, raw := range []string{"", "null"} {
		body := reportingBodyFrom(t, raw)
		body.text("name", 1, 100)
		require.False(t, body.valid, raw)
	}
}

func TestReportingBodyStrings(t *testing.T) {
	body := reportingBodyFrom(t, `{"name":"  Default  ","emoji":"😀","short":"a","number":1,"empty":"\ufeff\u00a0"}`)
	require.Equal(t, "Default", body.trimmedText("name", 1, 100))
	require.True(t, body.valid)

	body.text("emoji", 0, 2)
	require.True(t, body.valid, "UTF-16 length of an astral rune is 2")
	body.text("emoji", 0, 1)
	require.False(t, body.valid)

	for _, check := range []func(*reportingBody){
		func(b *reportingBody) { b.text("short", 2, 35) },
		func(b *reportingBody) { b.text("number", 0, 10) },
		func(b *reportingBody) { b.text("missing", 0, 10) },
		func(b *reportingBody) { b.trimmedText("empty", 1, 10) },
	} {
		b := reportingBodyFrom(t, `{"short":"a","number":1,"empty":"\ufeff\u00a0"}`)
		check(b)
		require.False(t, b.valid)
	}
}

func TestReportingBodyOptionalAndNullable(t *testing.T) {
	body := reportingBodyFrom(t, `{"note":"hi","nullNote":null,"card":null}`)
	require.Equal(t, "hi", *body.optionalText("note", 2000))
	require.Nil(t, body.optionalText("missing", 2000))
	require.Nil(t, body.nullableText("card", 100))
	require.Nil(t, body.nullableText("missing", 100))
	require.True(t, body.valid)

	body.optionalText("nullNote", 2000)
	require.False(t, body.valid, "z.string().optional() rejects null")
}

func TestReportingBodyIntegers(t *testing.T) {
	body := reportingBodyFrom(t, `{"whole":1.0,"exp":1e2,"neg":-0}`)
	require.Equal(t, 1, body.integer("whole", 1, 1440))
	require.Equal(t, 100, body.integer("exp", 1, 1440))
	require.Equal(t, 0, body.integer("neg", 0, 10))
	require.True(t, body.valid)

	for _, raw := range []string{`1.5`, `"1"`, `true`, `null`, `0`, `1441`, `1e400`, `[]`} {
		b := reportingBodyFrom(t, `{"minutes":`+raw+`}`)
		b.integer("minutes", 1, 1440)
		require.False(t, b.valid, raw)
	}

	nullable := reportingBodyFrom(t, `{"estimate":null}`)
	require.Nil(t, nullable.nullableInteger("estimate", 0, 525600))
	require.Nil(t, nullable.nullableInteger("missing", 0, 525600))
	require.True(t, nullable.valid)
}

func TestReportingBodyFormats(t *testing.T) {
	valid := reportingBodyFrom(t, `{
		"step":"review","rate":"0.12","maxRate":"999999999999.99999999",
		"day":"2028-02-29","firstDay":"0000-01-01",
		"id":"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11","nilId":"00000000-0000-0000-0000-000000000000",
		"maxId":"FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF","override":null
	}`)
	require.Equal(t, "review", valid.step("step"))
	require.Equal(t, "0.12", valid.usd("rate"))
	require.Equal(t, "999999999999.99999999", valid.usd("maxRate"))
	require.Equal(t, "2028-02-29", valid.day("day"))
	require.Equal(t, "0000-01-01", valid.day("firstDay"))
	valid.uuid("id")
	valid.uuid("nilId")
	valid.uuid("maxId")
	require.Nil(t, valid.nullableUSD("override"))
	require.Nil(t, valid.nullableUUID("missing"))
	require.True(t, valid.valid)

	for _, tc := range []struct {
		raw   string
		check func(*reportingBody)
	}{
		{`"draft"`, func(b *reportingBody) { b.step("value") }},
		{`"1.123456789"`, func(b *reportingBody) { b.usd("value") }},
		{`"1234567890123"`, func(b *reportingBody) { b.usd("value") }},
		{`"1\n"`, func(b *reportingBody) { b.usd("value") }},
		{`0.12`, func(b *reportingBody) { b.usd("value") }},
		{`"2026-02-29"`, func(b *reportingBody) { b.day("value") }},
		{`"2026-1-01"`, func(b *reportingBody) { b.day("value") }},
		{`" 2026-01-01"`, func(b *reportingBody) { b.day("value") }},
		{`"2026-01-01T00:00:00Z"`, func(b *reportingBody) { b.day("value") }},
		{`"12345678-1234-0234-8234-123456789012"`, func(b *reportingBody) { b.uuid("value") }},
		{`"not-a-uuid"`, func(b *reportingBody) { b.nullableUUID("value") }},
	} {
		b := reportingBodyFrom(t, `{"value":`+tc.raw+`}`)
		tc.check(b)
		require.False(t, b.valid, tc.raw)
	}
}

func TestReportingBodyPercentages(t *testing.T) {
	body := reportingBodyFrom(t, `{"percentages":{"100":1.0,"new":0}}`)
	require.Equal(t, map[string]int{"100": 1, "new": 0}, body.percentages("percentages"))
	require.Equal(t, map[string]int{}, body.percentages("missing"))
	require.True(t, body.valid)

	for _, raw := range []string{`{"foo":1}`, `{"100":101}`, `{"100":"1"}`, `null`, `[]`} {
		b := reportingBodyFrom(t, `{"percentages":`+raw+`}`)
		b.percentages("percentages")
		require.False(t, b.valid, raw)
	}
}

func TestWriteReportingCSV(t *testing.T) {
	rec := httptest.NewRecorder()
	writeReportingCSV(t.Context(), rec, http.StatusOK, reportingCSV{filename: "activity.csv", write: func(w *reportingCSVWriter) error {
		if err := w.row("start", "memory"); err != nil {
			return err
		}
		return w.row("2026-06-01", "=1+1", "-3.5", "a\"b")
	}})
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/csv; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Equal(t, `attachment; filename="activity.csv"`, rec.Header().Get("Content-Disposition"))
	// CRLF between rows and none after the last; formulas disarmed, negative numbers left alone.
	require.Equal(t, "\"start\",\"memory\"\r\n\"2026-06-01\",\"'=1+1\",\"-3.5\",\"a\"\"b\"", rec.Body.String())
}
