package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTrackSeatAdded(t *testing.T) {
	api := &memberAPI{}
	api.trackSeatAdded(t.Context())

	rec := &recordingMemberAnalytics{}
	api.analytics = rec
	api.trackSeatAdded(t.Context())
	requireSeatAddedEvents(t, api, 1)
}

func TestNewGAProductUsageTrackerFromEnv(t *testing.T) {
	t.Setenv("GA_MEASUREMENT_PROTOCOL_API_SECRET", "")
	require.Nil(t, newGAProductUsageTrackerFromEnv())

	t.Setenv("GA_MEASUREMENT_PROTOCOL_API_SECRET", " test-secret ")
	tracker, ok := newGAProductUsageTrackerFromEnv().(*gaProductUsageTracker)
	require.True(t, ok)
	require.Equal(t, "test-secret", tracker.apiSecret)
	require.Equal(t, gaMeasurementID, tracker.measurementID)
}

func TestGAProductUsageTrackerNoopsWithoutSecret(t *testing.T) {
	called := false
	tracker := &gaProductUsageTracker{
		http: productUsageHTTPDoerFunc(func(*http.Request) (*http.Response, error) {
			called = true
			return &http.Response{StatusCode: 204, Body: http.NoBody}, nil
		}),
	}
	tracker.Track(t.Context(), productUsageSeatAddedEvent, map[string]string{"status": "created"})
	tracker.post(t.Context(), productUsageSeatAddedEvent, map[string]string{"status": "created"})
	require.False(t, called)
}

func TestGAProductUsageTrackerPostsSeatAdded(t *testing.T) {
	var gotURL string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotURL = r.URL.String()
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		raw, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(raw, &gotBody))
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	tracker := &gaProductUsageTracker{
		measurementID: gaMeasurementID,
		apiSecret:     "test-secret",
		endpoint:      srv.URL,
		http:          srv.Client(),
	}
	tracker.post(t.Context(), productUsageSeatAddedEvent, map[string]string{
		"status": productUsageSeatAddedStatus,
		"source": workspaceResourceSeatsFeatureID,
	})

	require.Contains(t, gotURL, "measurement_id="+gaMeasurementID)
	require.Contains(t, gotURL, "api_secret=test-secret")
	require.NotEmpty(t, gotBody["client_id"])
	events, ok := gotBody["events"].([]any)
	require.True(t, ok)
	require.Len(t, events, 1)
	event, ok := events[0].(map[string]any)
	require.True(t, ok)
	require.Equal(t, productUsageSeatAddedEvent, event["name"])
	require.Equal(t, map[string]any{
		"status": productUsageSeatAddedStatus,
		"source": workspaceResourceSeatsFeatureID,
	}, event["params"])
}

func TestGAProductUsageTrackerSwallowsNetworkFailures(t *testing.T) {
	tracker := &gaProductUsageTracker{
		measurementID: gaMeasurementID,
		apiSecret:     "test-secret",
		endpoint:      "http://127.0.0.1:1",
	}
	require.NotPanics(t, func() {
		tracker.post(t.Context(), productUsageSeatAddedEvent, map[string]string{"status": "created"})
	})
}

type productUsageHTTPDoerFunc func(*http.Request) (*http.Response, error)

func (fn productUsageHTTPDoerFunc) Do(req *http.Request) (*http.Response, error) {
	return fn(req)
}
