package main

import (
	"context"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"
)

// goSvcMaxDBConns is the connection ceiling for one go-svc task.
// pgx otherwise uses max(4, runtime.NumCPU()). On Fargate, NumCPU is the host
// size, so a 1 vCPU task can hold one connection per host CPU. Guideline
// search shares this pool.
const goSvcMaxDBConns int32 = 4

func openServiceDatabase(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	if config.MaxConns > goSvcMaxDBConns {
		config.MaxConns = goSvcMaxDBConns
	}
	slog.Info("postgres_pool_configured", "max_conns", config.MaxConns)
	return pgxpool.NewWithConfig(ctx, config)
}
