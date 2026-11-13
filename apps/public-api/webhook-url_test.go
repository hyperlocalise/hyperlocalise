package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateWebhookEndpointURL(t *testing.T) {
	t.Parallel()
	ok, err := validateWebhookEndpointURL("  https://hooks.example.com/in  ")
	require.NoError(t, err)
	require.Equal(t, "https://hooks.example.com/in", ok)

	for _, raw := range []string{
		"http://hooks.example.com/in",
		"https://127.0.0.1/hook",
		"https://localhost/hook",
		"https://10.0.0.8/hook",
		"https://192.168.1.1/hook",
		"https://[::1]/hook",
		"ftp://hooks.example.com/in",
		"not-a-url",
		"https://user:pass@hooks.example.com/in",
	} {
		_, err := validateWebhookEndpointURL(raw)
		require.ErrorIs(t, err, errWebhookURLInvalid, raw)
	}
}
