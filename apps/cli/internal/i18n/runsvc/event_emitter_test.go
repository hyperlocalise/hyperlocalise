package runsvc

import (
	"sync"
	"testing"
	"time"
)

func TestEventEmitterPreservesOrderForNonDroppableEvents(t *testing.T) {
	got := make([]Event, 0, 4)
	var mu sync.Mutex
	emitter := newEventEmitter(func(ev Event) {
		mu.Lock()
		defer mu.Unlock()
		got = append(got, ev)
	})
	t.Cleanup(emitter.close)

	want := []Event{
		{Kind: EventPhase, Phase: PhasePlanning},
		{Kind: EventPlanned, PlannedTotal: 3},
		{Kind: EventPhase, Phase: PhaseExecuting},
		{Kind: EventCompleted, Succeeded: 3},
	}
	for _, ev := range want {
		emitter.emit(ev)
	}
	emitter.close()

	mu.Lock()
	defer mu.Unlock()
	if len(got) != len(want) {
		t.Fatalf("expected %d events, got %d", len(want), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("event %d mismatch: got %+v want %+v", i, got[i], want[i])
		}
	}
}

func TestEventEmitterDropsHighFrequencyEventsWhenBufferIsFull(t *testing.T) {
	started := make(chan struct{})
	emitter := newEventEmitter(func(ev Event) {
		<-started
	})
	t.Cleanup(emitter.close)

	before := time.Now()
	for range eventEmitterBufferSize * 8 {
		emitter.emit(Event{Kind: EventTaskDone, TaskSucceeded: true})
	}
	elapsed := time.Since(before)

	if elapsed > 100*time.Millisecond {
		t.Fatalf("expected droppable events to stay non-blocking, emit loop took %s", elapsed)
	}
	close(started)
}

func TestEventEmitterCloseDrainsQueuedEvents(t *testing.T) {
	const total = 128

	var (
		mu    sync.Mutex
		count int
	)
	emitter := newEventEmitter(func(ev Event) {
		time.Sleep(200 * time.Microsecond)
		mu.Lock()
		count++
		mu.Unlock()
	})

	for i := 0; i < total; i++ {
		emitter.emit(Event{Kind: EventPhase, Phase: PhaseExecuting})
	}
	emitter.close()

	mu.Lock()
	defer mu.Unlock()
	if count != total {
		t.Fatalf("expected close to drain %d events, got %d", total, count)
	}
}
