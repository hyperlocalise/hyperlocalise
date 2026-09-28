package activitylog

import (
	"context"

	"github.com/jackc/pgx/v5/pgconn"
)

type Executor interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

type Store struct {
	db Executor
}

func NewStore(db Executor) *Store {
	return &Store{db: db}
}

func (s *Store) Insert(ctx context.Context, event Event) error {
	createdAt, err := event.CreatedTime()
	if err != nil {
		return err
	}

	_, err = s.db.Exec(ctx, `
		insert into organization_activity_events (
			actor_credential_id,
			actor_kind,
			actor_user_id,
			created_at,
			event_type,
			id,
			organization_id,
			payload,
			target_id,
			target_kind
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		on conflict (id) do nothing`,
		event.ActorCredentialID,
		event.ActorKind,
		event.ActorUserID,
		createdAt,
		event.EventType,
		event.ID,
		event.OrganizationID,
		event.Payload,
		event.TargetID,
		event.TargetKind,
	)
	return err
}
