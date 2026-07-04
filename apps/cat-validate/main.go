package main

import (
	"log"
	"net/http"
	"os"
)

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
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
