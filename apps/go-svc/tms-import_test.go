package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestRequireTMSConnectionRejectsMissingIDs(t *testing.T) {
	t.Parallel()

	_, err := requireTMSConnection(t.Context(), nil, "org-1", tmsImportRequest{CredentialID: "", ExternalID: "ext-1"})
	var failure *tmsFailure
	if !errors.As(err, &failure) || failure.status != http.StatusBadRequest {
		t.Fatalf("err = %v", err)
	}
	_, err = requireTMSConnection(t.Context(), nil, "org-1", tmsImportRequest{CredentialID: "cred-1", ExternalID: ""})
	if !errors.As(err, &failure) || failure.status != http.StatusBadRequest {
		t.Fatalf("err = %v", err)
	}
}

func TestRequireTMSExportContent(t *testing.T) {
	t.Parallel()

	conn := tmsConnection{DisplayName: "Crowdin"}
	if err := requireTMSExportContent(tmscatalog.Export{Content: []byte("<tbx/>")}, conn); err != nil {
		t.Fatalf("non-empty: %v", err)
	}
	err := requireTMSExportContent(tmscatalog.Export{Content: []byte("  \n")}, conn)
	var failure *tmsFailure
	if !errors.As(err, &failure) || failure.code != "tms_export_empty" {
		t.Fatalf("err = %v", err)
	}
}

func TestTMSResourcesMapsCounts(t *testing.T) {
	t.Parallel()

	count := 4
	source := "en"
	resources := []tmscatalog.Resource{{
		ExternalID:    "g-1",
		Name:          "Brand",
		SourceLocale:  &source,
		TargetLocales: []string{"fr"},
		Count:         &count,
	}}
	glossaries := tmsResources(resources, true)
	if glossaries[0].TermCount == nil || *glossaries[0].TermCount != 4 || glossaries[0].SegmentCount != nil {
		t.Fatalf("glossaries = %#v", glossaries)
	}
	memories := tmsResources(resources, false)
	if memories[0].SegmentCount == nil || *memories[0].SegmentCount != 4 || memories[0].TermCount != nil {
		t.Fatalf("memories = %#v", memories)
	}
}

func TestTMSTokenFailure(t *testing.T) {
	t.Parallel()

	conn := tmsConnection{ProviderKind: "crowdin", DisplayName: "Crowdin"}
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		{
			name:       "client mint error keeps the web app message",
			err:        &tmsauth.Error{Status: http.StatusUnauthorized, Message: "Credential expired"},
			wantStatus: http.StatusConflict,
			wantCode:   "tms_not_connected",
			wantMsg:    "Credential expired",
		},
		{
			name:       "client mint error without a message asks to reconnect",
			err:        &tmsauth.Error{Status: http.StatusForbidden, Code: "tms_not_connected"},
			wantStatus: http.StatusConflict,
			wantCode:   "tms_not_connected",
			wantMsg:    "Reconnect Crowdin in Integrations, then try again",
		},
		{
			name:       "server mint error is unreachable",
			err:        &tmsauth.Error{Status: http.StatusBadGateway, Message: "web app down"},
			wantStatus: http.StatusBadGateway,
			wantCode:   "tms_unreachable",
			wantMsg:    "Could not reach Crowdin",
		},
		{
			name:       "plain mint error is unreachable",
			err:        errors.New("dial tcp: i/o timeout"),
			wantStatus: http.StatusBadGateway,
			wantCode:   "tms_unreachable",
			wantMsg:    "Could not reach Crowdin",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assertTMSFailure(t, tmsTokenFailure(conn, tt.err), tt.wantStatus, tt.wantCode, tt.wantMsg)
		})
	}
}

