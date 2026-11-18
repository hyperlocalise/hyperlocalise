package publicauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestFetchWorkOSJWKS(t *testing.T) {
	fixture := newJWTFixture(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(fixture.jwks))
	}))
	t.Cleanup(server.Close)

	resp, err := FetchWorkOSJWKS(context.Background(), server.URL)
	require.NoError(t, err)
	require.Len(t, resp.Keys, 1)
	require.Equal(t, "test-kid", resp.Keys[0].Kid)
}

func countingJWKS(fixture jwtFixture, fetches *int) *JWKS {
	keys := NewJWKS("https://jwks.test/sso/jwks/" + testWorkOSClientID)
	keys.Fetch = func(_ context.Context, _ string) (*workos.JWKSResponse, error) {
		*fetches++
		return fixture.jwks, nil
	}
	return keys
}

func TestJWKSDoesNotRefreshUnknownKidWhileFresh(t *testing.T) {
	fetches := 0
	keys := countingJWKS(newJWTFixture(t), &fetches)

	_, err := keys.PublicKey(context.Background(), "test-kid")
	require.NoError(t, err)
	require.Equal(t, 1, fetches)

	_, err = keys.PublicKey(context.Background(), "unknown-kid-1")
	require.Error(t, err)
	_, err = keys.PublicKey(context.Background(), "unknown-kid-2")
	require.Error(t, err)
	require.Equal(t, 1, fetches)

	_, err = keys.PublicKey(context.Background(), "test-kid")
	require.NoError(t, err)
	require.Equal(t, 1, fetches)
}

func TestJWKSRefreshesUnknownKidAfterExpiry(t *testing.T) {
	fetches := 0
	keys := countingJWKS(newJWTFixture(t), &fetches)

	_, err := keys.PublicKey(context.Background(), "test-kid")
	require.NoError(t, err)
	require.Equal(t, 1, fetches)

	keys.mu.Lock()
	keys.expiry = time.Now().Add(-time.Second)
	keys.mu.Unlock()

	_, err = keys.PublicKey(context.Background(), "unknown-kid")
	require.Error(t, err)
	require.Equal(t, 2, fetches)
}
