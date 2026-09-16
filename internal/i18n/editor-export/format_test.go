package editor_export

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseFormat(t *testing.T) {
	tests := []struct {
		raw    string
		want   Format
		wantOK bool
	}{
		{"csv", FormatCSV, true},
		{"CSV", FormatCSV, true},
		{" tmx ", FormatTMX, true},
		{"xlf", FormatXLF, true},
		{"xliff", FormatXLIFF, true},
		{"XLSX", FormatXLSX, true},
		{"", "", false},
		{"docx", "", false},
		{"csv,tmx", "", false},
	}
	for _, tc := range tests {
		got, err := ParseFormat(tc.raw)
		if tc.wantOK {
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
			continue
		}
		require.Error(t, err)
		require.Equal(t, Format(""), got)
	}
}

func TestSerializeRejectsTooManyRows(t *testing.T) {
	rows := makeExportRows(MaxRows + 1)
	_, err := Serialize(FormatCSV, rows)
	require.Error(t, err)
	require.Contains(t, err.Error(), "too many rows")
}
