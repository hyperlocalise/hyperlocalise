package store

import (
	"database/sql"

	"github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

func init() {
	sql.Register("postgres", stdlib.GetDefaultDriver())
}
