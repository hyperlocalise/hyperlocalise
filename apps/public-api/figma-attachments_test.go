package main

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeFigmaStore struct {
	figmaErr        error
	figmaItems      []figmaAttachment
	figmaItem       figmaAttachment
	figmaCreateURL  string
	figmaFilters    figmaAttachmentFilters
	figmaID         string
	figmaSelector   stringSelector
	figmaDeleted    bool
	figmaStrings    []figmaAttachmentString
	figmaTotal      int
	figmaLinkResult int
}

func (s *fakeFigmaStore) listFigmaAttachments(_ context.Context, _ principal, _ string, filters figmaAttachmentFilters) ([]figmaAttachment, int, error) {
	s.figmaFilters = filters
	return s.figmaItems, s.figmaTotal, s.figmaErr
}

func (s *fakeFigmaStore) getFigmaAttachment(_ context.Context, _ principal, _, id string) (figmaAttachment, error) {
	s.figmaID = id
	return s.figmaItem, s.figmaErr
}

func (s *fakeFigmaStore) createFigmaAttachment(_ context.Context, _ principal, _, rawURL string) (figmaAttachment, error) {
	s.figmaCreateURL = rawURL
	return s.figmaItem, s.figmaErr
}

func (s *fakeFigmaStore) deleteFigmaAttachment(_ context.Context, _ principal, _, id string) error {
	s.figmaID = id
	s.figmaDeleted = s.figmaErr == nil
	return s.figmaErr
}

func (s *fakeFigmaStore) listFigmaAttachmentStrings(_ context.Context, _ principal, _, id string, _, _ int) ([]figmaAttachmentString, int, error) {
	s.figmaID = id
	return s.figmaStrings, s.figmaTotal, s.figmaErr
}

func (s *fakeFigmaStore) linkFigmaAttachmentStrings(_ context.Context, _ principal, _, id string, sel stringSelector) (int, error) {
	s.figmaID, s.figmaSelector = id, sel
	return s.figmaLinkResult, s.figmaErr
}

func (s *fakeFigmaStore) unlinkFigmaAttachmentStrings(_ context.Context, _ principal, _, id string, sel stringSelector) (int, error) {
	s.figmaID, s.figmaSelector = id, sel
	return s.figmaLinkResult, s.figmaErr
}

func developerPrincipal() principal {
	p := resourcePrincipal(writeScopes...)
	p.Role = "developer"
	return p
}

func TestParseFigmaURL(t *testing.T) {
	cases := []struct {
		raw     string
		fileKey string
		nodeID  string
		ok      bool
	}{
		{"https://www.figma.com/design/AbC123/Futures-page?node-id=12-345&t=x", "AbC123", "12:345", true},
		{"https://figma.com/file/AbC123/Futures", "AbC123", "", true},
		{"https://www.figma.com/proto/AbC123/Futures?node-id=1%3A2", "AbC123", "1:2", true},
		{"https://www.figma.com/design/AbC123/branch/Br4nch/Futures", "Br4nch", "", true},
		{"https://www.figma.com/board/AbC123/Flow", "AbC123", "", true},
		{"http://www.figma.com/design/AbC123/Futures", "", "", false},
		{"https://figma.com.evil.test/design/AbC123/Futures", "", "", false},
		{"https://www.figma.com/community/file/123", "", "", false},
		{"https://www.figma.com/design/", "", "", false},
		{"https://www.figma.com/design/bad-key!/x", "", "", false},
		{"https://www.figma.com/design/AbC123/x?node-id=<script>", "", "", false},
		{"https://user:pw@www.figma.com/design/AbC123/x", "", "", false},
		{"not a url", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			link, err := parseFigmaURL(tc.raw)
			if !tc.ok {
				require.ErrorIs(t, err, errFigmaAttachmentInvalidURL)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.fileKey, link.FileKey)
			if tc.nodeID == "" {
				require.Nil(t, link.NodeID)
			} else {
				require.Equal(t, tc.nodeID, *link.NodeID)
			}
		})
	}
}

