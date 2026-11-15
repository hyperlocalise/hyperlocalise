package main

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHyperlabPublicOtaFormat(t *testing.T) {
	require.Equal(t, "android-xml", publicOtaFormat("android_xml"))
	require.Equal(t, "ios-strings", publicOtaFormat("ios-strings"))
	require.Equal(t, "json", publicOtaFormat(""))
}

func TestOtaBindingsByVariantEmpty(t *testing.T) {
	h := &handler{}
	out, err := h.otaBindingsByVariant(context.Background(), "org", nil)
	require.NoError(t, err)
	require.Empty(t, out)
}
