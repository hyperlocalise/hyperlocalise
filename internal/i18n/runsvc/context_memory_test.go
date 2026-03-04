package runsvc

import (
	"context"
	"strings"
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

func TestBuildContextMemoryPlanGroupsByScopeRegardlessOfTargetLocale(t *testing.T) {
	tasks := []Task{
		{SourceLocale: "en", TargetLocale: "zh-CN", SourcePath: "/tmp/source.json", BucketName: "docs", GroupName: "default", EntryKey: "hello", SourceText: "Hello"},
		{SourceLocale: "en", TargetLocale: "zh-CN", SourcePath: "/tmp/source.json", BucketName: "docs", GroupName: "default", EntryKey: "bye", SourceText: "Bye"},
		{SourceLocale: "en", TargetLocale: "vi-VN", SourcePath: "/tmp/source.json", BucketName: "docs", GroupName: "default", EntryKey: "hello", SourceText: "Hello"},
		{SourceLocale: "en", TargetLocale: "vi-VN", SourcePath: "/tmp/source.json", BucketName: "docs", GroupName: "default", EntryKey: "bye", SourceText: "Bye"},
	}

	plan := buildContextMemoryPlan(tasks, ContextMemoryScopeFile, 1200)
	if !plan.Enabled {
		t.Fatalf("expected enabled context memory plan")
	}
	if plan.Total != 1 {
		t.Fatalf("expected 1 context group shared by locales, got %d", plan.Total)
	}

	for key, group := range plan.Groups {
		if strings.Contains(key, "target_locale=") {
			t.Fatalf("expected locale-agnostic context key, got %q", key)
		}
		if !strings.Contains(key, "scope_value=/tmp/source.json") {
			t.Fatalf("expected scope value in key, got %q", key)
		}
		if group.SingleTargetLocale != "" {
			t.Fatalf("expected no single target locale for mixed-locale group, got %q", group.SingleTargetLocale)
		}
	}
}
