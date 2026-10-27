package main

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestMemoryEntryListFiltersAndCursor(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	memoryID := scope.MustMemory(t, "", "Product TM")
	hello := mustMemoryEntry(t, scope, memoryID, "en-US", "fr-FR", "Hello", "Bonjour")
	world := mustMemoryEntry(t, scope, memoryID, "en-US", "de-DE", "World", "Welt")
	same := mustMemoryEntry(t, scope, memoryID, "en-US", "es-ES", "Same", "Same")
	_, err := scope.Pool.Exec(t.Context(), `
        update memory_entries
        set created_at=$2::timestamptz, updated_at=$2::timestamptz, review_status='pending'
        where id=$1`, hello, time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        update memory_entries
        set created_at=$2::timestamptz, updated_at=$2::timestamptz, provenance='import'
        where id=$1`, world, time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        update memory_entries
        set created_at=$2::timestamptz, updated_at=$2::timestamptz
        where id=$1`, same, time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC))
	require.NoError(t, err)

	list := func(query string) []string {
		t.Helper()
		rec := memoryRequest(api, scope, http.MethodGet, scope.OrgPath("/translation-memories/"+memoryID+"/entries")+query, "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		var body struct {
			MemoryEntries []struct {
				ID string `json:"id"`
			} `json:"memoryEntries"`
			NextCursor *string `json:"nextCursor"`
			Total      int     `json:"total"`
			Pagination struct {
				HasMore bool `json:"hasMore"`
			} `json:"pagination"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		ids := make([]string, 0, len(body.MemoryEntries))
		for _, entry := range body.MemoryEntries {
			ids = append(ids, entry.ID)
		}
		return ids
	}

	require.Equal(t, []string{same, world, hello}, list(""))
	require.Equal(t, []string{hello}, list("?search=Hello"))
	require.Equal(t, []string{world}, list("?targetLocale=de-DE"))
	require.Equal(t, []string{hello}, list("?reviewStatus=pending"))
	require.Equal(t, []string{same}, list("?sameAsSource=true"))
	require.Equal(t, []string{world}, list("?origin=import"))

	rec := memoryRequest(api, scope, http.MethodGet, scope.OrgPath("/translation-memories/"+memoryID+"/entries?limit=1"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	var firstPage struct {
		MemoryEntries []struct {
			ID string `json:"id"`
		} `json:"memoryEntries"`
		NextCursor *string `json:"nextCursor"`
		Pagination struct {
			HasMore bool `json:"hasMore"`
		} `json:"pagination"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &firstPage))
	require.Equal(t, []string{same}, []string{firstPage.MemoryEntries[0].ID})
	require.True(t, firstPage.Pagination.HasMore)
	require.NotNil(t, firstPage.NextCursor)

	second := list("?limit=1&cursor=" + *firstPage.NextCursor)
	require.Equal(t, []string{world}, second)

	bad := memoryRequest(api, scope, http.MethodGet, scope.OrgPath("/translation-memories/"+memoryID+"/entries?cursor=not-a-cursor"), "")
	require.Equal(t, 400, bad.Code, bad.Body.String())
	require.Contains(t, bad.Body.String(), "invalid_cursor")

	mismatch := memoryRequest(api, scope, http.MethodGet, scope.OrgPath("/translation-memories/"+memoryID+"/entries?search=Hello&cursor="+*firstPage.NextCursor), "")
	require.Equal(t, 400, mismatch.Code, mismatch.Body.String())
	require.Contains(t, mismatch.Body.String(), "invalid_cursor")
}

