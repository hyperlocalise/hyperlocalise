package runsvc

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
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

func TestFlushOutputsSharedWorkbookLocales(t *testing.T) {
	workbook := excelize.NewFile()
	rows := [][]any{
		{"Key", "English", "French", "Spanish"},
		{"greeting", "Hello", "", ""},
		{"farewell", "Goodbye", "", ""},
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
	files := map[string][]byte{path: buffer.Bytes()}
	svc := newTestService()
	svc.readFile = func(name string) ([]byte, error) {
		content, ok := files[name]
		if !ok {
			return nil, os.ErrNotExist
		}
		return append([]byte(nil), content...), nil
	}
	svc.writeFile = func(name string, content []byte) error {
		files[name] = append([]byte(nil), content...)
		return nil
	}

	staged := map[string]stagedOutput{
		stagedOutputKey(path, "fr"): {
			entries:      map[string]string{"greeting": "Bonjour"},
			sourcePath:   path,
			sourceLocale: "en",
			targetLocale: "fr",
		},
		stagedOutputKey(path, "es-419"): {
			entries:      map[string]string{"greeting": "Hola"},
			sourcePath:   path,
			sourceLocale: "en",
			targetLocale: "es-419",
		},
	}
	if _, err := svc.flushOutputs(context.Background(), nil, staged, nil, nil); err != nil {
		t.Fatalf("flush outputs: %v", err)
	}

	french, err := translationfileparser.ParseXLSXLocale(files[path], "en", "fr")
	if err != nil {
		t.Fatalf("parse french: %v", err)
	}
	if french["greeting"] != "Bonjour" {
		t.Fatalf("unexpected french values: %#v", french)
	}
	spanish, err := translationfileparser.ParseXLSXLocale(files[path], "en", "es-419")
	if err != nil {
		t.Fatalf("parse spanish: %v", err)
	}
	if spanish["greeting"] != "Hola" {
		t.Fatalf("unexpected spanish values: %#v", spanish)
	}
}

func TestExecutePoolSharedWorkbookLocales(t *testing.T) {
	workbook := excelize.NewFile()
	rows := [][]any{
		{"Key", "English"},
		{"greeting", "Hello"},
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
	var filesMu sync.Mutex
	files := map[string][]byte{path: buffer.Bytes()}
	svc := newTestService()
	svc.readFile = func(name string) ([]byte, error) {
		filesMu.Lock()
		defer filesMu.Unlock()
		content, ok := files[name]
		if !ok {
			return nil, os.ErrNotExist
		}
		return append([]byte(nil), content...), nil
	}
	svc.writeFile = func(name string, content []byte) error {
		filesMu.Lock()
		defer filesMu.Unlock()
		files[name] = append([]byte(nil), content...)
		return nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		switch req.TargetLanguage {
		case "fr":
			return "Bonjour", nil
		case "es-419":
			return "Hola", nil
		default:
			return req.Source, nil
		}
	}

	tasks := []Task{
		{EntryKey: "greeting", TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "fr", TranslationType: config.TranslationTypeLLM, ProfileName: "default", SourceText: "Hello"},
		{EntryKey: "greeting", TargetPath: path, SourcePath: path, SourceLocale: "en", TargetLocale: "es-419", TranslationType: config.TranslationTypeLLM, ProfileName: "default", SourceText: "Hello"},
	}
	emitter := newEventEmitter(func(Event) {})
	defer emitter.close()
	_, flushed, report, err := svc.executePool(context.Background(), tasks, nil, map[string]stagedOutput{}, filepath.Join(t.TempDir(), "lock.json"), newTestExecutePoolLockState(), 2, "run1", nil, contextMemoryPlan{}, nil, emitter, false, nil, false)
	if err != nil {
		t.Fatalf("executePool: %v", err)
	}
	if report.Failed != 0 || report.Succeeded != 2 {
		t.Fatalf("report succeeded=%d failed=%d, want 2/0", report.Succeeded, report.Failed)
	}
	if _, ok := flushed[path]; !ok {
		t.Fatalf("expected %q to be flushed", path)
	}

	french, err := translationfileparser.ParseXLSXLocale(files[path], "en", "fr")
	if err != nil {
		t.Fatalf("parse french: %v", err)
	}
	if french["greeting"] != "Bonjour" {
		t.Fatalf("unexpected french values: %#v", french)
	}
	spanish, err := translationfileparser.ParseXLSXLocale(files[path], "en", "es-419")
	if err != nil {
		t.Fatalf("parse spanish: %v", err)
	}
	if spanish["greeting"] != "Hola" {
		t.Fatalf("unexpected spanish values: %#v", spanish)
	}
}
