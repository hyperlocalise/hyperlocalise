package main

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestFixtureIsComplete(t *testing.T) {
	value, err := loadDefaultFixture()
	if err != nil {
		t.Fatal(err)
	}
	if len(value.Concepts) != expectedConceptCount {
		t.Fatalf("concept count = %d, want %d", len(value.Concepts), expectedConceptCount)
	}
	if len(value.QueryCases) != expectedQueryCases {
		t.Fatalf("query case count = %d, want %d", len(value.QueryCases), expectedQueryCases)
	}

	var totalTerms int
	for _, item := range value.Concepts {
		totalTerms += len(item.Terms)
	}
	if totalTerms < expectedConceptCount*len(expectedLocales) {
		t.Fatalf("total terms = %d, want at least %d", totalTerms, expectedConceptCount*len(expectedLocales))
	}
}

func TestFixtureHasConcordanceCoverageCases(t *testing.T) {
	value, err := loadDefaultFixture()
	if err != nil {
		t.Fatal(err)
	}

	ids := make(map[string]bool, len(value.QueryCases))
	for _, query := range value.QueryCases {
		ids[query.ID] = true
	}
	for _, id := range []string{
		"exact-primary",
		"phrases-and-punctuation",
		"aliases-and-case",
		"controls",
		"mixed-batch",
		"contextual-sentences",
		"term-boundaries",
		"statuses-and-overlap",
		"locale-and-negative",
	} {
		if !ids[id] {
			t.Fatalf("missing concordance coverage case %q", id)
		}
	}
}

func TestWriteTBX(t *testing.T) {
	value, err := loadDefaultFixture()
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "ota-glossary.tbx")
	if err := writeTBX(path, value); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var document tbxDocument
	if err := xml.Unmarshal(content, &document); err != nil {
		t.Fatalf("TBX is not valid XML: %v", err)
	}
	if got := len(document.Text.Body.Concepts); got != expectedConceptCount {
		t.Fatalf("TBX concepts = %d, want %d", got, expectedConceptCount)
	}
	if !strings.Contains(string(content), "<descrip type=\"definition\">") {
		t.Fatal("TBX does not contain concept definitions")
	}
	if !strings.Contains(string(content), "<term>PNR</term>") {
		t.Fatal("TBX does not contain the PNR alias")
	}
	if !strings.Contains(string(content), `<descrip type="context">`) {
		t.Fatal("TBX term descriptions must use the DCA context data category")
	}
}

func TestValidateFixtureRejectsMissingLocale(t *testing.T) {
	value, err := loadDefaultFixture()
	if err != nil {
		t.Fatal(err)
	}
	value.Concepts[0].Terms = value.Concepts[0].Terms[:len(value.Concepts[0].Terms)-1]
	if err := validateFixture(value); err == nil || !strings.Contains(err.Error(), "missing locale") {
		t.Fatalf("validateFixture error = %v, want missing locale", err)
	}
}

