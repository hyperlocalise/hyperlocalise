package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	serverReadHeaderTimeout = 5 * time.Second
	serverReadTimeout       = 15 * time.Second
	serverWriteTimeout      = 15 * time.Second
	serverIdleTimeout       = 60 * time.Second
	serverShutdownTimeout   = 10 * time.Second

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

	mux := http.NewServeMux()
	registerRoutes(mux, h, verifier)

	addr := ":" + port
	server := newHTTPServer(addr, withOptionalPrefix(publicPathPrefix, mux))

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
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("graceful shutdown: %v", err)
		}
		if err := <-serveErrCh; err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("serve after shutdown: %v", err)
		}
	}
}
