package runsvc

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/xuri/excelize/v2"
)

func TestFlushOutputForTargetXLSXKeepsOtherLocaleColumns(t *testing.T) {
	workbook := excelize.NewFile()
	rows := [][]any{
		{"Key", "English", "French", "Spanish"},
		{"greeting", "Hello", "", "Hola"},
		{"farewell", "Goodbye", "Au revoir", ""},
	}
	for index, row := range rows {
		cell, err := excelize.CoordinatesToCellName(1, index+1)
		if err != nil {
			t.Fatalf("cell name: %v", err)
		}
		if err := workbook.SetSheetRow("Sheet1", cell, &row); err != nil {
			t.Fatalf("set row: %v", err)
		}
	}
	var buffer bytes.Buffer
	if err := workbook.Write(&buffer); err != nil {
		t.Fatalf("write workbook: %v", err)
	}

	path := filepath.Join(t.TempDir(), "strings.xlsx")
	if err := os.WriteFile(path, buffer.Bytes(), 0o644); err != nil {
		t.Fatalf("write workbook file: %v", err)
	}

	svc := newTestService()
	svc.readFile = os.ReadFile
	var written []byte
	svc.writeFile = func(_ string, content []byte) error {
		written = append([]byte(nil), content...)
		return nil
	}

	_, err := svc.flushOutputForTarget(path, stagedOutput{
		entries:      map[string]string{"greeting": "Bonjour"},
		sourcePath:   path,
		sourceLocale: "en",
		targetLocale: "fr",
	}, nil)
	if err != nil {
		t.Fatalf("flush output target: %v", err)
	}

	french, err := translationfileparser.ParseXLSXLocale(written, "en", "fr")
	if err != nil {
		t.Fatalf("parse french: %v", err)
	}
	if french["greeting"] != "Bonjour" || french["farewell"] != "Au revoir" {
		t.Fatalf("unexpected french values: %#v", french)
	}
	spanish, err := translationfileparser.ParseXLSXLocale(written, "en", "es")
	if err != nil {
		t.Fatalf("parse spanish: %v", err)
	}
	if spanish["greeting"] != "Hola" {
		t.Fatalf("unexpected spanish values: %#v", spanish)
	}
}
