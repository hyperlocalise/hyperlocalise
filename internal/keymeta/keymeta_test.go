package keymeta

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidTags(t *testing.T) {
	require.True(t, ValidTags([]string{"release-7", "checkout_v2"}, MaxTagsPerChange))
	require.True(t, ValidTags(nil, MaxTagsPerChange))
	require.False(t, ValidTags([]string{"has space"}, MaxTagsPerChange))
	require.False(t, ValidTags([]string{""}, MaxTagsPerChange))
	require.False(t, ValidTags([]string{strings.Repeat("a", MaxTagLength+1)}, MaxTagsPerChange))
	require.True(t, ValidTags([]string{strings.Repeat("a", MaxTagLength)}, MaxTagsPerChange))
	require.False(t, ValidTags([]string{"a", "b", "c"}, 2))
}

func TestValidDesignURL(t *testing.T) {
	require.True(t, ValidDesignURL("https://www.figma.com/file/abc?node-id=1"))
	require.True(t, ValidDesignURL("http://example.com/x"))
	require.False(t, ValidDesignURL("javascript:alert(1)"))
	require.False(t, ValidDesignURL("https://"))
	require.False(t, ValidDesignURL(""))
	require.False(t, ValidDesignURL("https://example.com/"+strings.Repeat("a", MaxDesignURLLength)))
}

func TestTagsAfterChangeSQL(t *testing.T) {
	require.Equal(t, `ARRAY(SELECT DISTINCT t FROM unnest(k.tags || $4::text[]) t
			WHERE t <> ALL($5::text[]) ORDER BY t)`, TagsAfterChangeSQL("k.tags", 4, 5))
}
