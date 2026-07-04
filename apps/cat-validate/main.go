package main

import (
	"log"
	"net/http"
	"os"

	"github.com/workos/workos-go/v4/pkg/usermanagement"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	apiKey := os.Getenv("WORKOS_API_KEY")
	if apiKey == "" {
		log.Fatal("WORKOS_API_KEY is required")
	}
	usermanagement.SetAPIKey(apiKey)

	clientID := os.Getenv("WORKOS_CLIENT_ID")
	verifier, err := NewWorkOSTokenVerifier(clientID)
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
