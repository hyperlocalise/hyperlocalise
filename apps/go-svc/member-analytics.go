package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"maps"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	productUsageSeatAddedEvent  = "seat_added"
	productUsageSeatAddedStatus = "created"
	gaMeasurementID             = "G-ET30XL0TE6"
	gaMeasurementProtocolURL    = "https://www.google-analytics.com/mp/collect"
	memberProductUsageTimeout   = 3 * time.Second
)

type memberProductUsageTracker interface {
	Track(ctx context.Context, name string, properties map[string]string)
}

type gaProductUsageTracker struct {
	measurementID string
	apiSecret     string
	endpoint      string
	http          productUsageHTTPDoer
}

type productUsageHTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

func newGAProductUsageTrackerFromEnv() memberProductUsageTracker {
	secret := strings.TrimSpace(os.Getenv("GA_MEASUREMENT_PROTOCOL_API_SECRET"))
	if secret == "" {
		return nil
	}
	return &gaProductUsageTracker{
		measurementID: gaMeasurementID,
		apiSecret:     secret,
	}
}

func (api *memberAPI) trackSeatAdded(ctx context.Context) {
	if api == nil || api.analytics == nil {
		return
	}
	api.analytics.Track(ctx, productUsageSeatAddedEvent, map[string]string{
		"status": productUsageSeatAddedStatus,
		"source": workspaceResourceSeatsFeatureID,
	})
}

func (t *gaProductUsageTracker) Track(ctx context.Context, name string, properties map[string]string) {
	if t == nil || strings.TrimSpace(t.apiSecret) == "" {
		return
	}
	go t.post(context.WithoutCancel(ctx), name, maps.Clone(properties))
}

func (t *gaProductUsageTracker) post(ctx context.Context, name string, properties map[string]string) {
	if t == nil || strings.TrimSpace(t.apiSecret) == "" {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, memberProductUsageTimeout)
	defer cancel()

	endpoint := strings.TrimSpace(t.endpoint)
	if endpoint == "" {
		endpoint = gaMeasurementProtocolURL
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return
	}
	query := u.Query()
	query.Set("measurement_id", t.measurementID)
	query.Set("api_secret", t.apiSecret)
	u.RawQuery = query.Encode()

	if properties == nil {
		properties = map[string]string{}
	}
	body, err := json.Marshal(map[string]any{
		"client_id": uuid.NewString(),
		"events": []map[string]any{
			{
				"name":   name,
				"params": properties,
			},
		},
	})
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := t.http
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
}