func TestTMSProviderFailure(t *testing.T) {
	t.Parallel()

	conn := tmsConnection{ProviderKind: "smartling", DisplayName: "Smartling"}
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
		wantMsg    string
	}{
		{
			name:       "missing account uid",
			err:        tmscatalog.ErrAccountRequired,
			wantStatus: http.StatusConflict,
			wantCode:   "tms_account_required",
			wantMsg:    "Add your account UID to the Smartling connection in Integrations, then try again",
		},
		{
			name:       "unauthorized becomes not connected",
			err:        &tmscatalog.ProviderError{Status: http.StatusUnauthorized, Message: "Smartling: expired"},
			wantStatus: http.StatusConflict,
			wantCode:   "tms_request_failed",
			wantMsg:    "Smartling: expired",
		},
		{
			name:       "forbidden becomes not connected",
			err:        &tmscatalog.ProviderError{Status: http.StatusForbidden, Message: "Smartling: denied"},
			wantStatus: http.StatusConflict,
			wantCode:   "tms_request_failed",
			wantMsg:    "Smartling: denied",
		},
		{
			name:       "other provider errors stay bad gateway",
			err:        &tmscatalog.ProviderError{Status: http.StatusUnprocessableEntity, Message: "This Smartling glossary has no languages to export"},
			wantStatus: http.StatusBadGateway,
			wantCode:   "tms_request_failed",
			wantMsg:    "This Smartling glossary has no languages to export",
		},
		{
			name:       "transport errors hide internals",
			err:        errors.New("connection reset"),
			wantStatus: http.StatusBadGateway,
			wantCode:   "tms_unreachable",
			wantMsg:    "Could not reach Smartling",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assertTMSFailure(t, tmsProviderFailure(conn, tt.err), tt.wantStatus, tt.wantCode, tt.wantMsg)
		})
	}
}

func TestTMSExportMessageUsesProviderFailure(t *testing.T) {
	t.Parallel()

	conn := tmsConnection{DisplayName: "Phrase"}
	got := tmsExportMessage(conn, &tmscatalog.ProviderError{Status: http.StatusUnauthorized, Message: "Phrase: token expired"})
	if got != "Phrase: token expired" {
		t.Fatalf("got %q", got)
	}
	got = tmsExportMessage(conn, errors.New("eof"))
	if got != "Could not reach Phrase" {
		t.Fatalf("got %q", got)
	}
}

func TestAsGlossaryAndMemoryFailure(t *testing.T) {
	t.Parallel()

	err := &tmsFailure{http.StatusConflict, "tms_not_connected", "That TMS is no longer connected to this workspace"}
	var glossary *glossaryError
	if wrapped := asGlossaryFailure(err); !errors.As(wrapped, &glossary) || glossary.status != http.StatusConflict || glossary.code != "tms_not_connected" || glossary.message != err.message {
		t.Fatalf("glossary = %#v from %v", glossary, wrapped)
	}
	var memory *memoryError
	if wrapped := asMemoryFailure(err); !errors.As(wrapped, &memory) || memory.status != http.StatusConflict || memory.code != "tms_not_connected" || memory.message != err.message {
		t.Fatalf("memory = %#v from %v", memory, wrapped)
	}
	plain := errors.New("db down")
	if asGlossaryFailure(plain) != plain || asMemoryFailure(plain) != plain {
		t.Fatal("plain errors should pass through")
	}
}

func TestRequireTMSConnectionActiveAndStale(t *testing.T) {
	t.Parallel()

	payload := tmsImportRequest{CredentialID: "cred-active", ExternalID: "tb-1"}
	active := tmsStubDB{row: tmsScanRow{values: []any{"cred-active", "crowdin", "Crowdin"}}}
	conn, err := requireTMSConnection(t.Context(), active, "org-1", payload)
	if err != nil {
		t.Fatalf("active: %v", err)
	}
	if conn.CredentialID != "cred-active" || conn.ProviderKind != "crowdin" {
		t.Fatalf("conn = %#v", conn)
	}

	stale := tmsStubDB{row: tmsScanRow{values: []any{"cred-other", "crowdin", "Crowdin"}}}
	_, err = requireTMSConnection(t.Context(), stale, "org-1", payload)
	assertTMSFailure(t, err, http.StatusConflict, "tms_not_connected", "That TMS is no longer connected to this workspace")

	missing := tmsStubDB{row: tmsScanRow{err: pgx.ErrNoRows}}
	_, err = requireTMSConnection(t.Context(), missing, "org-1", payload)
	assertTMSFailure(t, err, http.StatusConflict, "tms_not_connected", "That TMS is no longer connected to this workspace")
}

