package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultPort       = "8081"
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 10 * time.Second
	writeTimeout      = 15 * time.Second
	idleTimeout       = 60 * time.Second
	shutdownTimeout   = 10 * time.Second
	maxHeaderBytes    = 16 * 1024
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx); err != nil {
		slog.Error("public API stopped", "error", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("connect database: %w", err)
	}
	auth := newPostgresAuthenticator(pool, autumnClientFromEnv(os.Getenv("AUTUMN_API_KEY")))
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return errors.New("PORT must be between 1 and 65535")
	}
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           newHandler(auth, &postgresStore{pool: pool}),
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		MaxHeaderBytes:    maxHeaderBytes,
	}
	finished := make(chan error, 1)
	go func() { finished <- server.ListenAndServe() }()
	slog.Info("public API listening", "port", port)
	select {
	case err := <-finished:
		return fmt.Errorf("serve public API: %w", err)
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			if closeErr := server.Close(); closeErr != nil {
				return errors.Join(err, closeErr)
			}
			return fmt.Errorf("shutdown public API: %w", err)
		}
		if err := <-finished; !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
