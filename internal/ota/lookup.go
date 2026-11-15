package ota

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

type DB interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var ErrNotFound = errors.New("ota release not found")

type Release struct {
	Manifest json.RawMessage
	Contents map[string]map[string]string
	Format   string
}

type Lookup interface {
	LatestUnrevoked(ctx context.Context, hash string) (*Release, error)
}

type PGLookup struct {
	pool DB
}

func NewPGLookup(pool DB) *PGLookup {
	return &PGLookup{pool: pool}
}

func (l *PGLookup) LatestUnrevoked(ctx context.Context, hash string) (*Release, error) {
	if l == nil || l.pool == nil {
		return nil, ErrNotFound
	}
	var (
		manifest []byte
		contents []byte
		format   string
	)
	err := l.pool.QueryRow(ctx, `
		select r.manifest, coalesce(r.contents, '{}'::jsonb), d.format
		from ota_distributions d
		inner join ota_releases r on r.distribution_id = d.id
		where d.public_hash = $1
			and d.revoked_at is null
			and r.status = 'success'
		order by r.sequence desc
		limit 1
	`, strings.ToLower(hash)).Scan(&manifest, &contents, &format)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	release := &Release{Manifest: manifest, Format: format, Contents: map[string]map[string]string{}}
	if len(contents) > 0 {
		if err := json.Unmarshal(contents, &release.Contents); err != nil {
			return nil, err
		}
	}
	return release, nil
}
