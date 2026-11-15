package experiment

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/postgres"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type DB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

var errUnauthorized = errors.New("unauthorized")

type FlagRecord struct {
	ID          string
	Key         string
	Kind        string
	ConfigValue json.RawMessage
	UpdatedAt   time.Time
}

type EvalRow struct {
	FlagID              string
	ExperimentID        string
	ExperimentCreatedAt time.Time
	Seed                int32
	VariantKey          string
	VariantCreatedAt    time.Time
	AllocStart          int
	AllocEnd            int
	Enabled             bool
	Payload             json.RawMessage
	Criterion           json.RawMessage
}

type OtaBinding struct {
	FlagKey    string
	VariantKey string
	Hash       string
	Branch     string
	Format     string
}

type Store interface {
	LookupOrganizationID(ctx context.Context, keyHash string) (string, error)
	LoadFlag(ctx context.Context, organizationID, key string) (*FlagRecord, error)
	LoadFlags(ctx context.Context, organizationID string) ([]FlagRecord, error)
	LoadEvalRows(ctx context.Context, organizationID string, flagIDs []string) ([]EvalRow, error)
	LoadOtaBindings(ctx context.Context, organizationID string) ([]OtaBinding, error)
	TouchClientKey(ctx context.Context, keyHash string)
}

type PGStore struct {
	pool DB
}

func NewPGStore(ctx context.Context, databaseURL string) (*PGStore, error) {
	pool, err := postgres.NewPool(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &PGStore{pool: pool}, nil
}

func NewPGStoreFromPool(pool DB) *PGStore {
	return &PGStore{pool: pool}
}

func (s *PGStore) Close() {
	if closer, ok := s.pool.(interface{ Close() }); ok {
		closer.Close()
	}
}

func HashClientKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

func (s *PGStore) LookupOrganizationID(ctx context.Context, keyHash string) (string, error) {
	var organizationID string
	err := s.pool.QueryRow(ctx, `
		select organization_id
		from experiment_client_keys
		where key_hash = $1 and revoked_at is null
	`, keyHash).Scan(&organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errUnauthorized
	}
	return organizationID, err
}

func (s *PGStore) TouchClientKey(ctx context.Context, keyHash string) {
	_, _ = s.pool.Exec(ctx, `
		update experiment_client_keys
		set last_used_at = now()
		where key_hash = $1 and revoked_at is null
	`, keyHash)
}

func (s *PGStore) LoadFlag(ctx context.Context, organizationID, key string) (*FlagRecord, error) {
	var flag FlagRecord
	var config []byte
	err := s.pool.QueryRow(ctx, `
		select f.id, f.key, f.kind, c.value, f.updated_at
		from experiment_flags f
		left join experiment_flag_configs c on c.flag_id = f.id
		where f.organization_id = $1 and f.key = $2
	`, organizationID, key).Scan(&flag.ID, &flag.Key, &flag.Kind, &config, &flag.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	flag.ConfigValue = config
	return &flag, nil
}

func (s *PGStore) LoadFlags(ctx context.Context, organizationID string) ([]FlagRecord, error) {
	rows, err := s.pool.Query(ctx, `
		select f.id, f.key, f.kind, c.value, f.updated_at
		from experiment_flags f
		left join experiment_flag_configs c on c.flag_id = f.id
		where f.organization_id = $1
		order by f.created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var flags []FlagRecord
	for rows.Next() {
		var flag FlagRecord
		var config []byte
		if err := rows.Scan(&flag.ID, &flag.Key, &flag.Kind, &config, &flag.UpdatedAt); err != nil {
			return nil, err
		}
		flag.ConfigValue = config
		flags = append(flags, flag)
	}
	return flags, rows.Err()
}

func (s *PGStore) LoadEvalRows(ctx context.Context, organizationID string, flagIDs []string) ([]EvalRow, error) {
	if len(flagIDs) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx, `
		select
			a.flag_id,
			e.id,
			e.created_at,
			e.seed,
			v.key,
			v.created_at,
			al.start,
			al.end,
			a.enabled,
			a.payload,
			coalesce(va.criterion, ea.criterion)
		from experiment_flag_assignments a
		inner join experiment_variants v on v.id = a.variant_id
		inner join experiments e on e.id = v.experiment_id
		inner join experiment_allocations al on al.variant_id = v.id
		left join experiment_audiences va on va.id = v.audience_id
		left join experiment_audiences ea on ea.id = e.audience_id
		where e.organization_id = $1
			and a.flag_id = any($2::uuid[])
			and e.status = 'active'
			and e.start_at <= now()
			and e.end_at >= now()
		order by e.created_at desc, v.created_at desc
	`, organizationID, flagIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []EvalRow
	for rows.Next() {
		var row EvalRow
		if err := rows.Scan(
			&row.FlagID,
			&row.ExperimentID,
			&row.ExperimentCreatedAt,
			&row.Seed,
			&row.VariantKey,
			&row.VariantCreatedAt,
			&row.AllocStart,
			&row.AllocEnd,
			&row.Enabled,
			&row.Payload,
			&row.Criterion,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *PGStore) LoadOtaBindings(ctx context.Context, organizationID string) ([]OtaBinding, error) {
	rows, err := s.pool.Query(ctx, `
		select f.key, v.key, d.public_hash, d.branch_name, d.format
		from ota_experiment_bindings b
		inner join experiment_variants v on v.id = b.variant_id
		inner join experiment_flag_assignments a on a.variant_id = v.id and a.enabled
		inner join experiment_flags f on f.id = a.flag_id and f.organization_id = b.organization_id
		inner join ota_distributions d on d.id = b.distribution_id and d.revoked_at is null and d.organization_id = b.organization_id
		where b.organization_id = $1
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OtaBinding
	for rows.Next() {
		var binding OtaBinding
		if err := rows.Scan(&binding.FlagKey, &binding.VariantKey, &binding.Hash, &binding.Branch, &binding.Format); err != nil {
			return nil, err
		}
		out = append(out, binding)
	}
	return out, rows.Err()
}
