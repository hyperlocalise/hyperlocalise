package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	guidelinepg "github.com/hyperlocalise/hyperlocalise/internal/guidelines/postgres"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type recordingGuidelinePublisher struct {
	mu       sync.Mutex
	messages []ingest.Message
	err      error
}

func (p *recordingGuidelinePublisher) Publish(_ context.Context, message ingest.Message) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.err != nil {
		return p.err
	}
	message.SchemaVersion = ingest.SchemaVersion
	if err := message.Validate(); err != nil {
		return err
	}
	p.messages = append(p.messages, message)
	return nil
}

func (p *recordingGuidelinePublisher) Ping(context.Context) error { return nil }

func (p *recordingGuidelinePublisher) last(t *testing.T) ingest.Message {
	t.Helper()
	p.mu.Lock()
	defer p.mu.Unlock()
	require.NotEmpty(t, p.messages)
	return p.messages[len(p.messages)-1]
}

type guidelineTestEnv struct {
	scope     *testenv.Scope
	handler   *handler
	publisher *recordingGuidelinePublisher
	objects   *objectstore.Registry
}

func newGuidelineTestEnv(t *testing.T, role string) *guidelineTestEnv {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	h := knowledgeMemoryHandler(scope, role, knowledgeMemoryFlagsStub{enabled: true})
	publisher := &recordingGuidelinePublisher{}
	registry, err := objectstore.NewRegistry("r2-primary", map[string]objectstore.Store{"r2-primary": memory.New()})
	require.NoError(t, err)
	h.knowledgeMemories.guidelineIngest = publisher
	h.guidelineDocuments = newGuidelineDocumentAPI(h.knowledgeMemories, registry, publisher)
	return &guidelineTestEnv{scope: scope, handler: h, publisher: publisher, objects: registry}
}

