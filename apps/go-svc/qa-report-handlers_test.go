package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseWorkspaceFindingsQuery(t *testing.T) {
	ok := httptest.NewRequest("GET", "/qa-reports/findings?projectId=proj_1&locale=fr-FR&checkType=glossary_violation&severity=error&limit=10&offset=5", nil)
	projectID, locale, checkType, severity, limit, offset, err := parseWorkspaceFindingsQuery(ok)
	require.NoError(t, err)
	require.Equal(t, "proj_1", projectID)
	require.Equal(t, "fr-FR", locale)
	require.Equal(t, "glossary_violation", checkType)
	require.Equal(t, "error", severity)
	require.Equal(t, 10, limit)
	require.Equal(t, 5, offset)

	encodedNames := httptest.NewRequest("GET", "/qa-reports/findings?loc%61le=fr-FR&check%54ype=glossary_violation&sev%65rity=error&project%49d=proj_1", nil)
	projectID, locale, checkType, severity, _, _, err = parseWorkspaceFindingsQuery(encodedNames)
	require.NoError(t, err)
	require.Equal(t, "proj_1", projectID)
	require.Equal(t, "fr-FR", locale)
	require.Equal(t, "glossary_violation", checkType)
	require.Equal(t, "error", severity)

	malformedKey := httptest.NewRequest("GET", "/qa-reports/findings?loc%ZZle=fr-FR&locale=de-DE", nil)
	_, locale, _, _, _, _, err = parseWorkspaceFindingsQuery(malformedKey)
	require.NoError(t, err)
	require.Equal(t, "de-DE", locale)

	malformedValue := httptest.NewRequest("GET", "/qa-reports/findings?locale=fr%ZZ&locale=de-DE", nil)
	_, locale, _, _, _, _, err = parseWorkspaceFindingsQuery(malformedValue)
	require.NoError(t, err)
	require.Equal(t, "de-DE", locale)

	malformedLimit := httptest.NewRequest("GET", "/qa-reports/findings?limit=10%ZZ&limit=5", nil)
	_, _, _, _, limit, _, err = parseWorkspaceFindingsQuery(malformedLimit)
	require.NoError(t, err)
	require.Equal(t, 5, limit)

	semicolonPair := httptest.NewRequest("GET", "/qa-reports/findings?locale=fr-FR;ignored&locale=de-DE", nil)
	_, locale, _, _, _, _, err = parseWorkspaceFindingsQuery(semicolonPair)
	require.NoError(t, err)
	require.Equal(t, "de-DE", locale)

	semicolonLimit := httptest.NewRequest("GET", "/qa-reports/findings?limit=10;&limit=5", nil)
	_, _, _, _, limit, _, err = parseWorkspaceFindingsQuery(semicolonLimit)
	require.NoError(t, err)
	require.Equal(t, 5, limit)

	encodedSemicolon := httptest.NewRequest("GET", "/qa-reports/findings?locale=fr%2DFR%3Bignored&locale=de-DE", nil)
	_, locale, _, _, _, _, err = parseWorkspaceFindingsQuery(encodedSemicolon)
	require.NoError(t, err)
	require.Equal(t, "fr-FR;ignored", locale)

	firstValue := httptest.NewRequest("GET", "/qa-reports/findings?limit=10&limit=99&offset=0&offset=20", nil)
	_, _, _, _, limit, offset, err = parseWorkspaceFindingsQuery(firstValue)
	require.NoError(t, err)
	require.Equal(t, 10, limit)
	require.Equal(t, 0, offset)

	defaults := httptest.NewRequest("GET", "/qa-reports/findings?projectId=&locale=&limit=&offset=", nil)
	projectID, locale, _, _, limit, offset, err = parseWorkspaceFindingsQuery(defaults)
	require.NoError(t, err)
	require.Empty(t, projectID)
	require.Empty(t, locale)
	require.Equal(t, 50, limit)
	require.Equal(t, 0, offset)

	for _, raw := range []string{
		"/qa-reports/findings?locale=" + "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		"/qa-reports/findings?checkType=unknown_check",
		"/qa-reports/findings?severity=info",
		"/qa-reports/findings?limit=0",
		"/qa-reports/findings?limit=101",
		"/qa-reports/findings?offset=-1",
	} {
		_, _, _, _, _, _, err = parseWorkspaceFindingsQuery(httptest.NewRequest("GET", raw, nil))
		require.EqualError(t, err, "invalid_qa_report_query", raw)
	}
}

func TestParseProjectFindingsQueryMalformedPairs(t *testing.T) {
	malformedValue := httptest.NewRequest("GET", "/qa-reports/findings?locale=fr%ZZ&locale=de-DE", nil)
	locale, _, _, _, _, err := parseProjectFindingsQuery(malformedValue)
	require.NoError(t, err)
	require.Equal(t, "de-DE", locale)

	malformedLimit := httptest.NewRequest("GET", "/qa-reports/findings?limit=10%ZZ&limit=5", nil)
	_, _, _, limit, _, err := parseProjectFindingsQuery(malformedLimit)
	require.NoError(t, err)
	require.Equal(t, 5, limit)

	semicolonPair := httptest.NewRequest("GET", "/qa-reports/findings?locale=fr-FR;ignored&locale=de-DE", nil)
	locale, _, _, _, _, err = parseProjectFindingsQuery(semicolonPair)
	require.NoError(t, err)
	require.Equal(t, "de-DE", locale)

	semicolonLimit := httptest.NewRequest("GET", "/qa-reports/findings?limit=10;&limit=5", nil)
	_, _, _, limit, _, err = parseProjectFindingsQuery(semicolonLimit)
	require.NoError(t, err)
	require.Equal(t, 5, limit)
}

