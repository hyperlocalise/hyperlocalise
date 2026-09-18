package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

func testSpanContext(t *testing.T, traceIDHex, spanIDHex string, remote bool) trace.SpanContext {
	t.Helper()
	traceID, err := trace.TraceIDFromHex(traceIDHex)
	require.NoError(t, err)
	spanID, err := trace.SpanIDFromHex(spanIDHex)
	require.NoError(t, err)
	return trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceFlags: trace.FlagsSampled,
		Remote:     remote,
	})
}

func newTestDatadogHandler(w io.Writer, resourceAttrs ...slog.Attr) slog.Handler {
	return &datadogLogHandler{next: slog.NewJSONHandler(w, nil), resourceAttrs: resourceAttrs}
}

type lockedWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

func decodeLogLine(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	return entry
}

func decodeLogLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var entries []map[string]any
	dec := json.NewDecoder(bytes.NewReader(buf.Bytes()))
	for {
		var entry map[string]any
		err := dec.Decode(&entry)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		entries = append(entries, entry)
	}
	return entries
}

func TestDatadogLogHandlerNoActiveSpanOmitsTraceFields(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(newTestDatadogHandler(&buf, slog.String("dd.service", "go-svc")))

	logger.InfoContext(context.Background(), "startup")

	entry := decodeLogLine(t, &buf)
	require.Equal(t, "go-svc", entry["dd.service"])
	require.NotContains(t, entry, "dd.trace_id")
	require.NotContains(t, entry, "dd.span_id")
}

func TestDatadogLogHandlerActiveSpanAddsTraceFieldsAsStrings(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(newTestDatadogHandler(&buf, slog.String("dd.service", "go-svc")))

	const traceIDHex = "4bf92f3577b34da6a3ce929d0e0e4736"
	const spanIDHex = "00f067aa0ba902b7"
	sc := testSpanContext(t, traceIDHex, spanIDHex, false)
	ctx := trace.ContextWithSpanContext(context.Background(), sc)

	logger.InfoContext(ctx, "request")

	entry := decodeLogLine(t, &buf)
	traceID, ok := entry["dd.trace_id"].(string)
	require.True(t, ok, "dd.trace_id must be a JSON string, got %T", entry["dd.trace_id"])
	require.Equal(t, traceIDHex, traceID)

	spanID, ok := entry["dd.span_id"].(string)
	require.True(t, ok, "dd.span_id must be a JSON string, got %T", entry["dd.span_id"])
	require.Equal(t, spanIDHex, spanID)
}

func TestDatadogLogHandlerUsesCurrentSpanInContext(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(newTestDatadogHandler(&buf))

	const traceIDHex = "4bf92f3577b34da6a3ce929d0e0e4736"
	const parentSpanID = "00f067aa0ba902b7"
	const childSpanID = "11f067aa0ba902c8"

	parentCtx := trace.ContextWithSpanContext(context.Background(), testSpanContext(t, traceIDHex, parentSpanID, false))
	childCtx := trace.ContextWithSpanContext(parentCtx, testSpanContext(t, traceIDHex, childSpanID, false))

	logger.InfoContext(childCtx, "child span log")

	entry := decodeLogLine(t, &buf)
	require.Equal(t, traceIDHex, entry["dd.trace_id"])
	require.Equal(t, childSpanID, entry["dd.span_id"], "should report the current (innermost) span, not the parent")
}

func TestDatadogLogHandlerRemoteSpanContextIsValid(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(newTestDatadogHandler(&buf))

	const traceIDHex = "4bf92f3577b34da6a3ce929d0e0e4736"
	const spanIDHex = "00f067aa0ba902b7"
	sc := testSpanContext(t, traceIDHex, spanIDHex, true)
	ctx := trace.ContextWithSpanContext(context.Background(), sc)

	logger.InfoContext(ctx, "propagated")

	entry := decodeLogLine(t, &buf)
	require.Equal(t, traceIDHex, entry["dd.trace_id"])
	require.Equal(t, spanIDHex, entry["dd.span_id"])
}

