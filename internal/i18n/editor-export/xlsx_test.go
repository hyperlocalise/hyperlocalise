package editor_export

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"
)

func TestSerializeXLSXStructure(t *testing.T) {
	body, err := SerializeXLSX([]Row{csvFixtureRow})
	require.NoError(t, err)
	require.NotEmpty(t, body)
	require.Equal(t, byte('P'), body[0])
	require.Equal(t, byte('K'), body[1])

	f, err := excelize.OpenReader(bytes.NewReader(body))
	require.NoError(t, err)
	defer func() { _ = f.Close() }()

	headers, err := f.GetRows(xlsxSheetName)
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(headers), 2)
	require.Equal(t, csvHeader, headers[0])
	require.Equal(t, csvFixtureRow.Key, headers[1][0])
	require.Equal(t, csvFixtureRow.SourceLocale, headers[1][1])
	require.Equal(t, csvFixtureRow.TargetLocale, headers[1][2])
	require.Equal(t, csvFixtureRow.SourceText, headers[1][3])
	require.Equal(t, csvFixtureRow.TargetText, headers[1][4])
	require.Equal(t, csvFixtureRow.SourcePath, headers[1][5])
}

func TestSerializeXLSXMultipleRows(t *testing.T) {
	rows := makeExportRows(10)
	body, err := SerializeXLSX(rows)
	require.NoError(t, err)

	f, err := excelize.OpenReader(bytes.NewReader(body))
	require.NoError(t, err)
	defer func() { _ = f.Close() }()

	sheetRows, err := f.GetRows(xlsxSheetName)
	require.NoError(t, err)
	require.Len(t, sheetRows, 11)
	require.Equal(t, rows[9].Key, sheetRows[10][0])
}

func TestSerializeXLSXResultMetadata(t *testing.T) {
	result, err := Serialize(FormatXLSX, []Row{csvFixtureRow})
	require.NoError(t, err)
	require.Equal(t, "xlsx", result.Extension)
	require.Equal(t, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", result.ContentType)
}
