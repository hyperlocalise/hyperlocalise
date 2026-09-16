package editor_export

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBuildFilename(t *testing.T) {
	tests := []struct {
		sourcePath   string
		targetLocale string
		extension    string
		want         string
	}{
		{"*", "vi", "csv", "all-files-vi.csv"},
		{"locales/en/messages.json", "de", "xlf", "messages-de.xlf"},
		{"sheets/rates.xlsx", "ja", "xlsx", "rates-ja.xlsx"},
		{"", "en", "tmx", "cat-export-en.tmx"},
		{"./", "en", "csv", "cat-export-en.csv"},
	}
	for _, tc := range tests {
		require.Equal(t, tc.want, BuildFilename(tc.sourcePath, tc.targetLocale, tc.extension))
	}
}