func (e *guidelineTestEnv) serve(req *http.Request) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	registerRoutes(mux, e.handler, stubSessionVerifier{claims: AuthClaims{UserID: e.scope.WorkOSUserID}})
	req.Header.Set("Origin", "http://127.0.0.1")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func (e *guidelineTestEnv) upload(t *testing.T, method, path, filename string, data []byte, fields map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for name, value := range fields {
		require.NoError(t, writer.WriteField(name, value))
	}
	part, err := writer.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write(data)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	req := httptest.NewRequest(method, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return e.serve(req)
}

func (e *guidelineTestEnv) json(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return e.serve(req)
}

func decodeGuidelineDocument(t *testing.T, rec *httptest.ResponseRecorder) guidelineDocumentRecord {
	t.Helper()
	var body struct {
		GuidelineDocument guidelineDocumentRecord `json:"guidelineDocument"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
	return body.GuidelineDocument
}

func TestGuidelineDocumentLifecycle(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	path := env.scope.OrgPath("/guidelines/documents")

	created := env.upload(t, http.MethodPost, path, "Style guide.md", []byte("# Tone\n\nUse formal French."), map[string]string{"locale": "fr_fr", "mandatory": "true"})
	require.Equal(t, http.StatusAccepted, created.Code, created.Body.String())
	doc := decodeGuidelineDocument(t, created)
	require.Equal(t, "processing", doc.Status)
	require.Equal(t, "Style guide", doc.Title)
	require.Equal(t, "text/markdown", doc.ContentType)
	require.Equal(t, "fr-FR", *doc.Locale)
	require.True(t, doc.Mandatory)
	require.Nil(t, doc.ProjectID)
	require.Equal(t, ingest.Message{SchemaVersion: 1, Operation: ingest.OperationExtractIndex, OrganizationID: env.scope.OrganizationID, DocumentID: doc.ID, RevisionID: doc.RevisionID}, env.publisher.last(t))

	var storageKey string
	require.NoError(t, env.scope.Pool.QueryRow(t.Context(), `select storage_key from guideline_documents where id = $1`, doc.ID).Scan(&storageKey))

	listed := env.json(http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, listed.Code)
	var list struct {
		GuidelineDocuments []guidelineDocumentRecord `json:"guidelineDocuments"`
	}
	require.NoError(t, json.Unmarshal(listed.Body.Bytes(), &list))
	require.Len(t, list.GuidelineDocuments, 1)
	require.Nil(t, list.GuidelineDocuments[0].Content)

	// Simulate the worker so the source query sees a ready document.
	_, err := env.scope.Pool.Exec(t.Context(), `update guideline_documents set status = 'ready', content = 'Use formal French.' where id = $1`, doc.ID)
	require.NoError(t, err)
	source := guidelinepg.NewWithPool(env.scope.Pool)
	french, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: env.scope.OrganizationID, Locale: "fr-FR"})
	require.NoError(t, err)
	require.Len(t, french, 1)
	require.Equal(t, guidelinepg.UploadedDocumentID(doc.ID), french[0].ID)
	require.True(t, french[0].Mandatory)
	german, err := source.Current(t.Context(), guidelines.Scope{OrganizationID: env.scope.OrganizationID, Locale: "de-DE"})
	require.NoError(t, err)
	require.Empty(t, german)

	fetched := env.json(http.MethodGet, path+"/"+doc.ID, "")
	require.Equal(t, http.StatusOK, fetched.Code)
	require.Equal(t, "Use formal French.", *decodeGuidelineDocument(t, fetched).Content)

	updated := env.json(http.MethodPut, path+"/"+doc.ID, `{"locale":null,"mandatory":false,"title":"Tone"}`)
	require.Equal(t, http.StatusAccepted, updated.Code, updated.Body.String())
	metadata := decodeGuidelineDocument(t, updated)
	require.Equal(t, "ready", metadata.Status)
	require.Nil(t, metadata.Locale)
	require.False(t, metadata.Mandatory)
	require.EqualValues(t, 2, metadata.Version)
	require.NotEqual(t, doc.RevisionID, metadata.RevisionID)
	require.Equal(t, metadata.RevisionID, env.publisher.last(t).RevisionID)

	replaced := env.upload(t, http.MethodPut, path+"/"+doc.ID, "v2.txt", []byte("Prefer vous."), nil)
	require.Equal(t, http.StatusAccepted, replaced.Code, replaced.Body.String())
	file := decodeGuidelineDocument(t, replaced)
	require.Equal(t, "processing", file.Status)
	require.Equal(t, "v2.txt", file.Filename)
	require.Equal(t, "Tone", file.Title)
	require.EqualValues(t, 3, file.Version)
	store, err := env.objects.Resolve("r2-primary")
	require.NoError(t, err)
	_, _, err = store.Get(t.Context(), storageKey)
	require.ErrorIs(t, err, objectstore.ErrNotFound)

	deleted := env.json(http.MethodDelete, path+"/"+doc.ID, "")
	require.Equal(t, http.StatusNoContent, deleted.Code, deleted.Body.String())
	require.Equal(t, ingest.Message{SchemaVersion: 1, Operation: ingest.OperationDelete, OrganizationID: env.scope.OrganizationID, DocumentID: doc.ID, Version: 3}, env.publisher.last(t))
	require.Equal(t, http.StatusNotFound, env.json(http.MethodGet, path+"/"+doc.ID, "").Code)
}

func TestGuidelineDocumentUploadRejectsUnsupportedAndMarksEnqueueFailure(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	path := env.scope.OrgPath("/guidelines/documents")

	binary := env.upload(t, http.MethodPost, path, "notes.txt", []byte{0x00, 0x01, 0x02, 0xff, 0xfe}, nil)
	require.Equal(t, http.StatusUnsupportedMediaType, binary.Code, binary.Body.String())
	image := env.upload(t, http.MethodPost, path, "scan.png", []byte("\x89PNG\r\n\x1a\n0000"), nil)
	require.Equal(t, http.StatusUnsupportedMediaType, image.Code, image.Body.String())
	badLocale := env.upload(t, http.MethodPost, path, "a.txt", []byte("text"), map[string]string{"locale": "not a locale!"})
	require.Equal(t, http.StatusBadRequest, badLocale.Code, badLocale.Body.String())

	env.publisher.err = errors.New("queue down")
	failed := env.upload(t, http.MethodPost, path, "a.txt", []byte("Always use the Oxford comma."), nil)
	require.Equal(t, http.StatusAccepted, failed.Code, failed.Body.String())
	doc := decodeGuidelineDocument(t, failed)
	require.Equal(t, "failed", doc.Status)
	require.Equal(t, "guideline_ingest_enqueue_failed", *doc.ErrorCode)

	env.handler.guidelineDocuments.publisher = nil
	unavailable := env.upload(t, http.MethodPost, path, "a.txt", []byte("text"), nil)
	require.Equal(t, http.StatusServiceUnavailable, unavailable.Code)
	require.Contains(t, unavailable.Body.String(), "guideline_ingest_unavailable")
}

func TestGuidelineDocumentAccessControl(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	projectID := env.scope.MustProject(t, "", "Project")
	projectPath := env.scope.OrgPath("/projects/" + projectID + "/guidelines/documents")
	workspacePath := env.scope.OrgPath("/guidelines/documents")

	created := env.upload(t, http.MethodPost, projectPath, "glossary.txt", []byte("Never translate Acme."), nil)
	require.Equal(t, http.StatusAccepted, created.Code, created.Body.String())
	doc := decodeGuidelineDocument(t, created)
	require.Equal(t, projectID, *doc.ProjectID)
	require.Equal(t, projectID, env.publisher.last(t).ProjectID)

	// Project documents are not reachable through the workspace path.
	require.Equal(t, http.StatusNotFound, env.json(http.MethodGet, workspacePath+"/"+doc.ID, "").Code)
	listed := env.json(http.MethodGet, workspacePath, "")
	require.Equal(t, http.StatusOK, listed.Code)
	require.Contains(t, listed.Body.String(), `"guidelineDocuments":[]`)

	other := newGuidelineTestEnv(t, "admin")
	crossOrg := other.json(http.MethodGet, other.scope.OrgPath("/guidelines/documents/"+doc.ID), "")
	require.Equal(t, http.StatusNotFound, crossOrg.Code)
	foreignProject := other.json(http.MethodGet, other.scope.OrgPath("/projects/"+projectID+"/guidelines/documents"), "")
	require.Equal(t, http.StatusNotFound, foreignProject.Code)

	member := newGuidelineTestEnv(t, "member")
	forbidden := member.upload(t, http.MethodPost, member.scope.OrgPath("/guidelines/documents"), "a.txt", []byte("text"), nil)
	require.Equal(t, http.StatusForbidden, forbidden.Code)
	require.Equal(t, http.StatusOK, member.json(http.MethodGet, member.scope.OrgPath("/guidelines/documents"), "").Code)
}

func TestGuidelineDocumentSweepRepublishesLostMessages(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie-password-at-least-32-characters")
	env := newGuidelineTestEnv(t, "admin")
	path := env.scope.OrgPath("/guidelines/documents")
	ids := map[string]string{}
	for _, name := range []string{"stuck", "unindexed", "indexed", "fresh"} {
		rec := env.upload(t, http.MethodPost, path, name+".txt", []byte("Rule for "+name), nil)
		require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
		ids[name] = decodeGuidelineDocument(t, rec).ID
	}
	pool := env.scope.Pool
	_, err := pool.Exec(t.Context(), `update guideline_documents set enqueued_at = now() - interval '1 hour' where id = any($1::uuid[])`,
		[]string{ids["stuck"], ids["unindexed"], ids["indexed"]})
	require.NoError(t, err)
	_, err = pool.Exec(t.Context(), `update guideline_documents set status = 'ready' where id = any($1::uuid[])`, []string{ids["unindexed"], ids["indexed"]})
	require.NoError(t, err)
	_, err = pool.Exec(t.Context(), `update guideline_documents set indexed_revision_id = revision_id where id = $1`, ids["indexed"])
	require.NoError(t, err)
	env.publisher.messages = nil

	unauthorized := env.serve(httptest.NewRequest(http.MethodPost, "/internal/guidelines/sweep", nil))
	require.Equal(t, http.StatusUnauthorized, unauthorized.Code)

	req := httptest.NewRequest(http.MethodPost, "/internal/guidelines/sweep", nil)
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	rec := env.serve(req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	republished := map[string]bool{}
	for _, message := range env.publisher.messages {
		if message.OrganizationID == env.scope.OrganizationID {
			require.Equal(t, ingest.OperationExtractIndex, message.Operation)
			republished[message.DocumentID] = true
		}
	}
	require.Equal(t, map[string]bool{ids["stuck"]: true, ids["unindexed"]: true}, republished)

	var stillOld int
	require.NoError(t, pool.QueryRow(t.Context(), `select count(*) from guideline_documents where id = any($1::uuid[]) and enqueued_at < now() - interval '15 minutes'`,
		[]string{ids["stuck"], ids["unindexed"]}).Scan(&stillOld))
	require.Zero(t, stillOld)
}

func TestKnowledgeMemoryCommitPublishesGuidelineSync(t *testing.T) {
	env := newGuidelineTestEnv(t, "admin")
	req := httptest.NewRequest(http.MethodPut, env.scope.OrgPath("/knowledge-memory"), strings.NewReader(`{"content":"Be concise."}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", `"0"`)
	rec := env.serve(req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, ingest.Message{SchemaVersion: 1, Operation: ingest.OperationSync, OrganizationID: env.scope.OrganizationID}, env.publisher.last(t))

	projectID := env.scope.MustProject(t, "", "Project")
	req = httptest.NewRequest(http.MethodPut, env.scope.OrgPath("/projects/"+projectID+"/knowledge-memory"), strings.NewReader(`{"content":"Project rule."}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("If-Match", `"0"`)
	rec = env.serve(req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, ingest.Message{SchemaVersion: 1, Operation: ingest.OperationSync, OrganizationID: env.scope.OrganizationID, ProjectID: projectID}, env.publisher.last(t))
}
