package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

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
	api, scope := memoryTestAPI(t, "admin")
	id := scope.MustMemory(t, "", "Product TM")
	mustMemoryEntry(t, scope, id, "en-US", "fr-FR", "Hello", "Bonjour")
	rec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=csv"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "text/csv")
	require.Contains(t, rec.Body.String(), "source_locale")
	require.Contains(t, rec.Body.String(), "Bonjour")
}

func TestMemoryExportCSVEscapesFormulas(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	id := scope.MustMemory(t, "", "Product TM")
	mustMemoryEntry(t, scope, id, "en-US", "fr-FR", "=1+1", "@SUM(A1)")
	rec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=csv"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	body := rec.Body.String()
	require.Contains(t, body, glossaryCSVFormulaEscapePrefix+"=1+1")
	require.Contains(t, body, glossaryCSVFormulaEscapePrefix+"@SUM(A1)")
	candidates := parseMemoryCSV(body)
	require.Len(t, candidates, 1)
	require.Equal(t, "=1+1", candidates[0].SourceText)
	require.Equal(t, "@SUM(A1)", candidates[0].TargetText)
}

func TestMemoryImportApply(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	id := scope.MustMemory(t, "", "Product TM")
	body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour"}`
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), body)
	require.Equal(t, 201, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"imported":1`)
	require.Contains(t, rec.Body.String(), `"importAttemptId"`)
}

func TestMemoryImportAttemptReport(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	id := scope.MustMemory(t, "", "Product TM")
	body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour"}`
	importRec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), body)
	require.Equal(t, 201, importRec.Code, importRec.Body.String())
	var payload struct {
		ImportAttemptID string `json:"importAttemptId"`
	}
	require.NoError(t, json.Unmarshal(importRec.Body.Bytes(), &payload))
	require.NotEmpty(t, payload.ImportAttemptID)
	rec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/import-attempts/"+payload.ImportAttemptID+"/report"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "json")
	require.Contains(t, rec.Header().Get("Content-Disposition"), "attachment")
	require.Contains(t, rec.Body.String(), payload.ImportAttemptID)
}

func TestMemoryImportForbiddenForMember(t *testing.T) {
	api, scope := memoryTestAPI(t, "member")
	id := scope.MustMemory(t, "", "Product TM")
	body := `{"format":"csv","content":"source_locale,target_locale,source_text,target_text\nen-US,fr-FR,Hello,Bonjour"}`
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), body)
	require.Equal(t, 403, rec.Code)
}
