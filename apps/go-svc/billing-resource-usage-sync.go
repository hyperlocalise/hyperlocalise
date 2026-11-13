package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/jackc/pgx/v5"
)

const (
	billingSyncTimeout = 60 * time.Second
	autumnTrackTimeout = 20 * time.Second

	workspaceResourceSyncKeyPrefix = "workspace_resource_usage_sync"
	maxWorkspaceResourceSyncError  = 500

	workspaceResourceSyncSynced        = "synced"
	workspaceResourceSyncUpToDate      = "up_to_date"
	workspaceResourceSyncFailed        = "failed"
	workspaceResourceSyncSkipped       = "skipped"
	workspaceResourceSyncPartialFailed = "partial_failed"

	autumnTransportErrorPrefix = "Autumn resource usage sync request failed"
)

var workspaceResourceFeatureOrder = []string{"seats", "projects", "automations", "integrations"}

type workspaceResourceSyncFeatureResult struct {
	FeatureID           string  `json:"featureId"`
	LocalUsage          int     `json:"localUsage"`
	PreviousSyncedUsage int     `json:"previousSyncedUsage"`
	Delta               int     `json:"delta"`
	Status              string  `json:"status"`
	OperationKey        *string `json:"operationKey"`
	Error               *string `json:"error"`
}

type workspaceResourceSyncResult struct {
	Status        string                               `json:"status"`
	ResourceUsage workspaceResourceUsage               `json:"resourceUsage"`
	Results       []workspaceResourceSyncFeatureResult `json:"results"`
}

func (u workspaceResourceUsage) forFeature(featureID string) int {
	switch featureID {
	case "seats":
		return u.Seats
	case "projects":
		return u.Projects
	case "automations":
		return u.Automations
	default:
		return u.Integrations
	}
}

func syncWorkspaceResourceUsage(ctx context.Context, pool dictionaryPool, client *autumn.Client, organizationID string) (workspaceResourceSyncResult, error) {
	usage, err := countWorkspaceResourceUsage(ctx, pool, organizationID)
	if err != nil {
		return workspaceResourceSyncResult{}, err
	}
	results := make([]workspaceResourceSyncFeatureResult, len(workspaceResourceFeatureOrder))
	if client == nil || !client.HasSecretKey() {
		notConfigured := "autumn_not_configured"
		for i, featureID := range workspaceResourceFeatureOrder {
			results[i] = workspaceResourceSyncFeatureResult{
				FeatureID:  featureID,
				LocalUsage: usage.forFeature(featureID),
				Status:     workspaceResourceSyncSkipped,
				Error:      &notConfigured,
			}
		}
		return workspaceResourceSyncResult{Status: workspaceResourceSyncSkipped, ResourceUsage: usage, Results: results}, nil
	}

	errs := make([]error, len(workspaceResourceFeatureOrder))
	var wg sync.WaitGroup
	for i, featureID := range workspaceResourceFeatureOrder {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i], errs[i] = syncWorkspaceResourceFeature(ctx, pool, client, organizationID, featureID, usage.forFeature(featureID))
		}()
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		return workspaceResourceSyncResult{}, err
	}

	status := workspaceResourceSyncSynced
	for _, result := range results {
		if result.Status == workspaceResourceSyncFailed {
			status = workspaceResourceSyncPartialFailed
			break
		}
	}
	return workspaceResourceSyncResult{Status: status, ResourceUsage: usage, Results: results}, nil
}