func TestFirstQueryValue(t *testing.T) {
	val, ok := firstQueryValue("locale=de-DE&locale=fr-FR", "locale")
	require.True(t, ok)
	require.Equal(t, "de-DE", val)
}

func TestDecodeQueryValue(t *testing.T) {
	plus, ok := decodeQueryValue("fr+FR")
	require.True(t, ok)
	require.Equal(t, "fr FR", plus)

	encoded, ok := decodeQueryValue("fr%2DFR")
	require.True(t, ok)
	require.Equal(t, "fr-FR", encoded)

	_, ok = decodeQueryValue("fr%ZZ")
	require.False(t, ok)

	trimmed, ok := decodeQueryValue("  de-DE  ")
	require.True(t, ok)
	require.Equal(t, "de-DE", trimmed)
}

func TestParseProjectFindingsQueryHappyPathAndValidation(t *testing.T) {
	ok := httptest.NewRequest("GET", "/projects/p1/qa-reports/r1?locale=fr-FR&checkType=glossary_violation&severity=error&limit=10&offset=5", nil)
	locale, checkType, severity, limit, offset, err := parseProjectFindingsQuery(ok)
	require.NoError(t, err)
	require.Equal(t, "fr-FR", locale)
	require.Equal(t, "glossary_violation", checkType)
	require.Equal(t, "error", severity)
	require.Equal(t, 10, limit)
	require.Equal(t, 5, offset)

	firstValue := httptest.NewRequest("GET", "/projects/p1/qa-reports/r1?limit=10&limit=99&offset=0&offset=20", nil)
	_, _, _, limit, offset, err = parseProjectFindingsQuery(firstValue)
	require.NoError(t, err)
	require.Equal(t, 10, limit)
	require.Equal(t, 0, offset)

	defaults := httptest.NewRequest("GET", "/projects/p1/qa-reports/r1?locale=&limit=&offset=", nil)
	locale, _, _, limit, offset, err = parseProjectFindingsQuery(defaults)
	require.NoError(t, err)
	require.Empty(t, locale)
	require.Equal(t, 50, limit)
	require.Equal(t, 0, offset)

	for _, raw := range []string{
		"/projects/p1/qa-reports/r1?locale=" + "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		"/projects/p1/qa-reports/r1?checkType=unknown_check",
		"/projects/p1/qa-reports/r1?severity=info",
		"/projects/p1/qa-reports/r1?limit=0",
		"/projects/p1/qa-reports/r1?limit=101",
		"/projects/p1/qa-reports/r1?offset=-1",
	} {
		_, _, _, _, _, err = parseProjectFindingsQuery(httptest.NewRequest("GET", raw, nil))
		require.EqualError(t, err, "invalid_qa_report_query", raw)
	}
}

func TestParseLatestFindingsQuery(t *testing.T) {
	ok := httptest.NewRequest("GET", "/projects/p1/qa-reports/latest?locale=fr-FR&sourcePath=app.json&limit=25&offset=5", nil)
	locale, sourcePath, limit, offset, err := parseLatestFindingsQuery(ok)
	require.NoError(t, err)
	require.Equal(t, "fr-FR", locale)
	require.Equal(t, "app.json", sourcePath)
	require.Equal(t, 25, limit)
	require.Equal(t, 5, offset)

	defaults := httptest.NewRequest("GET", "/projects/p1/qa-reports/latest?locale=de-DE&limit=&offset=", nil)
	locale, sourcePath, limit, offset, err = parseLatestFindingsQuery(defaults)
	require.NoError(t, err)
	require.Equal(t, "de-DE", locale)
	require.Empty(t, sourcePath)
	require.Equal(t, 2000, limit)
	require.Equal(t, 0, offset)

	firstValue := httptest.NewRequest("GET", "/projects/p1/qa-reports/latest?locale=fr-FR&limit=10&limit=99&offset=1&offset=20", nil)
	_, _, limit, offset, err = parseLatestFindingsQuery(firstValue)
	require.NoError(t, err)
	require.Equal(t, 10, limit)
	require.Equal(t, 1, offset)

	for _, raw := range []string{
		"/projects/p1/qa-reports/latest",
		"/projects/p1/qa-reports/latest?locale=",
		"/projects/p1/qa-reports/latest?locale=%20%20%20",
		"/projects/p1/qa-reports/latest?locale=" + "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		"/projects/p1/qa-reports/latest?locale=fr-FR&sourcePath=" + strings.Repeat("x", 1025),
		"/projects/p1/qa-reports/latest?locale=fr-FR&limit=0",
		"/projects/p1/qa-reports/latest?locale=fr-FR&limit=2001",
		"/projects/p1/qa-reports/latest?locale=fr-FR&offset=-1",
	} {
		_, _, _, _, err = parseLatestFindingsQuery(httptest.NewRequest("GET", raw, nil))
		require.EqualError(t, err, "invalid_qa_report_query", raw)
	}
}
