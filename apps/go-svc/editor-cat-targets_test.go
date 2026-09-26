package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEditorCatTargetsRectangle(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "approved")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/targets"),
		`{"segments":[{"externalStringId":"`+keyID+`","sourcePath":"a.json"}],"targetLocales":["fr","de"]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Targets []editorCatTargetRow `json:"targets"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Targets, 1)
	require.Equal(t, "Bonjour", body.Targets[0].Targets["fr"].Text)
	require.True(t, body.Targets[0].Targets["fr"].IsApproved)
	require.Nil(t, body.Targets[0].Targets["de"])
}

func TestEditorCatTargetsInaccessibleKey(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/targets"),
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
		{"duplicate segment", editorCatTargetsBody{
			[]editorCatTargetIdentity{validSegment, {testEditorCatKeyID, "a.json"}},
			[]string{"fr"},
		}},
		{"invalid key", editorCatTargetsBody{[]editorCatTargetIdentity{{"not-uuid", "a.json"}}, []string{"fr"}}},
		{"blank key", editorCatTargetsBody{[]editorCatTargetIdentity{{"  ", "a.json"}}, []string{"fr"}}},
		{"blank path", editorCatTargetsBody{[]editorCatTargetIdentity{{testEditorCatKeyID, "  "}}, []string{"fr"}}},
		{"long locale", editorCatTargetsBody{[]editorCatTargetIdentity{validSegment}, []string{strings.Repeat("x", 33)}}},
		{"too many locales", editorCatTargetsBody{
			[]editorCatTargetIdentity{validSegment},
			[]string{"a", "b", "c", "d", "e", "f", "g", "h", "i"},
		}},
		{"too many segments", editorCatTargetsBody{make([]editorCatTargetIdentity, 51), []string{"fr"}}},
		{"too many cells", editorCatTargetsBody{make([]editorCatTargetIdentity, 50), []string{"a", "b", "c", "d", "e"}}},
	} {
		t.Run(tc.name, func(t *testing.T) { require.Error(t, tc.body.validate()) })
	}

	segments := make([]editorCatTargetIdentity, 50)
	for i := range segments {
		segments[i] = editorCatTargetIdentity{
			ExternalStringID: fmt.Sprintf("bbbbbbbb-bbbb-4bbb-8bbb-%012d", i),
			SourcePath:       "a.json",
		}
	}
	for _, tc := range []struct {
		name string
		body editorCatTargetsBody
	}{
		{"text uuid", editorCatTargetsBody{[]editorCatTargetIdentity{validSegment}, []string{"fr"}}},
		{"trims padded identity", editorCatTargetsBody{
			[]editorCatTargetIdentity{{" " + testEditorCatKeyID + " ", " a.json "}},
			[]string{" fr "},
		}},
		{"whole-file binary id", editorCatTargetsBody{
			[]editorCatTargetIdentity{{"binary:hero.png", "hero.png"}},
			[]string{"fr"},
		}},
		{"exact cell budget", editorCatTargetsBody{segments, []string{"a", "b", "c", "d"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, tc.body.validate())
			require.Equal(t, strings.TrimSpace(tc.body.TargetLocales[0]), tc.body.TargetLocales[0])
		})
	}
}
