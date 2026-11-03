package cmd

import (
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/progressui"
)

func TestContextMemoryPhaseMessageIncludesProgressAndFallback(t *testing.T) {
	got := contextMemoryPhaseMessage(runsvc.Event{
		ContextMemoryTotal:     5,
		ContextMemoryProcessed: 2,
		ContextMemoryFallbacks: 1,
		Message:                "context memory fallback for scope",
	})
	want := "Building context memory... (2/5, fallback=1) context memory fallback for scope"
	if got != want {
		t.Fatalf("context memory phase message = %q, want %q", got, want)
	}
}

func TestContextMemoryPhaseMessageWithoutTotals(t *testing.T) {
	got := contextMemoryPhaseMessage(runsvc.Event{Message: "starting context memory generation"})
	want := "Building context memory... starting context memory generation"
	if got != want {
		t.Fatalf("context memory phase message = %q, want %q", got, want)
	}
}

func TestContextMemoryDisplayPhaseKeepsMemoryPhaseUntilCompletion(t *testing.T) {
	event := runsvc.Event{
		ContextMemoryTotal:     3,
		ContextMemoryProcessed: 2,
		ContextMemoryFallbacks: 1,
		Message:                "context memory progress for app.json",
	}
	got := contextMemoryDisplayPhase(event)
	want := "Building context memory... (2/3, fallback=1) context memory progress for app.json"
	if got != want {
		t.Fatalf("context memory display phase = %q, want %q", got, want)
	}
}

func TestContextMemoryPhaseMessageTotalsWithoutMessage(t *testing.T) {
	got := contextMemoryPhaseMessage(runsvc.Event{ContextMemoryTotal: 4, ContextMemoryProcessed: 1})
	if got != "Building context memory... (1/4, fallback=0)" {
		t.Fatalf("context memory phase message = %q", got)
	}
	if got := contextMemoryPhaseMessage(runsvc.Event{Message: "  "}); got != "Building context memory..." {
		t.Fatalf("context memory phase message without totals = %q", got)
	}
}

func TestRunPhaseMessageCoversEveryPhase(t *testing.T) {
	for phase, want := range map[string]string{
		runsvc.PhasePlanning:         "Planning tasks...",
		runsvc.PhaseScanningPrune:    "Scanning prune candidates...",
		runsvc.PhaseContextMemory:    "Building context memory...",
		runsvc.PhaseExecuting:        "Translating entries...",
		runsvc.PhaseFinalizingOutput: "Finalizing output...",
		"something-new":              "Working...",
	} {
		if got := runPhaseMessage(phase); got != want {
			t.Fatalf("runPhaseMessage(%q) = %q, want %q", phase, got, want)
		}
	}
}

func TestApplyRunProgressEventDrivesPlainRenderer(t *testing.T) {
	var out bytes.Buffer
	renderer := progressui.New(&out, progressui.ModeOn, progressui.Options{IsTTYFn: func(io.Writer) bool { return false }})

	events := []runsvc.Event{
		{Kind: runsvc.EventPhase, Phase: runsvc.PhasePlanning},
		{Kind: runsvc.EventPlanned, ExecutableTotal: 2},
		{Kind: runsvc.EventContextMemory, ContextMemoryState: runsvc.ContextMemoryStateStart, ContextMemoryTotal: 1, TargetPath: "/tmp/fr/app.json", EntryKey: "memory"},
		{Kind: runsvc.EventContextMemory, ContextMemoryState: runsvc.ContextMemoryStateDone, ContextMemoryTotal: 1, ContextMemoryProcessed: 1, TargetPath: "/tmp/fr/app.json", EntryKey: "memory", TaskSucceeded: true},
		{Kind: runsvc.EventTaskStart, TargetPath: "/tmp/fr/app.json", EntryKey: "hello"},
		{Kind: runsvc.EventTaskDone, TargetPath: "/tmp/fr/app.json", EntryKey: "hello", TaskSucceeded: true, Succeeded: 1, ExecutableTotal: 2, PromptTokens: 3, CompletionTokens: 2, TotalTokens: 5},
		{Kind: runsvc.EventTaskStart, TargetPath: "/tmp/fr/app.json", EntryKey: "bye"},
		{Kind: runsvc.EventTaskDone, TargetPath: "/tmp/fr/app.json", EntryKey: "bye", FailureReason: "rate limit", Succeeded: 1, Failed: 1, ExecutableTotal: 2},
		{Kind: runsvc.EventCompleted, Succeeded: 1, Failed: 1, ExecutableTotal: 2, PromptTokens: 3, CompletionTokens: 2, TotalTokens: 5},
	}
	for _, event := range events {
		applyRunProgressEvent(renderer, event)
	}
	renderer.Close()

	got := out.String()
	for _, want := range []string{
		"progress phase=Planning tasks...",
		"progress executable_total=2",
		"progress completed=2/2 succeeded=1 failed=1",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("plain progress output missing %q:\n%s", want, got)
		}
	}
}

func TestContextMemoryDisplayPhaseSwitchesToTranslatingWhenComplete(t *testing.T) {
	event := runsvc.Event{
		ContextMemoryTotal:     3,
		ContextMemoryProcessed: 3,
		ContextMemoryFallbacks: 1,
		Message:                "context memory generated for app.json",
	}
	got := contextMemoryDisplayPhase(event)
	want := "Translating entries..."
	if got != want {
		t.Fatalf("context memory display phase = %q, want %q", got, want)
	}
}
