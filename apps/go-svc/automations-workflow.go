package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
)

const (
	automationWorkflowPath    = "/api/internal/iris/automation-action"
	automationWorkflowTimeout = 2 * time.Minute
)

func callAutomationWorkflow(ctx context.Context, action string, payload map[string]any) (any, int, error) {
	baseURL := strings.TrimRight(tmsauth.BaseURLFromEnv(), "/")
	if baseURL == "" || strings.TrimSpace(os.Getenv("WORKOS_COOKIE_PASSWORD")) == "" {
		return nil, 0, automationFailure(http.StatusServiceUnavailable, "automations_workflow_unconfigured", "This action needs the web app workflow service.")
	}
	body, err := json.Marshal(map[string]any{"action": action, "payload": payload})
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := context.WithTimeout(ctx, automationWorkflowTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+automationWorkflowPath, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, automationFailure(http.StatusBadGateway, "automations_workflow_unavailable", "The web app workflow service did not respond.")
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, 0, err
	}
	var decoded map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, 0, fmt.Errorf("automation workflow: %w", err)
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		code, _ := decoded["error"].(string)
		message, _ := decoded["message"].(string)
		if code == "" {
			code = "automations_workflow_failed"
		}
		if message == "" {
			message = "The web app workflow service rejected the action."
		}
		details, _ := decoded["details"].(map[string]any)
		if len(details) > 0 {
			return nil, 0, automationFailureDetails(resp.StatusCode, code, message, details)
		}
		return nil, 0, automationFailure(resp.StatusCode, code, message)
	}
	if result, ok := decoded["result"]; ok {
		return result, resp.StatusCode, nil
	}
	return decoded, resp.StatusCode, nil
}

func automationWorkflowPayload(actor automationActor, extra map[string]any) map[string]any {
	payload := map[string]any{}
	for key, value := range extra {
		if value != nil {
			payload[key] = value
		}
	}
	payload["organizationId"] = actor.organizationID
	payload["userId"] = actor.userID
	payload["workosUserId"] = actor.workosUserID
	return payload
}
