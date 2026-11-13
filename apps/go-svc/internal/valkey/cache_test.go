package valkey_test

import (
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
	"github.com/stretchr/testify/require"
)

func TestCacheCommands(t *testing.T) {
	_, client := testenv.Open(t)
	key := "go-svc:test:cache:" + t.Name() + time.Now().Format("150405.000000000")
	ctx := t.Context()
	_, err := client.Get(ctx, key)
	require.ErrorIs(t, err, valkey.ErrNil)
	require.NoError(t, client.Set(ctx, key, `["AuthKit"]`, time.Minute))
	value, err := client.Get(ctx, key)
	require.NoError(t, err)
	require.Equal(t, `["AuthKit"]`, value)
	ttl, err := client.Inner().Do(ctx, client.Inner().B().Pttl().Key(key).Build()).AsInt64()
	require.NoError(t, err)
	require.Positive(t, ttl)
	require.LessOrEqual(t, ttl, time.Minute.Milliseconds())
	require.NoError(t, client.Set(ctx, key, `[]`, 10*time.Millisecond))
	require.Eventually(t, func() bool {
		_, getErr := client.Get(ctx, key)
		return getErr != nil
	}, time.Second, 10*time.Millisecond)
	revKey := key + ":rev"
	first, err := client.Incr(ctx, revKey)
	require.NoError(t, err)
	require.Equal(t, int64(1), first)
	second, err := client.Incr(ctx, revKey)
	require.NoError(t, err)
	require.Equal(t, int64(2), second)
}
