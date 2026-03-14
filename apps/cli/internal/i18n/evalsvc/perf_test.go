package evalsvc

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/apps/cli/internal/i18n/evalset"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/translator"
)

func BenchmarkRunLargeBatch(b *testing.B) {
	svc := benchmarkEvalService(64)
	input := Input{
		EvalSetPath: "unused.json",
		Profiles:    []string{"default"},
		Providers:   []string{"openai"},
		Models:      []string{"model-a", "model-b"},
		Prompts:     []string{"prompt A", "prompt B"},
		Concurrency: 8,
	}

	b.ReportAllocs()
	for b.Loop() {
		report, err := svc.Run(context.Background(), input)
		if err != nil {
			b.Fatalf("run: %v", err)
		}
		if report.Aggregate.TotalRuns != 256 {
			b.Fatalf("unexpected run count: %d", report.Aggregate.TotalRuns)
		}
	}
}

func benchmarkEvalService(caseCount int) *Service {
	svc := newTestService()
	svc.loadEvalset = func(_ string) (*evalset.Dataset, error) {
		cases := make([]evalset.Case, caseCount)
		for i := range cases {
			source := fmt.Sprintf("source-%02d", i)
			cases[i] = evalset.Case{
				ID:           fmt.Sprintf("case-%02d", i),
				Source:       source,
				TargetLocale: "fr-FR",
				Reference:    strings.ToUpper(source),
			}
		}
		return &evalset.Dataset{Cases: cases}, nil
	}
	svc.translate = func(_ context.Context, req translator.Request) (string, error) {
		return strings.ToUpper(req.Source), nil
	}
	return svc.Service
}