func TestFigmaAttachmentRoutes(t *testing.T) {
	const base = "/v1/projects/project-1/figma-attachments"
	const attachmentID = "AbC123.12-345"

	t.Run("lists attachments with a string filter", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaItems = []figmaAttachment{{ID: attachmentID, URL: "https://www.figma.com/design/AbC/x", FileKey: "AbC", StringCount: 2}}
		store.figmaTotal = 1
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet,
			base+"?stringId=22222222-2222-2222-2222-222222222222&limit=10", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "22222222-2222-2222-2222-222222222222", store.figmaFilters.StringID)
		require.Equal(t, 10, store.figmaFilters.Limit)
		require.Contains(t, w.Body.String(), `"figmaAttachments":[{"id":"`+attachmentID+`"`)
		require.Contains(t, w.Body.String(), `"stringCount":2`)
		require.Contains(t, w.Body.String(), `"pagination":{"offset":0,"limit":10,"total":1}`)
	})

	t.Run("rejects a malformed string filter", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet, base+"?stringId=nope", "")
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), `"error":"invalid_query"`)
	})

	t.Run("creates an attachment", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaItem = figmaAttachment{ID: attachmentID}
		w := sendResource(t, developerPrincipal(), store, http.MethodPost, base,
			`{"url":"  https://www.figma.com/design/AbC123/x?node-id=12-345  "}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "https://www.figma.com/design/AbC123/x?node-id=12-345", store.figmaCreateURL)
		require.Contains(t, w.Body.String(), `"figmaAttachment":{"id":"`+attachmentID+`"`)
	})

	t.Run("create takes only url", func(t *testing.T) {
		w := sendResource(t, developerPrincipal(), &fakeResourceStore{}, http.MethodPost, base, `{"url":"https://www.figma.com/design/AbC/x","name":"x"}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("maps an invalid url", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaErr = errFigmaAttachmentInvalidURL
		w := sendResource(t, developerPrincipal(), store, http.MethodPost, base, `{"url":"https://example.com"}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), `"error":"invalid_figma_url"`)
	})

	t.Run("writes need an editing role", func(t *testing.T) {
		translator := resourcePrincipal(effectivePermissions([]string{"files:read", "files:write"}, "translator")...)
		translator.Role = "translator"
		store := &fakeResourceStore{}
		w := sendResource(t, translator, store, http.MethodPost, base, `{"url":"https://www.figma.com/design/AbC/x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Empty(t, store.figmaCreateURL)
	})

	t.Run("writes need strings:write", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodPost, base, `{"url":"https://www.figma.com/design/AbC/x"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), "strings:write")
	})

	t.Run("gets and deletes an attachment", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaItem = figmaAttachment{ID: attachmentID}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, base+"/"+attachmentID, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, attachmentID, store.figmaID)

		w = sendResource(t, developerPrincipal(), store, http.MethodDelete, base+"/"+attachmentID, "")
		require.Equal(t, http.StatusNoContent, w.Code, w.Body.String())
		require.True(t, store.figmaDeleted)
	})

	t.Run("missing attachment is 404", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaErr = errFigmaAttachmentNotFound
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, base+"/"+attachmentID, "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), `"error":"figma_attachment_not_found"`)
	})

	t.Run("external projects are refused", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaErr = errProjectNotNative
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, base, "")
		require.Equal(t, http.StatusConflict, w.Code)
		require.Contains(t, w.Body.String(), `"error":"project_not_native"`)
	})

	t.Run("links strings by key", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaLinkResult = 2
		w := sendResource(t, developerPrincipal(), store, http.MethodPost, base+"/"+attachmentID+"/strings",
			`{"keys":["home.title","home.cta"]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.JSONEq(t, `{"linked":2}`, w.Body.String())
		require.Equal(t, []string{"home.title", "home.cta"}, store.figmaSelector.Keys)
	})

	t.Run("unlinks strings by tag", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaLinkResult = 1
		w := sendResource(t, developerPrincipal(), store, http.MethodDelete, base+"/"+attachmentID+"/strings", `{"tags":["req-1042"]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.JSONEq(t, `{"unlinked":1}`, w.Body.String())
	})

	t.Run("link needs one selector", func(t *testing.T) {
		w := sendResource(t, developerPrincipal(), &fakeResourceStore{}, http.MethodPost, base+"/"+attachmentID+"/strings",
			`{"keys":["a"],"stringIds":["22222222-2222-2222-2222-222222222222"]}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("link reports unmatched strings", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaErr = errNoStringsMatched
		w := sendResource(t, developerPrincipal(), store, http.MethodPost, base+"/"+attachmentID+"/strings", `{"keys":["missing"]}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), `"error":"no_strings_matched"`)
	})

	t.Run("lists linked strings", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.figmaStrings = []figmaAttachmentString{{ID: "s-1", Key: "home.title"}}
		store.figmaTotal = 1
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, base+"/"+attachmentID+"/strings", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"strings":[{"id":"s-1","key":"home.title","filePath":null,"designUrl":""}]`)
	})

	t.Run("names its methods", func(t *testing.T) {
		w := sendResource(t, developerPrincipal(), &fakeResourceStore{}, http.MethodPatch, base+"/"+attachmentID, "")
		require.Equal(t, http.StatusMethodNotAllowed, w.Code)
		require.Equal(t, "GET, HEAD, DELETE", w.Header().Get("Allow"))
	})
}

func TestFigmaAttachmentIDRoundTrip(t *testing.T) {
	link, err := parseFigmaURL("https://www.figma.com/design/AbC123/Futures?node-id=I12-3%3B4-5")
	require.NoError(t, err)
	require.Equal(t, "AbC123.I12-3;4-5", link.id())
	back, err := parseFigmaAttachmentID(link.id())
	require.NoError(t, err)
	require.Equal(t, link, back)
	reparsed, err := parseFigmaURL(link.url())
	require.NoError(t, err)
	require.Equal(t, link, reparsed)

	_, err = parseFigmaAttachmentID("bad key!")
	require.ErrorIs(t, err, errFigmaAttachmentNotFound)
}

func TestFigmaAttachmentStore(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	f.sourceFile(t, "a.json")
	f.sourceFile(t, "b.json")
	title := f.createString(t, "a.json", "home.title", "Futures", nil)
	f.createString(t, "a.json", "shared", "Shared A", nil)
	f.createString(t, "b.json", "shared", "Shared B", nil)
	other := f.createString(t, "", "home.cta", "Trade", nil)
	plain := f.createString(t, "", "plain", "Plain", nil)

	// A design link set by hand, in another spelling of the same frame, joins the attachment.
	f.exec(t, `UPDATE project_translation_keys SET design_url = $1 WHERE id = $2`,
		"https://figma.com/file/AbC123/Futures-page?node-id=1%3A2&t=abc", other.ID)
	f.exec(t, `UPDATE project_translation_keys SET design_url = 'https://example.com/spec' WHERE id = $1`, plain.ID)

	created, err := f.store.createFigmaAttachment(ctx, f.actor, f.project, "https://www.figma.com/design/AbC123/Futures?node-id=1-2")
	require.NoError(t, err)
	require.Equal(t, "AbC123.1-2", created.ID)
	require.Equal(t, "https://www.figma.com/design/AbC123?node-id=1-2", created.URL)
	require.Equal(t, "1:2", *created.NodeID)
	require.Equal(t, 1, created.StringCount)

	_, err = f.store.createFigmaAttachment(ctx, f.actor, f.project, "https://example.com/x")
	require.ErrorIs(t, err, errFigmaAttachmentInvalidURL)

	// A key name matches in every file, so "shared" links two strings.
	linked, err := f.store.linkFigmaAttachmentStrings(ctx, f.actor, f.project, created.ID, stringSelector{Keys: []string{"home.title", "shared"}})
	require.NoError(t, err)
	require.Equal(t, 3, linked)
	linked, err = f.store.linkFigmaAttachmentStrings(ctx, f.actor, f.project, created.ID, stringSelector{StringIDs: []string{title.ID}})
	require.NoError(t, err)
	require.Equal(t, 0, linked)
	_, err = f.store.linkFigmaAttachmentStrings(ctx, f.actor, f.project, created.ID, stringSelector{Keys: []string{"missing"}})
	require.ErrorIs(t, err, errNoStringsMatched)
	require.Len(t, f.activities(t, "project_strings_updated"), 1)

	got, err := f.store.getFigmaAttachment(ctx, f.actor, f.project, created.ID)
	require.NoError(t, err)
	require.Equal(t, 4, got.StringCount)
	updated, err := f.store.getString(ctx, f.actor, f.project, title.ID)
	require.NoError(t, err)
	require.Equal(t, created.URL, *updated.DesignURL)

	linkedStrings, total, err := f.store.listFigmaAttachmentStrings(ctx, f.actor, f.project, created.ID, 2, 0)
	require.NoError(t, err)
	require.Equal(t, 4, total)
	require.Len(t, linkedStrings, 2)
	require.Equal(t, "home.cta", linkedStrings[0].Key)
	require.Nil(t, linkedStrings[0].FilePath)
	require.Equal(t, "home.title", linkedStrings[1].Key)
	require.Equal(t, "a.json", *linkedStrings[1].FilePath)

	second, err := f.store.createFigmaAttachment(ctx, f.actor, f.project, "https://www.figma.com/design/Other1/x")
	require.NoError(t, err)
	require.Equal(t, 0, second.StringCount)
	_, err = f.store.getFigmaAttachment(ctx, f.actor, f.project, second.ID)
	require.ErrorIs(t, err, errFigmaAttachmentNotFound)
	_, err = f.store.linkFigmaAttachmentStrings(ctx, f.actor, f.project, second.ID, stringSelector{StringIDs: []string{other.ID}})
	require.NoError(t, err)

	items, total, err := f.store.listFigmaAttachments(ctx, f.actor, f.project, figmaAttachmentFilters{Limit: 50})
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Equal(t, []string{"AbC123.1-2", "Other1"}, []string{items[0].ID, items[1].ID})
	require.Equal(t, 3, items[0].StringCount)
	items, total, err = f.store.listFigmaAttachments(ctx, f.actor, f.project, figmaAttachmentFilters{StringID: other.ID, Limit: 50})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Equal(t, second.ID, items[0].ID)

	// Unlinking leaves strings that point elsewhere alone.
	unlinked, err := f.store.unlinkFigmaAttachmentStrings(ctx, f.actor, f.project, created.ID, stringSelector{Keys: []string{"shared", "home.cta"}})
	require.NoError(t, err)
	require.Equal(t, 2, unlinked)
	got, err = f.store.getFigmaAttachment(ctx, f.actor, f.project, created.ID)
	require.NoError(t, err)
	require.Equal(t, 1, got.StringCount)

	require.NoError(t, f.store.deleteFigmaAttachment(ctx, f.actor, f.project, second.ID))
	require.ErrorIs(t, f.store.deleteFigmaAttachment(ctx, f.actor, f.project, second.ID), errFigmaAttachmentNotFound)
	cleared, err := f.store.getString(ctx, f.actor, f.project, other.ID)
	require.NoError(t, err)
	require.Nil(t, cleared.DesignURL)

	f.exec(t, `UPDATE projects SET source = 'external_tms' WHERE id = $1`, f.project)
	_, _, err = f.store.listFigmaAttachments(ctx, f.actor, f.project, figmaAttachmentFilters{Limit: 50})
	require.ErrorIs(t, err, errProjectNotNative)
}
