package main

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

type recordingExporter struct {
	mu    sync.Mutex
	names []string
}

func (e *recordingExporter) ExportSpans(_ context.Context, spans []sdktrace.ReadOnlySpan) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	for _, s := range spans {
		e.names = append(e.names, s.Name())
	}
	return nil
}

func (e *recordingExporter) Shutdown(context.Context) error { return nil }

func (e *recordingExporter) spanNames() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]string, len(e.names))
	copy(out, e.names)
	return out
}

type slowExporter struct {
	delay time.Duration
}

func (e *slowExporter) ExportSpans(context.Context, []sdktrace.ReadOnlySpan) error {
	return nil
}

func (e *slowExporter) Shutdown(ctx context.Context) error {
	select {
	case <-time.After(e.delay):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestTracerProviderShutdownFlushesRecordedSpans(t *testing.T) {
	exporter := &recordingExporter{}
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exporter,
		sdktrace.WithBatchTimeout(1*time.Hour)))

	_, span := tp.Tracer(otelInstrumentation).Start(context.Background(), "test-span")
	span.End()
	require.Empty(t, exporter.spanNames(), "sanity check: batching means the span isn't exported yet")

	require.NoError(t, tp.Shutdown(context.Background()))
	require.Equal(t, []string{"test-span"}, exporter.spanNames(),
		"shutdown must export spans still sitting in the batcher")
}

func TestTracerProviderShutdownRespectsContextDeadline(t *testing.T) {
	tp := sdktrace.NewTracerProvider(sdktrace.WithBatcher(&slowExporter{delay: 5 * time.Second}))

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	started := time.Now()
	err := tp.Shutdown(ctx)
	elapsed := time.Since(started)

	require.Error(t, err, "shutdown should surface the exporter's context-deadline error, not hang")
	require.Less(t, elapsed, 1*time.Second, "shutdown must not block past the caller's shutdown budget")
}
