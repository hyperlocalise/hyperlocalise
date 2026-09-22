package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/experiment"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/workos/workos-go/v10"
)

const (
	serverReadHeaderTimeout = 5 * time.Second
	serverReadTimeout       = 75 * time.Second
	serverWriteTimeout      = 75 * time.Second
	serverIdleTimeout       = 60 * time.Second
	serverShutdownTimeout   = 10 * time.Second
	// telemetryShutdownReserve reserves part of the shutdown budget for flushing spans.
	telemetryShutdownReserve = 2 * time.Second

	defaultHunspellDictDir = "/usr/share/hunspell"
)

func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: serverReadHeaderTimeout,
		ReadTimeout:       serverReadTimeout,
		WriteTimeout:      serverWriteTimeout,
		IdleTimeout:       serverIdleTimeout,
	}
}

func main() {
	slog.SetDefault(slog.New(newDatadogLogHandler(slog.NewJSONHandler(os.Stdout, nil))))

	shutdownTelemetry, err := initTelemetry(context.Background())
	if err != nil {
		log.Printf("configure telemetry: %v; continuing without tracing", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	verifier, err := NewWorkOSSessionVerifier(os.Getenv("WORKOS_COOKIE_PASSWORD"))
	if err != nil {
		log.Fatalf("configure WorkOS auth: %v", err)
	}

	dictDir := os.Getenv("HUNSPELL_DICT_DIR")
	if dictDir == "" {
		dictDir = defaultHunspellDictDir
	}

	spellChecker, closeSpellChecker, err := newSpellChecker(dictDir)
	if err != nil {
		log.Printf("configure spell checker: %v; continuing without spell check", err)
		spellChecker = NoopSpellChecker{}
		closeSpellChecker = func() error { return nil }
	}

	defer func() {
		if err := closeSpellChecker(); err != nil {
			log.Printf("close spell checker: %v", err)
		}
	}()

	h := newHandler()
	h.spellChecker = spellChecker
	h.dictionaries = &dictionaryAPI{}
	h.glossaries = &glossaryAPI{}
	h.memories = &memoryAPI{}
	h.qaReports = &qaReportAPI{}
	h.teams = &teamAPI{}
	h.issueSheets = &issueSheetAPI{}
	h.activityLogs = &activityLogAPI{}
	h.contentEditor = &editorCatAPI{}
	if autumnKey := strings.TrimSpace(os.Getenv("AUTUMN_API_KEY")); autumnKey != "" {
		if client, err := autumn.NewClient(autumn.Config{SecretKey: autumnKey}); err != nil {
			log.Printf("configure autumn: %v", err)
		} else {
			h.issueSheets.autumn = autumnClientChecker{client: client}
		}
	}
	if key := strings.TrimSpace(os.Getenv("WORKOS_API_KEY")); key != "" {
		client := workos.NewClient(key)
		membershipLookup := func(ctx context.Context, id string) (*workos.UserOrganizationMembership, error) {
			return client.OrganizationMembership().Get(ctx, id)
		}
		h.dictionaries.membership = membershipLookup
		h.glossaries.membership = membershipLookup
		h.memories.membership = membershipLookup
		h.qaReports.membership = membershipLookup
		h.teams.membership = membershipLookup
		h.issueSheets.membership = membershipLookup
		h.activityLogs.membership = membershipLookup
		h.contentEditor.membership = membershipLookup
	}

	if apiKey := strings.TrimSpace(os.Getenv("DATAFORSEO_API_KEY")); apiKey != "" {
		client, err := dataforseo.NewClient(dataforseo.Config{APIKey: apiKey})
		if err != nil {
			log.Printf("configure dataforseo: %v", err)
		} else {
			h.research = newDataForSEOResearch(client)
		}
	}

	if databaseURL := os.Getenv("DATABASE_URL"); databaseURL != "" {
		pool, err := pgxpool.New(context.Background(), databaseURL)
		if err != nil {
			log.Fatalf("configure dictionary store: %v", err)
		}
		defer pool.Close()
		h.postgres = pool
		h.dictionaries.pool = pool
		h.glossaries.pool = pool
		h.memories.pool = pool
		h.qaReports.pool = pool
		h.issueSheets.pool = pool
		h.teams.pool = pool
		h.activityLogs.pool = pool
		h.contentEditor.pool = pool
		store, err := experiment.NewPGStore(context.Background(), databaseURL)
		if err != nil {
			log.Fatalf("configure experiment store: %v", err)
		}
		defer store.Close()
		h.ofrep = experiment.NewOFREPHandler(store)
	}

	storageCtx, cancelStorage := context.WithTimeout(context.Background(), 15*time.Second)
	h.objects, err = configureObjectStorage(storageCtx)
	cancelStorage()
	if err != nil {
		log.Fatalf("configure object storage: %v", err)
	}

	guidelinesCtx, cancelGuidelines := context.WithTimeout(context.Background(), 15*time.Second)
	guidelineSearch, closeGuidelines, err := configureGuidelineSearch(guidelinesCtx)
	cancelGuidelines()
	if err != nil {
		log.Fatalf("configure guideline search: %v", err)
	}
	defer closeGuidelines()
	h.guidelines = guidelineSearch

	valkeyCtx, cancelValkey := context.WithTimeout(context.Background(), 5*time.Second)
	valkeyClient, err := configureValkey(valkeyCtx)
	cancelValkey()
	if err != nil {
		log.Fatalf("configure valkey: %v", err)
	}
	if valkeyClient != nil {
		h.valkey = valkeyClient
		h.dictionaries.wordsCache = valkeyClient
		defer valkeyClient.Close()
	}

	mux := http.NewServeMux()
	registerRoutes(mux, h, verifier)

	addr := ":" + port
	// Keep request logging inside tracing without breaking tracing's access to mux-populated r.Pattern.
	server := newHTTPServer(addr, withOptionalPrefix(publicPathPrefix, tracingMiddleware(requestLogMiddleware(corsMiddleware(mux)))))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErrCh := make(chan error, 1)
	go func() {
		log.Printf("go-svc listening on %s", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErrCh <- err
			return
		}
		serveErrCh <- nil
	}()

	select {
	case err := <-serveErrCh:
		if err != nil {
			log.Fatalf("serve: %v", err)
		}
	case <-ctx.Done():
		log.Print("received shutdown signal: no longer accepting new requests")

		shutdownCtx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
		defer cancel()

		serverBudget := serverShutdownTimeout
		if shutdownTelemetry != nil {
			serverBudget -= telemetryShutdownReserve
		}
		serverShutdownCtx, serverCancel := context.WithTimeout(shutdownCtx, serverBudget)
		defer serverCancel()
		if err := server.Shutdown(serverShutdownCtx); err != nil {
			log.Printf("graceful shutdown: %v", err)
		}
		if err := <-serveErrCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("serve after shutdown: %v", err)
		}

		if shutdownTelemetry != nil {
			// Use the overall shutdown context so telemetry gets the reserved flush window.
			if err := shutdownTelemetry(shutdownCtx); err != nil {
				log.Printf("shutdown telemetry: %v", err)
			}
		}
	}
}
