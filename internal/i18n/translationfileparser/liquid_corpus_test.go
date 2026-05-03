package translationfileparser

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

type liquidGoldenOutput struct {
	Diagnostics []Diagnostic      `json:"diagnostics"`
	Error       string            `json:"error"`
	Values      map[string]string `json:"values"`
}

func TestMain(m *testing.M) {
	flag.Bool("update", false, "update golden files")
	os.Exit(m.Run())
}

func TestLiquidParserCanonicalCorpusMatchesGoldens(t *testing.T) {
	t.Helper()

	fixturePaths, err := filepath.Glob(filepath.Join("testdata", "liquid", "fixtures", "*.liquid"))
	if err != nil {
		t.Fatalf("glob liquid fixtures: %v", err)
	}
	if len(fixturePaths) == 0 {
		t.Fatal("expected liquid fixtures")
	}
	slices.Sort(fixturePaths)

	for _, fixturePath := range fixturePaths {
		fixturePath := fixturePath
		name := filepath.Base(fixturePath)
		t.Run(name, func(t *testing.T) {
			t.Helper()

			content, err := os.ReadFile(fixturePath)
			if err != nil {
				t.Fatalf("read fixture: %v", err)
			}

			got := parseLiquidGoldenOutput(content)
			goldenPath := filepath.Join("testdata", "liquid", "golden", name[:len(name)-len(filepath.Ext(name))]+".json")

			if liquidUpdateGoldens(t) {
				writeLiquidGoldenOutput(t, goldenPath, got)
				return
			}

			want := readLiquidGoldenOutput(t, goldenPath)
			if !liquidGoldenOutputsEqual(got, want) {
				gotBytes := marshalLiquidGoldenOutput(t, got)
				wantBytes := marshalLiquidGoldenOutput(t, want)
				t.Fatalf("golden mismatch for %s\nwant:\n%s\ngot:\n%s", fixturePath, wantBytes, gotBytes)
			}
		})
	}
}

func TestLiquidParserCanonicalBenchmarkCorpusShape(t *testing.T) {
	t.Helper()

	corpus := makeLiquidBenchmarkCorpus(50, 10)
	if len(corpus) != 50 {
		t.Fatalf("expected 50 benchmark files, got %d", len(corpus))
	}

	totalBytes := 0
	totalKeys := 0
	parser := LiquidParser{}
	for _, content := range corpus {
		totalBytes += len(content)
		values, err := parser.Parse(content)
		if err != nil {
			t.Fatalf("parse benchmark corpus: %v", err)
		}
		totalKeys += len(values)
	}
	if totalKeys != 500 {
		t.Fatalf("expected 500 benchmark keys, got %d", totalKeys)
	}
	if totalBytes >= 1_000_000 {
		t.Fatalf("expected benchmark corpus under 1MB, got %d bytes", totalBytes)
	}
}

func parseLiquidGoldenOutput(content []byte) liquidGoldenOutput {
	var diagnostics []Diagnostic
	values, _, err := (LiquidParser{}).ParseWithDiagnostics(content, &diagnostics)
	if values == nil {
		values = map[string]string{}
	}
	if diagnostics == nil {
		diagnostics = []Diagnostic{}
	}
	slices.SortFunc(diagnostics, func(a, b Diagnostic) int {
		if a.LineNumber != b.LineNumber {
			return a.LineNumber - b.LineNumber
		}
		if a.Code < b.Code {
			return -1
		}
		if a.Code > b.Code {
			return 1
		}
		return 0
	})

	return liquidGoldenOutput{
		Diagnostics: diagnostics,
		Error:       liquidGoldenErrorName(err),
		Values:      values,
	}
}

func liquidGoldenErrorName(err error) string {
	if err == nil {
		return ""
	}
	var parseErr *LiquidParseError
	if errors.As(err, &parseErr) {
		return "LiquidParseError"
	}
	return "error"
}

func readLiquidGoldenOutput(t *testing.T, path string) liquidGoldenOutput {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}

	var out liquidGoldenOutput
	if err := json.Unmarshal(content, &out); err != nil {
		t.Fatalf("unmarshal golden: %v", err)
	}
	if out.Values == nil {
		out.Values = map[string]string{}
	}
	return out
}

func writeLiquidGoldenOutput(t *testing.T, path string, out liquidGoldenOutput) {
	t.Helper()

	if err := os.WriteFile(path, marshalLiquidGoldenOutput(t, out), 0o644); err != nil {
		t.Fatalf("write golden: %v", err)
	}
}

func marshalLiquidGoldenOutput(t *testing.T, out liquidGoldenOutput) []byte {
	t.Helper()

	content, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatalf("marshal golden: %v", err)
	}
	return append(content, '\n')
}

func liquidGoldenOutputsEqual(a, b liquidGoldenOutput) bool {
	aBytes, err := json.Marshal(a)
	if err != nil {
		return false
	}
	bBytes, err := json.Marshal(b)
	if err != nil {
		return false
	}
	return bytes.Equal(aBytes, bBytes)
}

func liquidUpdateGoldens(t *testing.T) bool {
	t.Helper()

	update := flag.Lookup("update")
	return update != nil && update.Value.String() == "true"
}
