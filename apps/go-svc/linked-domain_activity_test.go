package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestLinkedDomainCreateCancelAndMarketsPublishActivity(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	publisher := &recordingActivityLogPublisher{}
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	h.workspace.activityLog = publisher
	domain := fmt.Sprintf("activity-%s.example", strings.ReplaceAll(uuid.NewString(), "-", ""))

	create := workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		LinkedDomain struct {
			ID string `json:"id"`
		} `json:"linkedDomain"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	again := workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusCreated, again.Code, again.Body.String())

	_, err := scope.Pool.Exec(t.Context(), `
		update linked_domains
		set status='verified', verified_at=now(), verified_method='dns_txt', updated_at=now()
		where id=$1`, created.LinkedDomain.ID)
	require.NoError(t, err)

	unchanged := workspaceRequest(t, h, scope, http.MethodPatch, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID+"/markets"), `{"marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusOK, unchanged.Code, unchanged.Body.String())

	markets := workspaceRequest(t, h, scope, http.MethodPatch, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID+"/markets"), `{"marketIds":["france-fr","germany-de"]}`)
	require.Equal(t, http.StatusOK, markets.Code, markets.Body.String())

	events := publisher.recorded()
	require.Len(t, events, 2)
	require.Equal(t, "linked_domain_created", events[0].EventType)
	require.Equal(t, "linked_domain", events[0].TargetKind)
	require.Equal(t, created.LinkedDomain.ID, events[0].TargetID)
	require.Equal(t, domain, events[0].Payload["name"])
	require.Equal(t, "pending_verification", events[0].Payload["status"])

	require.Equal(t, "linked_domain_markets_changed", events[1].EventType)
	require.Equal(t, created.LinkedDomain.ID, events[1].TargetID)
	require.Equal(t, []string{"france-fr"}, events[1].Payload["previousMarketIds"])
	require.Equal(t, []string{"france-fr", "germany-de"}, events[1].Payload["nextMarketIds"])
}

func TestLinkedDomainCancelPublishesActivity(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	publisher := &recordingActivityLogPublisher{}
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	h.workspace.activityLog = publisher
	domain := fmt.Sprintf("cancel-%s.example", strings.ReplaceAll(uuid.NewString(), "-", ""))

	create := workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/linked-domains"), `{"domain":"`+domain+`","marketIds":["france-fr"]}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		LinkedDomain struct {
			ID string `json:"id"`
		} `json:"linkedDomain"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))

	cancel := workspaceRequest(t, h, scope, http.MethodDelete, scope.OrgPath("/domains/linked-domains/"+created.LinkedDomain.ID), "")
	require.Equal(t, http.StatusNoContent, cancel.Code)

	events := publisher.recorded()
	require.Len(t, events, 2)
	require.Equal(t, "linked_domain_created", events[0].EventType)
	require.Equal(t, "linked_domain_cancelled", events[1].EventType)
	require.Equal(t, created.LinkedDomain.ID, events[1].TargetID)
	require.Equal(t, domain, events[1].Payload["name"])
	require.Equal(t, "cancelled", events[1].Payload["status"])
}

func TestLinkedDomainVerifyPublishesActivity(t *testing.T) {
	publisher := &recordingActivityLogPublisher{}
	api := &linkedDomainAPI{workspace: &workspaceAPI{activityLog: publisher}}
	id := uuid.NewString()
	method := "dns_txt"
	row := linkedDomainRow{ID: id, DomainKey: "example.com", Status: "verified", VerifiedMethod: &method}
	api.publishLinkedDomainActivity(context.Background(), workspaceActor{
		userID:         uuid.NewString(),
		organizationID: uuid.NewString(),
	}, "linked_domain_verified", row, map[string]any{
		"name":           row.DomainKey,
		"resourceId":     row.ID,
		"status":         row.Status,
		"verifiedMethod": method,
	})
	events := publisher.recorded()
	require.Len(t, events, 1)
	require.Equal(t, "linked_domain_verified", events[0].EventType)
	require.Equal(t, "linked_domain", events[0].TargetKind)
	require.Equal(t, id, events[0].TargetID)
	require.Equal(t, "dns_txt", events[0].Payload["verifiedMethod"])
}
