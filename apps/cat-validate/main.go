package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

const (
	serverReadHeaderTimeout = 5 * time.Second
	serverReadTimeout       = 15 * time.Second
	serverWriteTimeout      = 15 * time.Second
	serverIdleTimeout       = 60 * time.Second
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

	h := newHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.health)
	mux.Handle("POST /v1/validate/segment", authMiddleware(verifier)(http.HandlerFunc(h.validateSegment)))

	addr := ":" + port
	log.Printf("cat-validate listening on %s", addr)
	if err := newHTTPServer(addr, mux).ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