func TestDatadogLogHandlerConcurrentContextsDoNotCrossContaminate(t *testing.T) {
	const n = 50
	var buf bytes.Buffer
	logger := slog.New(newTestDatadogHandler(&lockedWriter{w: &buf}, slog.String("dd.service", "go-svc")))

	ctxs := make([]context.Context, n)
	for i := 0; i < n; i++ {
		sc := testSpanContext(t, fmt.Sprintf("%032x", i+1), fmt.Sprintf("%016x", i+1), false)
		ctxs[i] = trace.ContextWithSpanContext(context.Background(), sc)
	}

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			logger.InfoContext(ctxs[i], "concurrent", slog.Int("i", i))
		}(i)
	}
	wg.Wait()

	entries := decodeLogLines(t, &buf)
	require.Len(t, entries, n)

	seen := make(map[int]struct{}, n)
	for _, entry := range entries {
		iVal, ok := entry["i"].(float64)
		require.True(t, ok, "record must include originating goroutine index, got %T", entry["i"])
		i := int(iVal)
		require.Equal(t, fmt.Sprintf("%032x", i+1), entry["dd.trace_id"], "record %d must keep its own trace ID", i)
		require.Equal(t, fmt.Sprintf("%016x", i+1), entry["dd.span_id"], "record %d must keep its own span ID", i)
		seen[i] = struct{}{}
	}
	require.Len(t, seen, n, "each goroutine must emit exactly one record")
}

func TestDatadogLogHandlerWithAttrsAndWithGroupPreserveWrapping(t *testing.T) {
	var buf bytes.Buffer
	base := newTestDatadogHandler(&buf, slog.String("dd.service", "go-svc"))

	withAttrs := base.WithAttrs([]slog.Attr{slog.String("extra", "value")})
	_, ok := withAttrs.(*datadogLogHandler)
	require.True(t, ok, "WithAttrs must return a *datadogLogHandler, not unwrap the enrichment")

	withGroup := base.WithGroup("grp")
	_, ok = withGroup.(*datadogLogHandler)
	require.True(t, ok, "WithGroup must return a *datadogLogHandler, not unwrap the enrichment")

	logger := slog.New(withAttrs)
	sc := testSpanContext(t, "4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", false)
	ctx := trace.ContextWithSpanContext(context.Background(), sc)
	logger.InfoContext(ctx, "msg")

	entry := decodeLogLine(t, &buf)
	require.Equal(t, "go-svc", entry["dd.service"])
	require.Equal(t, "value", entry["extra"])
	require.Equal(t, "4bf92f3577b34da6a3ce929d0e0e4736", entry["dd.trace_id"])
}

func TestNewDatadogLogHandlerOmitsUnsetServiceAttrs(t *testing.T) {
	t.Setenv("VERCEL_ENV", "")
	t.Setenv("VERCEL_GIT_COMMIT_SHA", "")

	var buf bytes.Buffer
	logger := slog.New(newDatadogLogHandler(slog.NewJSONHandler(&buf, nil)))

	logger.InfoContext(context.Background(), "startup")

	entry := decodeLogLine(t, &buf)
	require.Equal(t, otelServiceName, entry["dd.service"])
	require.NotContains(t, entry, "dd.env")
	require.NotContains(t, entry, "dd.version")
}

func TestNewDatadogLogHandlerIncludesConfiguredServiceAttrs(t *testing.T) {
	t.Setenv("VERCEL_ENV", "preview")
	t.Setenv("VERCEL_GIT_COMMIT_SHA", "abc123def")

	var buf bytes.Buffer
	logger := slog.New(newDatadogLogHandler(slog.NewJSONHandler(&buf, nil)))

	logger.InfoContext(context.Background(), "startup")

	entry := decodeLogLine(t, &buf)
	require.Equal(t, otelServiceName, entry["dd.service"])
	require.Equal(t, "preview", entry["dd.env"])
	require.Equal(t, "abc123def", entry["dd.version"])
}