func syncWorkspaceResourceFeature(
	ctx context.Context,
	pool dictionaryPool,
	client *autumn.Client,
	organizationID, featureID string,
	localUsage int,
) (workspaceResourceSyncFeatureResult, error) {
	result := workspaceResourceSyncFeatureResult{FeatureID: featureID, LocalUsage: localUsage}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	lockKey := workspaceResourceSyncKeyPrefix + ":" + organizationID + ":" + featureID
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, lockKey); err != nil {
		return result, err
	}
	stateID, syncedUsage, syncSequence, err := getOrCreateWorkspaceResourceSyncState(ctx, tx, organizationID, featureID)
	if err != nil {
		return result, err
	}
	result.PreviousSyncedUsage = syncedUsage
	result.Delta = localUsage - syncedUsage
	nextSequence := syncSequence + 1
	operationKey := lockKey + ":" + strconv.Itoa(nextSequence)

	if result.Delta == 0 {
		if _, err := tx.Exec(ctx, `update workspace_resource_usage_sync_states
            set status='up_to_date', last_sync_error=null, last_synced_at=now(), updated_at=now()
            where id=$1`, stateID); err != nil {
			return result, err
		}
		result.Status = workspaceResourceSyncUpToDate
		return result, tx.Commit(ctx)
	}

	result.OperationKey = &operationKey
	trackCtx, cancel := context.WithTimeout(ctx, autumnTrackTimeout)
	trackErr := client.Track(trackCtx, autumn.TrackRequest{
		CustomerID:     organizationID,
		FeatureID:      featureID,
		Value:          float64(result.Delta),
		IdempotencyKey: operationKey,
		Properties: map[string]any{
			"source":     workspaceResourceSyncKeyPrefix,
			"feature_id": featureID,
		},
	})
	cancel()
	if status, ok := autumn.HTTPStatus(trackErr); ok && status == 409 {
		trackErr = nil
	}
	if trackErr != nil {
		message := workspaceResourceSyncErrorMessage(trackErr)
		if _, err := tx.Exec(ctx, `update workspace_resource_usage_sync_states
            set status='failed', last_sync_error=$2, updated_at=now()
            where id=$1`, stateID, message); err != nil {
			return result, err
		}
		result.Status = workspaceResourceSyncFailed
		result.Error = &message
		return result, tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx, `update workspace_resource_usage_sync_states
        set synced_usage=$2, sync_sequence=$3, status='synced', last_sync_error=null, last_synced_at=now(), updated_at=now()
        where id=$1`, stateID, localUsage, nextSequence); err != nil {
		return result, err
	}
	result.Status = workspaceResourceSyncSynced
	return result, tx.Commit(ctx)
}

func getOrCreateWorkspaceResourceSyncState(ctx context.Context, tx pgx.Tx, organizationID, featureID string) (id string, syncedUsage, syncSequence int, err error) {
	err = tx.QueryRow(ctx, `insert into workspace_resource_usage_sync_states (organization_id, feature_id, synced_usage)
        values ($1, $2, 0)
        on conflict do nothing
        returning id, synced_usage, sync_sequence`, organizationID, featureID).Scan(&id, &syncedUsage, &syncSequence)
	if !errors.Is(err, pgx.ErrNoRows) {
		return id, syncedUsage, syncSequence, err
	}
	err = tx.QueryRow(ctx, `select id, synced_usage, sync_sequence from workspace_resource_usage_sync_states
        where organization_id=$1 and feature_id=$2 limit 1`, organizationID, featureID).Scan(&id, &syncedUsage, &syncSequence)
	if errors.Is(err, pgx.ErrNoRows) {
		err = errors.New("workspace_resource_usage_sync_state_missing")
	}
	return id, syncedUsage, syncSequence, err
}

func workspaceResourceSyncErrorMessage(err error) string {
	var message string
	if status, ok := autumn.HTTPStatus(err); ok {
		message = fmt.Sprintf("Autumn resource usage sync failed with HTTP %d", status)
	} else {
		message = autumnTransportErrorPrefix + autumnTransportErrorCategory(err)
	}
	if len(message) > maxWorkspaceResourceSyncError {
		message = message[:maxWorkspaceResourceSyncError]
	}
	return message
}

func autumnTransportErrorCategory(err error) string {
	var netErr net.Error
	var dnsErr *net.DNSError
	var certErr *tls.CertificateVerificationError
	var recordErr tls.RecordHeaderError
	var authorityErr x509.UnknownAuthorityError
	var hostnameErr x509.HostnameError
	switch {
	case errors.Is(err, context.DeadlineExceeded), errors.As(err, &netErr) && netErr.Timeout():
		return ": timeout"
	case errors.Is(err, context.Canceled):
		return ": canceled"
	case errors.As(err, &dnsErr):
		return ": dns lookup failed"
	case errors.Is(err, syscall.ECONNREFUSED):
		return ": connection refused"
	case errors.Is(err, syscall.ECONNRESET):
		return ": connection reset"
	case errors.As(err, &certErr), errors.As(err, &recordErr), errors.As(err, &authorityErr), errors.As(err, &hostnameErr):
		return ": tls handshake failed"
	default:
		return ""
	}
}
