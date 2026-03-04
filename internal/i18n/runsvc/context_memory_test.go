package runsvc

import (
	"context"
	"testing"
	"time"
	"unicode/utf8"
)

func TestNormalizeContextMemoryPreservesUTF8WhenTruncating(t *testing.T) {
	in := "  Xin chào 👋 thế giới  "
	out := normalizeContextMemory(in, 9)

	if !utf8.ValidString(out) {
		t.Fatalf("expected valid UTF-8 output, got %q", out)
	}
	if got := len([]rune(out)); got > 9 {
		t.Fatalf("expected at most 9 runes, got %d (%q)", got, out)
	}
}

func TestResolveTaskContextMemoryReturnsOnCanceledContextWhenSlotInProgress(t *testing.T) {
	svc := newTestService()
	key := "file|scope_value=/tmp/source.json"
	state := &executorState{
		contextPlan: contextMemoryPlan{
			Enabled: true,
			Groups: map[string]contextMemoryGroup{
				key: {Key: key},
			},
		},
		contextSlots: map[string]*contextMemorySlot{
			key: {done: make(chan struct{})},
		},
	}
	task := Task{ContextKey: key}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	started := time.Now()
	memory := svc.resolveTaskContextMemory(ctx, task, state, nil)
	if memory != "" {
		t.Fatalf("expected empty memory when context is canceled, got %q", memory)
	}
	if elapsed := time.Since(started); elapsed > 100*time.Millisecond {
		t.Fatalf("expected immediate return for canceled context, took %s", elapsed)
	}
}
