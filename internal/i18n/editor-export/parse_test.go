package editor_export

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFormatFromFilename(t *testing.T) {
	csv, err := FormatFromFilename("all-files-vi.csv")
	require.NoError(t, err)
	require.Equal(t, FormatCSV, csv)

	xliff, err := FormatFromFilename("locales/en.XLIFF")
	require.NoError(t, err)
	require.Equal(t, FormatXLIFF, xliff)

	_, err = FormatFromFilename("notes.txt")
	require.Error(t, err)
}

func TestParseRoundTripAllFormats(t *testing.T) {
	source := []Row{
		{
			Key:          `greet,"user"`,
			SourceText:   "Hello <b>world</b> & friends",
			TargetText:   "Xin chào <b>thế giới</b>",
			SourceLocale: "en",
			TargetLocale: "vi",
			SourcePath:   "locales/en.json",
		},
		{
			Key:          "farewell",
			SourceText:   "Goodbye",
			TargetText:   "Tạm biệt",
			SourceLocale: "en",
			TargetLocale: "vi",
			SourcePath:   "locales/nav.json",
		},
	}

	for _, format := range []Format{FormatCSV, FormatTMX, FormatXLF, FormatXLIFF, FormatXLSX} {
		t.Run(string(format), func(t *testing.T) {
			serialized, err := Serialize(format, source)
			require.NoError(t, err)
			got, err := Parse(format, serialized.Body)
			require.NoError(t, err)
			require.Equal(t, source, got)
		})
	}
}

func TestParseCSVAcceptsBOMAndSkipsBlankKeys(t *testing.T) {
	body := []byte("\uFEFFkey,source_locale,target_locale,source_text,target_text,source_path\n" +
		"keep,en,fr,Hi,Salut,a.json\n" +
		",en,fr,skip,skip,a.json\n")
	rows, err := Parse(FormatCSV, body)
	require.NoError(t, err)
	require.Equal(t, []Row{{
		Key:          "keep",
		SourceLocale: "en",
		TargetLocale: "fr",
		SourceText:   "Hi",
		TargetText:   "Salut",
		SourcePath:   "a.json",
	}}, rows)
}

func TestParseXLIFFGroupsFilesAndRestoresMarkup(t *testing.T) {
	xliff := string(SerializeXLIFF([]Row{
		{Key: "a", SourceText: "One", TargetText: "Un", SourceLocale: "en", TargetLocale: "fr", SourcePath: "a.json"},
		{Key: "b", SourceText: "Two", TargetText: "Deux", SourceLocale: "en", TargetLocale: "fr", SourcePath: "b.json"},
	}))
	require.Equal(t, 2, strings.Count(xliff, "<file original="))
	require.Contains(t, xliff, `original="a.json"`)
	require.Contains(t, xliff, `original="b.json"`)

	rows, err := ParseXLIFF([]byte(xliff))
	require.NoError(t, err)
	require.Equal(t, "a.json", rows[0].SourcePath)
	require.Equal(t, "b.json", rows[1].SourcePath)
}

func TestParseXLIFFPreservesRepairedInlineTags(t *testing.T) {
	body := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file original="a.json" source-language="en" target-language="fr" datatype="plaintext">
    <body>
      <trans-unit id="hello">
        <source>Hello <ph id="1"/> world</source>
        <target>Bonjour <ph id="1"/> le monde</target>
      </trans-unit>
    </body>
  </file>
</xliff>`)
	rows, err := ParseXLIFF(body)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, `Hello <ph id="1"/> world`, rows[0].SourceText)
	require.Equal(t, `Bonjour <ph id="1"/> le monde`, rows[0].TargetText)
}

func TestParseTMXReadsSourcePathProp(t *testing.T) {
	tmx := SerializeTMX([]Row{{
		Key:          "hello",
		SourceText:   "Hello",
		TargetText:   "Bonjour",
		SourceLocale: "en",
		TargetLocale: "fr",
		SourcePath:   "app/en.json",
	}})
	require.Contains(t, string(tmx), `<prop type="x-source-path">app/en.json</prop>`)
	rows, err := ParseTMX(tmx)
	require.NoError(t, err)
	require.Equal(t, "app/en.json", rows[0].SourcePath)
}

func TestParseRejectsTooManyRows(t *testing.T) {
	rows := makeExportRows(MaxRows + 1)
	body := SerializeCSV(rows)
	_, err := Parse(FormatCSV, body)
	require.Error(t, err)
	require.Contains(t, err.Error(), "too many rows")
}

func TestParseUnsupportedFormat(t *testing.T) {
	_, err := Parse(Format("docx"), []byte("x"))
	require.Error(t, err)
}
