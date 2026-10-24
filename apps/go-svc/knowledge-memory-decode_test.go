package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func knowledgeMemoryJSONRequest(body string) *http.Request {
	return httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
}

func TestDecodeKnowledgeMemoryPreview(t *testing.T) {
	payload, err := decodeKnowledgeMemoryPreview(knowledgeMemoryJSONRequest(`{
		"targetLocale":" fr-FR ",
		"sourceLocale":" en ",
		"sourceText":" payment confirmation ",
		"context":" keep spaces ",
		"key":" checkout.title ",
		"path":" locales/en.json ",
		"targetLocales":[" de-DE "," ja "],
		"metadata":{"brand":"Hyperlocalise"},
		"maxChars":512
	}`))
	require.NoError(t, err)
	require.Equal(t, "fr-FR", *payload.TargetLocale)
	require.Equal(t, "en", *payload.SourceLocale)
	require.Equal(t, "payment confirmation", *payload.SourceText)
	require.Equal(t, " keep spaces ", *payload.Context)
	require.Equal(t, []string{"de-DE", "ja"}, payload.TargetLocales)
	require.Equal(t, "Hyperlocalise", payload.Metadata["brand"])
	require.Equal(t, 512, *payload.MaxChars)

	empty, err := decodeKnowledgeMemoryPreview(knowledgeMemoryJSONRequest(`{}`))
	require.NoError(t, err)
	require.Nil(t, empty.TargetLocale)
	require.Nil(t, empty.TargetLocales)

	minChars, err := decodeKnowledgeMemoryPreview(knowledgeMemoryJSONRequest(`{"maxChars":256}`))
	require.NoError(t, err)
	require.Equal(t, 256, *minChars.MaxChars)
	maxChars, err := decodeKnowledgeMemoryPreview(knowledgeMemoryJSONRequest(`{"maxChars":4000}`))
	require.NoError(t, err)
	require.Equal(t, 4000, *maxChars.MaxChars)

	tooManyLocales := `{"targetLocales":["` + strings.Join(repeatJSONStrings("fr", 21), `","`) + `"]}`
	tooManyMetadata := knowledgeMemoryMetadataJSON(51, "k", "v")
	longMetadataKey := knowledgeMemoryMetadataJSON(1, strings.Repeat("k", 101), "v")
	longMetadataValue := knowledgeMemoryMetadataJSON(1, "brand", strings.Repeat("v", 1001))

	for _, body := range []string{
		``,
		`null`,
		`{}{}`,
		`{"targetLocale":null}`,
		`{"targetLocale":""}`,
		`{"targetLocales":[]}`,
		`{"targetLocales":["", "fr"]}`,
		`{"metadata":{"brand":null}}`,
		`{"maxChars":255}`,
		`{"maxChars":4001}`,
		tooManyLocales,
		tooManyMetadata,
		longMetadataKey,
		longMetadataValue,
		`{"sourceText":"` + strings.Repeat("x", 100001) + `"}`,
	} {
		_, err := decodeKnowledgeMemoryPreview(knowledgeMemoryJSONRequest(body))
		var kmErr *knowledgeMemoryError
		require.ErrorAs(t, err, &kmErr, body)
		require.Equal(t, 400, kmErr.status, body)
		require.Equal(t, "invalid_knowledge_memory_preview_payload", kmErr.code, body)
	}
}

func TestDecodeKnowledgeMemoryUpdate(t *testing.T) {
	summary := "Keep the voice practical."
	payload, err := decodeKnowledgeMemoryUpdate(knowledgeMemoryJSONRequest(`{
		"content":"Use Australian English.  \n",
		"summary":" Keep the voice practical. "
	}`))
	require.NoError(t, err)
	require.Equal(t, "Use Australian English.", payload.Content)
	require.Equal(t, summary, *payload.Summary)

	for _, body := range []string{
		``,
		`{"summary":"ok"}`,
		`{"content":null}`,
		`{"content":123}`,
		`{"content":"ok","summary":null}`,
		`{"content":"ok","summary":"   "}`,
		`{"content":"` + strings.Repeat("x", knowledgeMemoryMaxContent+1) + `"}`,
		`{"content":"ok","summary":"` + strings.Repeat("s", knowledgeMemoryMaxSummary+1) + `"}`,
	} {
		_, err := decodeKnowledgeMemoryUpdate(knowledgeMemoryJSONRequest(body))
		var kmErr *knowledgeMemoryError
		require.ErrorAs(t, err, &kmErr, body)
		require.Equal(t, 400, kmErr.status, body)
		require.Equal(t, "invalid_knowledge_memory_payload", kmErr.code, body)
	}
}

func repeatJSONStrings(value string, n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = value
	}
	return out
}

func knowledgeMemoryMetadataJSON(count int, key, value string) string {
	fields := make([]string, 0, count)
	for i := 0; i < count; i++ {
		fields = append(fields, `"`+key+string(rune('A'+i%26))+strings.Repeat("x", i/26)+`":"`+value+`"`)
	}
	if count == 1 {
		return `{"metadata":{"` + key + `":"` + value + `"}}`
	}
	return `{"metadata":{` + strings.Join(fields, ",") + `}}`
}

func TestNormalizeKnowledgeMemoryContent(t *testing.T) {
	require.Equal(t, "Keep this", normalizeKnowledgeMemoryContent("Keep this \r\n\t\ufeff"))
	require.Equal(t, "", normalizeKnowledgeMemoryContent(" \ufeff"))
}
