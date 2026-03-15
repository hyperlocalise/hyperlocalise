package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

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

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("shutting down gracefully")
		grpcServer.GracefulStop()
	}()

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("serve grpc: %v", err)
	}
}
