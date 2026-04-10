package runsvc

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestNormalizeReportJSONDetail(t *testing.T) {
	got, err := NormalizeReportJSONDetail("")
	if err != nil || got != ReportJSONDetailFull {
		t.Fatalf("empty: got %q err %v", got, err)
	}
	got, err = NormalizeReportJSONDetail("  SUMMARY ")
	if err != nil || got != ReportJSONDetailSummary {
		t.Fatalf("summary: got %q err %v", got, err)
	}
	_, err = NormalizeReportJSONDetail("nope")
	if err == nil {
		t.Fatal("expected error for invalid detail")
	}
}

func TestSummaryJSONReportFromIsAggregateOnly(t *testing.T) {
	r := Report{
		PlannedTotal:    1,
		ExecutableTotal: 1,
		Executable: []Task{
			{
				SourceLocale: "en",
				TargetLocale: "fr",
				SourcePath:   "/src.json",
				TargetPath:   "/out.json",
				EntryKey:     "k",
				SourceText:   "long source text",
				ProfileName:  "default",
				SystemPrompt: "system",
				UserPrompt:   "user",
			},
		},
		Batches: []BatchUsage{
			{TargetLocale: "fr", TargetPath: "/out.json", EntryKey: "k"},
		},
		PruneCandidates: []PruneCandidate{
			{TargetPath: "/p.json", EntryKey: "stale"},
		},
	}
	s := SummaryJSONReportFrom(r)
	if s.PruneCandidateCount != 1 {
		t.Fatalf("pruneCandidateCount: got %d", s.PruneCandidateCount)
	}
	raw, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	js := string(raw)
	if strings.Contains(js, "long source text") || strings.Contains(js, "systemPrompt") || strings.Contains(js, "userPrompt") || strings.Contains(js, "batches") {
		t.Fatalf("summary json must not leak heavy payloads: %s", js)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"executable", "skipped", "pruneCandidates", "batches"} {
		if _, ok := m[k]; ok {
			t.Fatalf("summary json must not include key %q", k)
		}
	}
}

func TestRunSummaryReportDetailSkipsBatchesAndPromptMaterialize(t *testing.T) {
	svc := newTestService()
	sourcePath := "/tmp/source.json"
	targetPath := "/tmp/out.json"
	svc.loadConfig = func(_ string) (*config.I18NConfig, error) {
		cfg := testConfig(sourcePath, targetPath)
		return &cfg, nil
	}
	svc.readFile = func(path string) ([]byte, error) {
		switch path {
		case sourcePath:
			return []byte(`{"hello":"Hello"}`), nil
		case targetPath:
			return []byte(`{}`), nil
		default:
			return nil, filepath.ErrBadPattern
		}
	}
	svc.numCPU = func() int { return 1 }
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		return "Bonjour", nil
	}
	report, err := svc.Run(context.Background(), Input{
		Force:            true,
		Workers:          1,
		ReportJSONDetail: ReportJSONDetailSummary,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(report.Batches) != 0 {
		t.Fatalf("expected no per-entry batches in summary mode, got %d", len(report.Batches))
	}
	if len(report.Executable) != 1 {
		t.Fatalf("expected 1 executable, got %d", len(report.Executable))
	}
	if report.Executable[0].SystemPrompt != "" {
		t.Fatalf("summary mode should not materialize report prompts, got system=%q", report.Executable[0].SystemPrompt)
	}
}
