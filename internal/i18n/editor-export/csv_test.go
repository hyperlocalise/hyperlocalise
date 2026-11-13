package editor_export

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

var csvFixtureRow = Row{
	Key:          `greet,"user"`,
	SourceText:   "Hello\nworld",
	TargetText:   "Xin chào",
	SourceLocale: "en",
	TargetLocale: "vi",
	SourcePath:   "locales/en.json",
}

func TestSerializeCSVHeaderAndEscaping(t *testing.T) {
	csv := string(SerializeCSV([]Row{csvFixtureRow}))
	require.True(t, strings.HasPrefix(csv, "key,source_locale,target_locale,source_text,target_text,source_path\n"))
	require.Contains(t, csv, `"greet,""user"""`)
	require.Contains(t, csv, "\"Hello\nworld\"")
	require.Contains(t, csv, "Xin chào")
	require.Contains(t, csv, "locales/en.json")
}

func TestSerializeCSVEmptyRows(t *testing.T) {
	csv := string(SerializeCSV(nil))
	require.Equal(t, "key,source_locale,target_locale,source_text,target_text,source_path\n", csv)
}

func TestSerializeCSVMultipleRows(t *testing.T) {
	rows := []Row{
		{Key: "a", SourceLocale: "en", TargetLocale: "de", SourceText: "A", TargetText: "B"},
		{Key: "b", SourceLocale: "en", TargetLocale: "de", SourceText: "C", TargetText: "D"},
	}
	csv := string(SerializeCSV(rows))
	lines := strings.Split(strings.TrimSuffix(csv, "\n"), "\n")
	require.Len(t, lines, 3)
}

func TestSerializeCSVSpecialCharacters(t *testing.T) {
	row := Row{
		Key:          "k",
		SourceText:   "a,b\r\nc",
		TargetText:   `"quoted"`,
		SourceLocale: "en",
		TargetLocale: "de",
	}
	csv := string(SerializeCSV([]Row{row}))
	require.Contains(t, csv, `"a,b`+"\r\n"+`c"`)
	require.Contains(t, csv, `"""quoted"""`)
}

func TestSerializeCSVResultMetadata(t *testing.T) {
	result, err := Serialize(FormatCSV, []Row{csvFixtureRow})
	require.NoError(t, err)
	require.Equal(t, "csv", result.Extension)
	require.Equal(t, "text/csv; charset=utf-8", result.ContentType)
	require.NotEmpty(t, result.Body)
}
