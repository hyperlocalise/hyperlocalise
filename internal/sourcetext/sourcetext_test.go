package sourcetext

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidText(t *testing.T) {
	require.True(t, ValidText("Home"))
	require.False(t, ValidText("Hi \x1eHLHTPH_AB_0\x1f there"))
	require.False(t, ValidText("Hi\x00"))
}

func TestEditableSQLNamesEveryExtensionAndSurface(t *testing.T) {
	sql := KeyEditableSQL("k")
	for _, extension := range EditableExtensions {
		require.Contains(t, sql, "'%"+extension+"'")
	}
	for _, surface := range EditableUploadSurfaces {
		require.Contains(t, sql, "'"+surface+"'")
	}
	require.Contains(t, sql, "k.repository_source_file_id is null")
}
