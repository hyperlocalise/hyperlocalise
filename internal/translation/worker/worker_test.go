package worker

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/protobuf/encoding/protojson"
)

type fakeExecutor struct {
	translate func(ctx context.Context, task TranslationTask) (string, RoutingDecision, error)
}

func (f fakeExecutor) Translate(ctx context.Context, task TranslationTask) (string, RoutingDecision, error) {
	return f.translate(ctx, task)
}

func TestBuildOutcomeStringSuccess(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{
		SourceText:    "Hello",
		TargetLocales: []string{"fr", "de"},
	})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	processor := &Processor{
		executor: fakeExecutor{
			translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
				return strings.ToUpper(task.TargetLocale) + ":" + task.SourceText, RoutingDecision{Provider: "openai", Model: "gpt-4o-mini", Reasons: []string{"test route"}}, nil
			},
		},
		clock: func() time.Time {
			return time.Unix(1700000000, 0).UTC()
		},
	}

	outcomeKind, outcomePayload, completedAt, err := processor.buildOutcome(context.Background(), &store.TranslationJobModel{
		Type:         store.JobTypeString,
		InputPayload: payload,
	})
	if err != nil {
		t.Fatalf("build outcome: %v", err)
	}
	if outcomeKind != "string_result" {
		t.Fatalf("unexpected outcome kind: %q", outcomeKind)
	}
	if completedAt.IsZero() {
		t.Fatal("expected completedAt to be set")
	}

	result := &translationv1.StringTranslationJobResult{}
	if err := protojson.Unmarshal(outcomePayload, result); err != nil {
		t.Fatalf("decode result: %v", err)
	}
	if len(result.GetTranslations()) != 2 {
		t.Fatalf("unexpected translation count: %d", len(result.GetTranslations()))
	}
	if got := result.GetTranslations()[0].GetText(); got != "FR:Hello" {
		t.Fatalf("unexpected first translation: %q", got)
	}
	if got := result.GetTranslations()[1].GetText(); got != "DE:Hello" {
		t.Fatalf("unexpected second translation: %q", got)
	}
}

func TestBuildOutcomeStringFailure(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{
		SourceText:    "Hello",
		TargetLocales: []string{"fr", "de"},
	})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	processor := &Processor{
		executor: fakeExecutor{
			translate: func(_ context.Context, task TranslationTask) (string, RoutingDecision, error) {
				if task.TargetLocale == "de" {
					return "", RoutingDecision{Provider: "gemini", Model: "gemini-2.0-flash"}, errors.New("provider failed")
				}
				return "bonjour", RoutingDecision{Provider: "openai", Model: "gpt-4o-mini"}, nil
			},
		},
		clock: func() time.Time { return time.Unix(1700000000, 0).UTC() },
	}

	_, _, _, err = processor.buildOutcome(context.Background(), &store.TranslationJobModel{
		Type:         store.JobTypeString,
		InputPayload: payload,
	})
	if err == nil || !strings.Contains(err.Error(), `translate locale "de" with route gemini/gemini-2.0-flash`) {
		t.Fatalf("expected locale-specific error, got %v", err)
	}
}

func TestBuildOutcomeStringRequiresExecutor(t *testing.T) {
	payload, err := translationapp.EncodeProto(&translationv1.StringTranslationJobInput{
		SourceText:    "Hello",
		TargetLocales: []string{"fr"},
	})
	if err != nil {
		t.Fatalf("encode input: %v", err)
	}

	processor := &Processor{clock: func() time.Time { return time.Unix(1700000000, 0).UTC() }}
	_, _, _, err = processor.buildOutcome(context.Background(), &store.TranslationJobModel{
		Type:         store.JobTypeString,
		InputPayload: payload,
	})
	if err == nil || !strings.Contains(err.Error(), "executor is not configured") {
		t.Fatalf("expected missing executor error, got %v", err)
	}
}

func TestBuildOutcomeFileDeferred(t *testing.T) {
	processor := &Processor{clock: func() time.Time { return time.Unix(1700000000, 0).UTC() }}
	_, _, _, err := processor.buildOutcome(context.Background(), &store.TranslationJobModel{
		Type: store.JobTypeFile,
	})
	if !errors.Is(err, ErrFileJobsNotImplemented) {
		t.Fatalf("expected file jobs to be deferred, got %v", err)
	}
}

func TestNewTranslatorExecutorRejectsLocalProviders(t *testing.T) {
	_, err := NewTranslatorExecutor(Config{
		Provider: "ollama",
		Model:    "qwen2.5:7b",
	})
	if err == nil || !strings.Contains(err.Error(), `provider "ollama" is not supported`) {
		t.Fatalf("expected unsupported provider error, got %v", err)
	}
}

func TestNewTranslatorExecutorAcceptsRemoteProvider(t *testing.T) {
	executor, err := NewTranslatorExecutor(Config{
		Provider: "openai",
		Model:    "gpt-4o-mini",
	})
	if err != nil {
		t.Fatalf("new translator executor: %v", err)
	}
	if executor == nil {
		t.Fatal("expected executor")
	}
}

func TestIsTerminalStatus(t *testing.T) {
	if !isTerminalStatus(store.JobStatusSucceeded) {
		t.Fatal("expected succeeded to be terminal")
	}
	if !isTerminalStatus(store.JobStatusFailed) {
		t.Fatal("expected failed to be terminal")
	}
	if isTerminalStatus(store.JobStatusRunning) {
		t.Fatal("did not expect running to be terminal")
	}
}

func TestTerminalOutcomeMatches(t *testing.T) {
	job := &store.TranslationJobModel{
		OutcomeKind:    "string_result",
		OutcomePayload: []byte(`{"translations":[{"locale":"fr","text":"bonjour"}]}`),
	}
	if !terminalOutcomeMatches(job, "string_result", []byte(`{"translations":[{"locale":"fr","text":"bonjour"}]}`)) {
		t.Fatal("expected matching terminal outcome")
	}
	if terminalOutcomeMatches(job, "error", []byte(`{}`)) {
		t.Fatal("did not expect mismatched terminal outcome")
	}
}
