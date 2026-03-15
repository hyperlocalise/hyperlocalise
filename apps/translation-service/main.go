package main

import (
	"log"
	"net"
	"os"

	translationservice "github.com/quiet-circles/hyperlocalise/api/services/translation"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/grpc"
)

const defaultListenAddr = ":8080"

func main() {
	listenAddr := os.Getenv("LISTEN_ADDR")
	if listenAddr == "" {
		listenAddr = defaultListenAddr
	}

	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("listen %q: %v", listenAddr, err)
	}

	grpcServer := grpc.NewServer()
	translationv1.RegisterTranslationServiceServer(grpcServer, translationservice.NewService())

	log.Printf("translation service listening on %s", listenAddr)

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("serve grpc: %v", err)
	}
}
