package progressui

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestFormatElapsed_Scout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		duration time.Duration
		expected string
	}{
		{
			name:     "zero duration",
			duration: 0,
			expected: "00:00:00",
		},
		{
			name:     "seconds only",
			duration: 45 * time.Second,
			expected: "00:00:45",
		},
		{
			name:     "minutes and seconds",
			duration: 12*time.Minute + 34*time.Second,
			expected: "00:12:34",
		},
		{
			name:     "hours minutes and seconds",
			duration: 2*time.Hour + 15*time.Minute + 9*time.Second,
			expected: "02:15:09",
		},
		{
			name:     "multi-day duration",
			duration: 26*time.Hour + 3*time.Minute + 12*time.Second,
			expected: "26:03:12",
		},
		{
			name:     "sub-second truncation",
			duration: 500*time.Millisecond + 10*time.Second,
			expected: "00:00:10",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := formatElapsed(tt.duration)
			if got != tt.expected {
				t.Errorf("formatElapsed(%v) = %q; want %q", tt.duration, got, tt.expected)
			}
		})
	}
}

func TestClampBarWidth_Scout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		width    int
		expected int
	}{
		{
			name:     "below min width clamped to min",
			width:    5,
			expected: defaultBarMinWidth,
		},
		{
			name:     "exact min width",
			width:    defaultBarMinWidth,
			expected: defaultBarMinWidth,
		},
		{
			name:     "intermediate width unchanged",
			width:    50,
			expected: 50,
		},
		{
			name:     "exact max width",
			width:    defaultBarMaxWidth,
			expected: defaultBarMaxWidth,
		},
		{
			name:     "above max width clamped to max",
			width:    120,
			expected: defaultBarMaxWidth,
		},
		{
			name:     "negative width clamped to min",
			width:    -10,
			expected: defaultBarMinWidth,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := clampBarWidth(tt.width)
			if got != tt.expected {
				t.Errorf("clampBarWidth(%d) = %d; want %d", tt.width, got, tt.expected)
			}
		})
	}
}

func TestFileStateAndSorting_Scout(t *testing.T) {
	t.Parallel()

	t.Run("fileState priority classification", func(t *testing.T) {
		t.Parallel()

		stateProc, prioProc := fileState(fileStatus{processing: 1, failed: 0, succeeded: 0})
		if stateProc != "processing" || prioProc != 0 {
			t.Errorf("expected processing/0, got state=%q prio=%d", stateProc, prioProc)
		}

		stateFailed, prioFailed := fileState(fileStatus{processing: 0, failed: 2, succeeded: 5})
		if stateFailed != "failed" || prioFailed != 1 {
			t.Errorf("expected failed/1, got state=%q prio=%d", stateFailed, prioFailed)
		}

		stateDone, prioDone := fileState(fileStatus{processing: 0, failed: 0, succeeded: 3})
		if stateDone != "done" || prioDone != 2 {
			t.Errorf("expected done/2, got state=%q prio=%d", stateDone, prioDone)
		}
	})

	t.Run("sortedFilePaths ordering", func(t *testing.T) {
		t.Parallel()

		m := newModel("Test", ModeOn, defaultSpinnerTick, Options{})
		// Touch files in order: done1, failed1, proc1, done2, proc2
		m.recordTaskStarted("done1.json", "k1")
		m.recordTaskFinished("done1.json", "k1", true, "")

		m.recordTaskStarted("failed1.json", "k2")
		m.recordTaskFinished("failed1.json", "k2", false, "err")

		m.recordTaskStarted("proc1.json", "k3")

		m.recordTaskStarted("done2.json", "k4")
		m.recordTaskFinished("done2.json", "k4", true, "")

		m.recordTaskStarted("proc2.json", "k5")

		sorted := m.sortedFilePaths()
		// Priority order: processing (0), failed (1), done (2)
		// Within same priority, order of recency (fileOrder) is preserved.
		if len(sorted) != 5 {
			t.Fatalf("expected 5 files, got %d", len(sorted))
		}

		// proc2 was touched after proc1, so proc2 should be before proc1 in fileOrder
		if sorted[0] != "proc2.json" || sorted[1] != "proc1.json" {
			t.Errorf("expected processing files first [proc2.json, proc1.json], got [%s, %s]", sorted[0], sorted[1])
		}

		if sorted[2] != "failed1.json" {
			t.Errorf("expected failed file second [failed1.json], got %s", sorted[2])
		}

		// done2 touched after done1
		if sorted[3] != "done2.json" || sorted[4] != "done1.json" {
			t.Errorf("expected done files last [done2.json, done1.json], got [%s, %s]", sorted[3], sorted[4])
		}
	})
}

func TestFileStatusViewTruncationAndProcessingGuard_Scout(t *testing.T) {
	t.Parallel()

	t.Run("truncation beyond maxVisible limit", func(t *testing.T) {
		t.Parallel()

		m := newModel("Test", ModeOn, defaultSpinnerTick, Options{})
		m.maxVisible = 3

		for i := 1; i <= 5; i++ {
			path := fmt.Sprintf("file_%d.json", i)
			m.recordTaskStarted(path, "key")
			m.recordTaskFinished(path, "key", true, "")
		}

		view := m.fileStatusView()
		if !strings.Contains(view, "Files") {
			t.Fatalf("expected Files header in view, got %q", view)
		}

		if !strings.Contains(view, "... 2 more files") {
			t.Errorf("expected truncation indicator '... 2 more files', got %q", view)
		}
	})

	t.Run("recordTaskFinished without recordTaskStarted prevents underflow", func(t *testing.T) {
		t.Parallel()

		m := newModel("Test", ModeOn, defaultSpinnerTick, Options{})
		// Finish task directly without calling TaskStarted first
		m.recordTaskFinished("unstarted.json", "key1", true, "")

		status := m.files["unstarted.json"]
		if status.processing != 0 {
			t.Errorf("expected processing count to remain 0, got %d", status.processing)
		}
		if status.succeeded != 1 {
			t.Errorf("expected succeeded count 1, got %d", status.succeeded)
		}
	})
}