func TestConcordanceSendsDocumentedOrganizationRequest(t *testing.T) {
	server := newIPv4TestServer(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.URL.Path != "/api/v2/glossaries/concordance" {
			t.Fatalf("request = %s %s", request.Method, request.URL.Path)
		}
		if got := request.Header.Get("Authorization"); got != "Bearer secret" {
			t.Fatalf("authorization = %q", got)
		}
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		var input map[string]any
		if err := json.Unmarshal(body, &input); err != nil {
			t.Fatal(err)
		}
		if input["sourceLanguageId"] != "en" || input["targetLanguageId"] != "vi" {
			t.Fatalf("language payload = %#v", input)
		}
		if _, exists := input["userId"]; exists {
			t.Fatal("userId should be omitted by default")
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"data":[{"data":{"glossary":{"id":7,"name":"OTA Concordance Fixture"}}}]}`))
	}))
	defer func() { _ = server.Close() }()

	client := newAPIClient(server.URL+"/api/v2", "secret")
	output, status, err := client.concordance(context.Background(), concordanceRequest{
		SourceLanguageID: "en",
		TargetLanguageID: "vi",
		Expressions:      []string{"booking reference"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || !json.Valid(output) {
		t.Fatalf("status/output = %d/%s", status, output)
	}
}

func TestCreateUploadAndPollGlossaryImport(t *testing.T) {
	var pollCount atomic.Int32
	server := newIPv4TestServer(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodPost && request.URL.Path == "/api/v2/glossaries":
			_, _ = writer.Write([]byte(`{"data":{"id":44}}`))
		case request.Method == http.MethodPost && request.URL.Path == "/api/v2/storages":
			if request.Header.Get("Crowdin-API-FileName") != "ota-glossary.tbx" {
				t.Fatalf("storage file name = %q", request.Header.Get("Crowdin-API-FileName"))
			}
			_, _ = writer.Write([]byte(`{"data":{"id":123}}`))
		case request.Method == http.MethodPost && request.URL.Path == "/api/v2/glossaries/44/imports":
			_, _ = writer.Write([]byte(`{"data":{"identifier":"job-1","status":"in_progress"}}`))
		case request.Method == http.MethodGet && request.URL.Path == "/api/v2/glossaries/44/imports/job-1":
			pollCount.Add(1)
			_, _ = writer.Write([]byte(`{"data":{"identifier":"job-1","status":"finished"}}`))
		default:
			t.Fatalf("unexpected request: %s %s", request.Method, request.URL.Path)
		}
	}))
	defer func() { _ = server.Close() }()

	seedPath := filepath.Join(t.TempDir(), "ota-glossary.tbx")
	if err := os.WriteFile(seedPath, []byte("<tbx/>"), 0o644); err != nil {
		t.Fatal(err)
	}
	client := newAPIClient(server.URL+"/api/v2", "secret")
	client.pollInterval = time.Millisecond
	client.importTimeout = time.Second

	value, err := loadDefaultFixture()
	if err != nil {
		t.Fatal(err)
	}
	glossaryID, err := client.createGlossary(context.Background(), value)
	if err != nil || glossaryID != 44 {
		t.Fatalf("create glossary = %d, %v", glossaryID, err)
	}
	storageID, err := client.uploadStorage(context.Background(), seedPath)
	if err != nil || storageID != 123 {
		t.Fatalf("upload storage = %d, %v", storageID, err)
	}
	if err := client.importGlossary(context.Background(), glossaryID, storageID); err != nil {
		t.Fatal(err)
	}
	if pollCount.Load() != 1 {
		t.Fatalf("poll count = %d, want 1", pollCount.Load())
	}
}

func TestRunWritesAllPairsWithoutTokenInRecording(t *testing.T) {
	var concordanceCount atomic.Int32
	server := newIPv4TestServer(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method == http.MethodPost && request.URL.Path == "/api/v2/glossaries" {
			_, _ = writer.Write([]byte(`{"data":{"id":44}}`))
			return
		}
		if request.Method == http.MethodPost && request.URL.Path == "/api/v2/glossaries/concordance" {
			concordanceCount.Add(1)
			_, _ = writer.Write([]byte(`{"data":[]}`))
			return
		}
		t.Fatalf("unexpected request: %s %s", request.Method, request.URL.Path)
	}))
	defer func() { _ = server.Close() }()

	directory := t.TempDir()
	outputPath := filepath.Join(directory, "recording.json")
	seedPath := filepath.Join(directory, "seed.tbx")
	err := run(context.Background(), []string{
		"--create-glossary",
		"--skip-import",
		"--token", "secret",
		"--base-url", server.URL + "/api/v2",
		"--output", outputPath,
		"--seed-output", seedPath,
	}, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	fixture, err := loadDefaultFixture()
	if err != nil {
		t.Fatal(err)
	}
	expectedRuns := fixtureExpressionCount(fixture) * len(fixture.TargetLanguageIDs)
	if concordanceCount.Load() != int32(expectedRuns) {
		t.Fatalf("concordance count = %d, want %d", concordanceCount.Load(), expectedRuns)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(content) || strings.Contains(string(content), "secret") {
		t.Fatal("recording is invalid JSON or contains the token")
	}
	var value recording
	if err := json.Unmarshal(content, &value); err != nil {
		t.Fatal(err)
	}
	if len(value.Runs) != expectedRuns || value.Glossary.ID != 44 {
		t.Fatalf("recording = %d runs, want %d, glossary %d", len(value.Runs), expectedRuns, value.Glossary.ID)
	}
	for _, run := range value.Runs {
		if len(run.Input.Expressions) != 1 {
			t.Fatalf("recorded run expressions = %d, want 1", len(run.Input.Expressions))
		}
	}
}

type localTestServer struct {
	*http.Server
	URL string
}

func newIPv4TestServer(t *testing.T, handler http.Handler) *localTestServer {
	t.Helper()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: handler}
	go func() {
		_ = server.Serve(listener)
	}()
	result := &localTestServer{Server: server, URL: "http://" + listener.Addr().String()}
	t.Cleanup(func() {
		_ = server.Close()
	})
	return result
}