func TestMemoryEntryDetailAndPatch(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	memoryID := scope.MustMemory(t, "", "Product TM")
	entryID := mustMemoryEntry(t, scope, memoryID, "en-US", "fr-FR", "Hello", "Bonjour")
	variantID := mustMemoryEntry(t, scope, memoryID, "en-US", "de-DE", "Hello", "Hallo")

	rec := memoryRequest(api, scope, http.MethodGet, scope.OrgPath("/translation-memories/"+memoryID+"/entries/"+entryID), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	var detail struct {
		MemoryEntry struct {
			ID string `json:"id"`
		} `json:"memoryEntry"`
		Provenance struct {
			Origin  string  `json:"origin"`
			Context *string `json:"context"`
		} `json:"provenance"`
		Variants []struct {
			ID string `json:"id"`
		} `json:"variants"`
		AuditEvents []struct {
			EventType string `json:"eventType"`
		} `json:"auditEvents"`
		Capabilities struct {
			CanEdit bool `json:"canEdit"`
		} `json:"capabilities"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &detail))
	require.Equal(t, entryID, detail.MemoryEntry.ID)
	require.Equal(t, "manual", detail.Provenance.Origin)
	require.True(t, detail.Capabilities.CanEdit)
	require.NotEmpty(t, detail.AuditEvents)
	require.Equal(t, variantID, detail.Variants[0].ID)

	patch := memoryRequest(api, scope, http.MethodPatch, scope.OrgPath("/translation-memories/"+memoryID+"/entries/"+entryID), `{"expectedVersion":1,"targetText":"Salut","metadata":{"context":"greeting"}}`)
	require.Equal(t, 200, patch.Code, patch.Body.String())
	require.Contains(t, patch.Body.String(), `"context":"greeting"`)
	require.Contains(t, patch.Body.String(), `"capabilities"`)
	require.Contains(t, patch.Body.String(), `"Salut"`)
}

func TestMemoryEntryPatchAuditAndReview(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	memoryID := scope.MustMemory(t, "", "Product TM")
	entryID := mustMemoryEntry(t, scope, memoryID, "en-US", "fr-FR", "Hello", "Bonjour")
	path := scope.OrgPath("/translation-memories/" + memoryID + "/entries/" + entryID)

	type eventRow struct {
		EventType     string
		ChangedFields []string
	}
	events := func() []eventRow {
		t.Helper()
		rows, err := scope.Pool.Query(t.Context(), `select event_type, changed_fields from memory_entry_events where memory_entry_id=$1 order by occurred_at, id`, entryID)
		require.NoError(t, err)
		defer rows.Close()
		out := []eventRow{}
		for rows.Next() {
			var row eventRow
			require.NoError(t, rows.Scan(&row.EventType, &row.ChangedFields))
			out = append(out, row)
		}
		require.NoError(t, rows.Err())
		return out
	}
	reviewer := func() *string {
		t.Helper()
		var reviewedBy *string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select reviewed_by_user_id::text from memory_entries where id=$1`, entryID).Scan(&reviewedBy))
		return reviewedBy
	}

	content := memoryRequest(api, scope, http.MethodPatch, path, `{"expectedVersion":1,"targetText":"Salut","reviewStatus":"approved"}`)
	require.Equal(t, 200, content.Code, content.Body.String())
	require.Nil(t, reviewer(), "unchanged reviewStatus must not stamp a reviewer")
	require.Equal(t, []eventRow{
		{EventType: "created", ChangedFields: []string{"sourceLocale", "targetLocale", "sourceText", "targetText"}},
		{EventType: "updated", ChangedFields: []string{"targetText"}},
	}, events())

	noop := memoryRequest(api, scope, http.MethodPatch, path, `{"expectedVersion":2,"targetText":"Salut","reviewStatus":"approved"}`)
	require.Equal(t, 200, noop.Code, noop.Body.String())
	require.Contains(t, noop.Body.String(), `"version":2`)
	require.Len(t, events(), 2)

	review := memoryRequest(api, scope, http.MethodPatch, path, `{"expectedVersion":2,"reviewStatus":"rejected"}`)
	require.Equal(t, 200, review.Code, review.Body.String())
	require.NotNil(t, reviewer())
	require.Equal(t, scope.UserID, *reviewer())
	got := events()
	require.Len(t, got, 3)
	require.Equal(t, eventRow{EventType: "reviewed", ChangedFields: []string{"reviewStatus"}}, got[2])

	var detail struct {
		AuditEvents []struct {
			EventType string `json:"eventType"`
		} `json:"auditEvents"`
	}
	require.NoError(t, json.Unmarshal(review.Body.Bytes(), &detail))
	require.Len(t, detail.AuditEvents, 3)
	require.Equal(t, "reviewed", detail.AuditEvents[2].EventType)
}

func TestMemoryEntryPatchDuplicate(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	memoryID := scope.MustMemory(t, "", "Product TM")
	mustMemoryEntry(t, scope, memoryID, "en-US", "fr-FR", "Hello", "Bonjour")
	entryID := mustMemoryEntry(t, scope, memoryID, "en-US", "fr-FR", "World", "Monde")

	rec := memoryRequest(api, scope, http.MethodPatch, scope.OrgPath("/translation-memories/"+memoryID+"/entries/"+entryID), `{"expectedVersion":1,"sourceText":"  hello "}`)
	require.Equal(t, 409, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "duplicate_memory_entry")

	var version int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select version from memory_entries where id=$1`, entryID).Scan(&version))
	require.Equal(t, 1, version)
}
