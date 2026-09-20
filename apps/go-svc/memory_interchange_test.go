package main

import (
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func sampleMemoryCSV(n int) string {
	var b strings.Builder
	b.WriteString("source_locale,target_locale,source_text,target_text,match_score\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, "en-US,fr-FR,Hello %d,Bonjour %d,100\n", i, i)
	}
	return b.String()
}

func sampleMemoryTMX(n int) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?><tmx version="1.4"><header srclang="en-US"/><body>`)
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, `<tu tuid="tu-%d"><tuv xml:lang="en-US"><seg>Hello %d</seg></tuv><tuv xml:lang="fr-FR"><seg>Bonjour %d</seg></tuv></tu>`, i, i, i)
	}
	b.WriteString(`</body></tmx>`)
	return b.String()
}

func TestParseMemoryCSV(t *testing.T) {
	candidates := parseMemoryCSV(sampleMemoryCSV(3))
	require.Len(t, candidates, 3)
	require.Equal(t, "en-US", candidates[0].SourceLocale)
	require.Equal(t, "fr-FR", candidates[0].TargetLocale)
	require.Equal(t, "Hello 0", candidates[0].SourceText)
	require.Equal(t, 100, candidates[0].MatchScore)
}

func TestParseMemoryTMX(t *testing.T) {
	candidates, issues, header := parseMemoryTMX(sampleMemoryTMX(2))
	require.Empty(t, issues)
	require.NotNil(t, header)
	require.Equal(t, "en-US", *header)
	require.Len(t, candidates, 2)
	require.Equal(t, "Hello 0", candidates[0].SourceText)
	require.Equal(t, "Bonjour 1", candidates[1].TargetText)
	require.NotNil(t, candidates[0].Tuid)
}

func TestParseMemoryTMXInvalid(t *testing.T) {
	candidates, issues, header := parseMemoryTMX("<not-xml")
	require.Nil(t, candidates)
	require.Nil(t, header)
	require.NotEmpty(t, issues)
	require.Equal(t, "invalid_tmx", issues[0].Code)
}

func TestParseMemoryImportDispatch(t *testing.T) {
	csvCandidates, csvIssues, _ := parseMemoryImport("csv", sampleMemoryCSV(1))
	require.Empty(t, csvIssues)
	require.Len(t, csvCandidates, 1)

	tmxCandidates, tmxIssues, header := parseMemoryImport("tmx", sampleMemoryTMX(1))
	require.Empty(t, tmxIssues)
	require.Len(t, tmxCandidates, 1)
	require.NotNil(t, header)
}

func TestMemoryExportCSVHTTP(t *testing.T) {
	entries := dictionaryDBStep{kind: "query", sql: "from memory_entries where", values: [][]any{{
		"en-US", "fr-FR", "Hello", "Bonjour", 100, nil,
	}}}
	entries.args = []any{testMemoryID}
	api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), entries)
	rec := memoryRequestForTest(api, "GET", testMemoryBase+"/"+testMemoryID+"/entries/export?format=csv", "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "text/csv")
	require.Contains(t, rec.Body.String(), "source_locale")
	require.Contains(t, rec.Body.String(), "Bonjour")
}

func TestMemoryImportApply(t *testing.T) {
	dupCheck := dictionaryRowStep("select id from memory_entries where memory_id=$1")
	dupCheck.err = pgx.ErrNoRows
	dupCheck.args = []any{testMemoryID, "en-US", "fr-FR", "hello"}
	insert := dictionaryRowStep("insert into memory_entries as e", memoryEntryValues()...)
	attempt := dictionaryRowStep("insert into memory_import_attempts", "dddddddd-dddd-4ddd-8ddd-dddddddddddd")
	api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), dupCheck, insert, attempt)
	body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour"}`
	rec := memoryRequestForTest(api, "POST", testMemoryBase+"/"+testMemoryID+"/entries/import", body)
	require.Equal(t, 201, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"imported":1`)
	require.Contains(t, rec.Body.String(), `"importAttemptId"`)
}

func TestMemoryImportAttemptReport(t *testing.T) {
	attemptID := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	userID := testMemoryUserID
	completed := testMemoryTime
	attempt := dictionaryRowStep("from memory_import_attempts a left join users",
		attemptID, testMemoryOrgID, testMemoryID, &userID, "completed", "csv",
		[]byte(`{}`), nil, nil, "abc", []byte(`{"imported":1}`), nil, false, "available", nil, nil, testMemoryTime, &completed, strPtr("Ada"),
	)
	attempt.args = []any{attemptID, testMemoryID, testMemoryOrgID}
	diags := dictionaryDBStep{kind: "query", sql: "from memory_import_attempt_diagnostics", values: [][]any{{
		"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "warning", "skipped_unit", "skipped", nil, nil, testMemoryTime,
	}}}
	diags.args = []any{attemptID}
	api, _ := memoryTestAPI(t, "admin", memoryOwnedStep(), attempt, diags)
	rec := memoryRequestForTest(api, "GET", testMemoryBase+"/"+testMemoryID+"/import-attempts/"+attemptID+"/report", "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "json")
	require.Contains(t, rec.Header().Get("Content-Disposition"), "attachment")
	require.Contains(t, rec.Body.String(), attemptID)
}

func TestMemoryImportForbiddenForMember(t *testing.T) {
	owned := dictionaryRowStep("m.id=$1 and", memoryRecordValues()...)
	owned.args = []any{testMemoryID, testMemoryOrgID, testMemoryUserID, false}
	api, _ := memoryTestAPI(t, "member", owned)
	body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour"}`
	rec := memoryRequestForTest(api, "POST", testMemoryBase+"/"+testMemoryID+"/entries/import", body)
	require.Equal(t, 403, rec.Code)
}

func TestNormalizeMemorySourceTextBenchCases(t *testing.T) {
	require.Equal(t, "a b", normalizeMemorySourceText("\u00a0A\t  B\n"))
	require.Equal(t, "", normalizeMemorySourceText("   "))
}
