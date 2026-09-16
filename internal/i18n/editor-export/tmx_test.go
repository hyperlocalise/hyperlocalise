package editor_export

import (
	"bytes"
	"encoding/xml"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSerializeTMXStructureAndEscaping(t *testing.T) {
	tmx := string(SerializeTMX([]Row{csvFixtureRow}))
	require.Contains(t, tmx, `<?xml version="1.0" encoding="UTF-8"?>`)
	require.Contains(t, tmx, `<tmx version="1.4">`)
	require.Contains(t, tmx, `srclang="en"`)
	require.Contains(t, tmx, `tuid="greet,&quot;user&quot;"`)
	require.Contains(t, tmx, "<seg>Hello\nworld</seg>")
	require.Contains(t, tmx, "<seg>Xin chào</seg>")
	requireValidXML(t, []byte(tmx))
}

func TestSerializeTMXEmptyRowsDefaultsSourceLocale(t *testing.T) {
	tmx := string(SerializeTMX(nil))
	require.Contains(t, tmx, `srclang="en"`)
	require.Contains(t, tmx, "<body>\n  </body>")
}

func TestSerializeTMXMultipleTranslationUnits(t *testing.T) {
	rows := makeExportRows(3)
	tmx := string(SerializeTMX(rows))
	require.Equal(t, 3, strings.Count(tmx, "<tu "))
	require.Contains(t, tmx, `tuid="segment.key.2"`)
}

func TestSerializeTMXXMLEscapesMarkup(t *testing.T) {
	row := Row{
		Key:          "x",
		SourceText:   "Use <b>bold</b> & \"quotes\"",
		TargetText:   "target",
		SourceLocale: "en",
		TargetLocale: "de",
	}
	tmx := string(SerializeTMX([]Row{row}))
	require.Contains(t, tmx, "&lt;b&gt;")
	require.Contains(t, tmx, "&amp;")
	requireValidXML(t, []byte(tmx))
}

func TestSerializeTMXResultMetadata(t *testing.T) {
	result, err := Serialize(FormatTMX, []Row{csvFixtureRow})
	require.NoError(t, err)
	require.Equal(t, "tmx", result.Extension)
	require.Equal(t, "application/x-tmx+xml; charset=utf-8", result.ContentType)
}

func requireValidXML(t *testing.T, data []byte) {
	t.Helper()
	dec := xml.NewDecoder(bytes.NewReader(data))
	for {
		_, err := dec.Token()
		if err == io.EOF {
			return
		}
		require.NoError(t, err)
	}
}