func TestSmartlingProjectAccount(t *testing.T) {
	t.Parallel()

	accountID, projectID, err := smartlingProjectAccount(t.Context(), tmsStubDB{row: tmsScanRow{err: pgx.ErrNoRows}}, "org-1")
	if err != nil || accountID != "" || projectID != "" {
		t.Fatalf("no rows: %q %q %v", accountID, projectID, err)
	}
	accountID, projectID, err = smartlingProjectAccount(t.Context(), tmsStubDB{row: tmsScanRow{values: []any{"acc-1", "proj-1"}}}, "org-1")
	if err != nil || accountID != "acc-1" || projectID != "proj-1" {
		t.Fatalf("row: %q %q %v", accountID, projectID, err)
	}
}

func TestTMSImportsProvider(t *testing.T) {
	t.Parallel()

	conn := tmsConnection{CredentialID: "cred-1", ProviderKind: "crowdin", DisplayName: "Crowdin"}
	_, err := (*tmsImports)(nil).provider(t.Context(), nil, conn, "org-1", "user-1")
	assertTMSFailure(t, err, http.StatusServiceUnavailable, "tms_unavailable", "TMS imports are unavailable on this server")

	unavailable := &tmsImports{tokens: stubTMSMinter{}}
	_, err = unavailable.provider(t.Context(), nil, tmsConnection{ProviderKind: "lokalise", DisplayName: "Lokalise"}, "org-1", "user-1")
	assertTMSFailure(t, err, http.StatusNotImplemented, "tms_provider_unsupported", "Importing from Lokalise isn't supported yet")

	mintFail := &tmsImports{tokens: stubTMSMinter{err: &tmsauth.Error{Status: http.StatusUnauthorized, Message: "Reconnect Crowdin"}}}
	_, err = mintFail.provider(t.Context(), nil, conn, "org-1", "user-1")
	assertTMSFailure(t, err, http.StatusConflict, "tms_not_connected", "Reconnect Crowdin")

	ok := &tmsImports{tokens: stubTMSMinter{token: &tmsauth.AccessToken{
		BaseURL:     "https://api.crowdin.com/api/v2",
		HeaderName:  "Authorization",
		HeaderValue: "Bearer token",
	}}, http: http.DefaultClient}
	provider, err := ok.provider(t.Context(), nil, conn, "org-1", "user-1")
	if err != nil {
		t.Fatalf("supported: %v", err)
	}
	if provider == nil {
		t.Fatal("expected a Crowdin provider")
	}
}

func assertTMSFailure(t *testing.T, err error, status int, code, message string) {
	t.Helper()
	var failure *tmsFailure
	if !errors.As(err, &failure) || failure.status != status || failure.code != code || failure.message != message {
		t.Fatalf("err = %#v (%v), want status=%d code=%q message=%q", failure, err, status, code, message)
	}
}

type stubTMSMinter struct {
	token *tmsauth.AccessToken
	err   error
}

func (s stubTMSMinter) Mint(context.Context, tmsauth.MintRequest) (*tmsauth.AccessToken, error) {
	return s.token, s.err
}

type tmsScanRow struct {
	err    error
	values []any
}

func (r tmsScanRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != len(r.values) {
		return fmt.Errorf("scan dest %d values %d", len(dest), len(r.values))
	}
	for i, d := range dest {
		s, ok := r.values[i].(string)
		if !ok {
			return fmt.Errorf("scan dest %d: want string, got %T", i, r.values[i])
		}
		ptr, ok := d.(*string)
		if !ok {
			return fmt.Errorf("scan dest %d: want *string, got %T", i, d)
		}
		*ptr = s
	}
	return nil
}

type tmsStubDB struct {
	row pgx.Row
}

func (db tmsStubDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("unused")
}

func (db tmsStubDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return db.row
}

func (db tmsStubDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unused")
}
