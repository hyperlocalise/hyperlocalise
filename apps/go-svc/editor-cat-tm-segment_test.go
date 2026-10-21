package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEditorCatTmSegmentGetAndPatch(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	memoryID := scope.MustMemory(t, "", "Product TM")
	mustAttachMemory(t, scope, scope.ProjectID, memoryID)
	frenchID := mustMemoryEntry(t, scope, memoryID, "en", "fr", "Good morning.", "Bonjour.")
	germanID := mustMemoryEntry(t, scope, memoryID, "en", "de", "Good morning.", "Guten Morgen.")

	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/tm-segments/"+frenchID), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var got editorCatTmSegmentResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, "en", got.TmSegment.Source.Locale)
	require.Equal(t, "Good morning.", got.TmSegment.Source.Text)
	require.Len(t, got.TmSegment.Records, 3)

	patch := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/tm-segments/"+frenchID), `{
        "sourceText":"Good morning!",
        "records":[
            {"id":"`+frenchID+`","text":"Bonjour !","expectedVersion":`+itoa(got.recordVersion(frenchID))+`},
            {"id":"`+germanID+`","text":"Guten Morgen.","expectedVersion":`+itoa(got.recordVersion(germanID))+`}
        ]
    }`)
	require.Equal(t, http.StatusOK, patch.Code, patch.Body.String())
	require.NoError(t, json.Unmarshal(patch.Body.Bytes(), &got))
	require.Equal(t, "Good morning!", got.TmSegment.Source.Text)
	require.Equal(t, "Bonjour !", got.recordText(frenchID))

	var stored string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select source_text from memory_entries where id=$1`, germanID).Scan(&stored))
	require.Equal(t, "Good morning!", stored)
}

func TestEditorCatTmSegmentDeleteLocale(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	memoryID := scope.MustMemory(t, "", "Product TM")
	mustAttachMemory(t, scope, scope.ProjectID, memoryID)
	frenchID := mustMemoryEntry(t, scope, memoryID, "en", "fr", "Hello", "Bonjour")
	germanID := mustMemoryEntry(t, scope, memoryID, "en", "de", "Hello", "Hallo")

	rec := editorCatRequestScope(api, scope, http.MethodDelete, editorCatPathFor(scope, "/files/detail/cat/tm-segments/"+frenchID+"/records/"+germanID), "")
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	var remaining int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from memory_entries where memory_id=$1`, memoryID).Scan(&remaining))
	require.Equal(t, 1, remaining)
}

func TestEditorCatTmSegmentRejectsMemberAndUnattached(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	memoryID := scope.MustMemory(t, "", "Product TM")
	mustAttachMemory(t, scope, scope.ProjectID, memoryID)
	entryID := mustMemoryEntry(t, scope, memoryID, "en", "fr", "Hello", "Bonjour")
	rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/tm-segments/"+entryID), `{"sourceText":"Hello","records":[{"id":"`+entryID+`","text":"Salut","expectedVersion":1}]}`)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	translator, translatorScope := editorCatTestAPI(t, "translator")
	foreign := mustMemoryEntry(t, translatorScope, translatorScope.MustMemory(t, "", "Other TM"), "en", "fr", "Hello", "Bonjour")
	missing := editorCatRequestScope(translator, translatorScope, http.MethodGet, editorCatPathFor(translatorScope, "/files/detail/cat/tm-segments/"+foreign), "")
	require.Equal(t, http.StatusNotFound, missing.Code, missing.Body.String())
}

func TestEditorCatTmSegmentStaleVersion(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	memoryID := scope.MustMemory(t, "", "Product TM")
	mustAttachMemory(t, scope, scope.ProjectID, memoryID)
	entryID := mustMemoryEntry(t, scope, memoryID, "en", "fr", "Hello", "Bonjour")
	rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/tm-segments/"+entryID), `{"sourceText":"Hello","records":[{"id":"`+entryID+`","text":"Salut","expectedVersion":99}]}`)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "stale_memory_entry")
}

type editorCatTmSegmentResponse struct {
	TmSegment editorCatTmSegment `json:"tmSegment"`
}

func (body editorCatTmSegmentResponse) recordVersion(id string) int {
	for _, record := range body.TmSegment.Records {
		if record.ID == id && !record.IsSource {
			return record.Version
		}
	}
	return 0
}

func (body editorCatTmSegmentResponse) recordText(id string) string {
	for _, record := range body.TmSegment.Records {
		if record.ID == id && !record.IsSource {
			return record.Text
		}
	}
	return ""
}
