package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEditorCatTargetsRectangle(t *testing.T) {
	id, text, status, revision := testEditorCatTranslationID, "Bonjour", "approved", "2026-09-25 00:00:00+00"
	api := editorCatTestAPI(t, "translator", editorCatProjectStep("native"), dictionaryDBStep{
		kind: "query", sql: "with requested as", values: [][]any{
			{1, "fr", &id, &text, &status, "text", (*string)(nil), &revision},
			{1, "de", (*string)(nil), (*string)(nil), (*string)(nil), "text", (*string)(nil), (*string)(nil)},
		},
	})
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/targets"),
		`{"segments":[{"externalStringId":"`+testEditorCatKeyID+`","sourcePath":"a.json"}],"targetLocales":["fr","de"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Targets []editorCatTargetRow `json:"targets"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Targets, 1)
	require.Equal(t, text, body.Targets[0].Targets["fr"].Text)
	require.True(t, body.Targets[0].Targets["fr"].IsApproved)
	require.Nil(t, body.Targets[0].Targets["de"])
}

func TestEditorCatTargetsInaccessibleKey(t *testing.T) {
	api := editorCatTestAPI(t, "member", editorCatProjectStep("native"), dictionaryDBStep{kind: "query", sql: "with requested as", values: [][]any{}})
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/targets"),
		`{"segments":[{"externalStringId":"`+testEditorCatKeyID+`","sourcePath":"a.json"}],"targetLocales":["fr"]}`)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestEditorCatTargetsValidation(t *testing.T) {
	validSegment := editorCatTargetIdentity{ExternalStringID: testEditorCatKeyID, SourcePath: "a.json"}
	for _, tc := range []struct {
		name string
		body editorCatTargetsBody
	}{
		{"empty", editorCatTargetsBody{}},
		{"duplicate locale", editorCatTargetsBody{[]editorCatTargetIdentity{validSegment}, []string{"fr", "fr"}}},
		{"invalid key", editorCatTargetsBody{[]editorCatTargetIdentity{{"not-uuid", "a.json"}}, []string{"fr"}}},
		{"long locale", editorCatTargetsBody{[]editorCatTargetIdentity{validSegment}, []string{strings.Repeat("x", 33)}}},
		{"too many cells", editorCatTargetsBody{make([]editorCatTargetIdentity, 50), []string{"a", "b", "c", "d", "e"}}},
	} {
		t.Run(tc.name, func(t *testing.T) { require.Error(t, tc.body.validate()) })
	}
}
