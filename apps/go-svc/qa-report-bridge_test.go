package main

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBuildQaFindingExternalRef(t *testing.T) {
	short := buildQaFindingExternalRef(
		"proj_1",
		"11111111-1111-4111-8111-111111111111",
		"hello",
		"placeholder_mismatch",
		"de-DE",
	)
	require.Equal(t, "qa:proj_1:11111111-1111-4111-8111-111111111111:hello:placeholder_mismatch:de-DE", short)

	base := buildQaFindingExternalRef("proj_1", "11111111-1111-4111-8111-111111111111", "hello", "not_localized", "de-DE")
	otherLocale := buildQaFindingExternalRef("proj_1", "11111111-1111-4111-8111-111111111111", "hello", "not_localized", "fr-FR")
	require.NotEqual(t, base, otherLocale)

	longKey := strings.Repeat("k", 600)
	hashed := buildQaFindingExternalRef("proj_1", "11111111-1111-4111-8111-111111111111", longKey, "length", "en-US")
	require.True(t, strings.HasPrefix(hashed, "qa:proj_1:11111111-1111-4111-8111-111111111111:"))
	require.LessOrEqual(t, len(hashed), 512)
}

func TestBuildTranslationQaFindingHref(t *testing.T) {
	href := buildTranslationQaFindingHref("acme", "project/a", nil, "fr-FR", "hello")
	require.Contains(t, href, "/org/acme/projects/project%2Fa/files/content-editor")
	require.Contains(t, href, "locale=fr-FR")
	require.Contains(t, href, "segment=hello")
	require.Contains(t, href, "sourcePath=%2A")
}

func TestBuildQaFindingIssueMetadata(t *testing.T) {
	meta := buildQaFindingIssueMetadata("run", "finding", "glossary_violation", "warning", "/org/acme/projects/p/files/content-editor")
	require.Equal(t, map[string]any{
		"qaFinding": map[string]string{
			"runId":      "run",
			"findingId":  "finding",
			"checkType":  "glossary_violation",
			"severity":   "warning",
			"editorHref": "/org/acme/projects/p/files/content-editor",
		},
	}, meta)
}

func TestBuildQaFindingIssueTitleTruncates(t *testing.T) {
	title := buildQaFindingIssueTitle("not_localized", strings.Repeat("segment-key", 40), "de-DE")
	require.LessOrEqual(t, len(title), 300)
	require.True(t, strings.HasSuffix(title, "..."))
}

func TestParseFindingIDs(t *testing.T) {
	id := uuid.New()
	parsed, err := parseFindingIDs([]string{id.String(), id.String()})
	require.NoError(t, err)
	require.Len(t, parsed, 1)

	_, err = parseFindingIDs([]string{"not-a-uuid"})
	require.Error(t, err)

	_, err = parseFindingIDs(nil)
	require.Error(t, err)
}
