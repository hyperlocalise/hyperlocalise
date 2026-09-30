package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestHyperlabFindAndDeleteScoped(t *testing.T) {
	now := time.Now().UTC()
	flagID := uuid.NewString()
	pool := &scriptPool{steps: []dbStep{{
		op:   opQueryRow,
		scan: []any{flagID, "org", "checkout", nil, "config", now, now},
	}}}
	h := newHandler()
	h.workspace = &workspaceAPI{pool: pool}
	flag, err := h.findFlag(context.Background(), "org", flagID)
	require.NoError(t, err)
	require.Equal(t, "checkout", flag.Key)

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	h.workspace.pool = pool
	_, err = h.findFlag(context.Background(), "org", flagID)
	require.EqualError(t, err, "flag_not_found")

	pool = &scriptPool{steps: []dbStep{{op: opExec, tag: pgconn.NewCommandTag("DELETE 1")}}}
	h.workspace.pool = pool
	req := httptest.NewRequest(http.MethodDelete, "/", nil)
	req.SetPathValue("flagId", flagID)
	_, status, err := h.deleteScoped(req, workspaceActor{organizationID: "org"}, "flagId", "flag_not_found", "missing", `delete from experiment_flags where id=$1 and organization_id=$2`)
	require.NoError(t, err)
	require.Equal(t, http.StatusNoContent, status)

	update := sqlSet{}
	update.set("name", "Checkout")
	require.Len(t, update.sets, 1)
	update.setRaw("criterion", `{}`)
	require.Len(t, update.sets, 2)
}
