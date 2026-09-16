package editor_export

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSerializeXLIFFStructure(t *testing.T) {
	xliff := string(SerializeXLIFF([]Row{csvFixtureRow}))
	require.Contains(t, xliff, `<xliff version="1.2"`)
	require.Contains(t, xliff, `original="locales/en.json"`)
	require.Contains(t, xliff, `source-language="en"`)
	require.Contains(t, xliff, `target-language="vi"`)
	require.Contains(t, xliff, "Xin chào")
	requireValidXML(t, []byte(xliff))
}

func TestSerializeXLIFFEmptyKeyUsesSequentialUnitID(t *testing.T) {
	rows := []Row{
		{SourceText: "a", TargetText: "b", SourceLocale: "en", TargetLocale: "de"},
		{SourceText: "c", TargetText: "d", SourceLocale: "en", TargetLocale: "de"},
	}
	xliff := string(SerializeXLIFF(rows))
	require.Contains(t, xliff, `trans-unit id="unit-1"`)
	require.Contains(t, xliff, `trans-unit id="unit-2"`)
}

func TestSerializeXLIFFEmptyRowsUsesDefaults(t *testing.T) {
	xliff := string(SerializeXLIFF(nil))
	require.Contains(t, xliff, `source-language="en"`)
	require.Contains(t, xliff, `target-language="und"`)
	require.Contains(t, xliff, `original="cat-export"`)
}

func TestSerializeXLFAndXLIFFShareBodyDistinctMetadata(t *testing.T) {
	rows := []Row{csvFixtureRow}
	xlf, err := Serialize(FormatXLF, rows)
	require.NoError(t, err)
	xliff, err := Serialize(FormatXLIFF, rows)
	require.NoError(t, err)
	require.Equal(t, xlf.Body, xliff.Body)
	require.Equal(t, "xlf", xlf.Extension)
	require.Equal(t, "xliff", xliff.Extension)
	require.Equal(t, "application/x-xliff+xml; charset=utf-8", xlf.ContentType)
	require.Equal(t, "application/xliff+xml; charset=utf-8", xliff.ContentType)
}

func TestSerializeXLIFFMultipleUnits(t *testing.T) {
	xliff := string(SerializeXLIFF(makeExportRows(5)))
	require.Equal(t, 5, strings.Count(xliff, "<trans-unit "))
}
