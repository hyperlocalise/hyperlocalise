package main

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel/trace"
)

// datadogLogHandler adds Datadog trace correlation fields to slog records.
type datadogLogHandler struct {
	next          slog.Handler
	resourceAttrs []slog.Attr
}

func newDatadogLogHandler(next slog.Handler) slog.Handler {
	info := loadServiceResourceInfo()
	attrs := []slog.Attr{slog.String("dd.service", info.name)}
	if info.env != "" {
		attrs = append(attrs, slog.String("dd.env", info.env))
	}
	if info.version != "" {
		attrs = append(attrs, slog.String("dd.version", info.version))
	}
	return &datadogLogHandler{next: next, resourceAttrs: attrs}
}

func (h *datadogLogHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.next.Enabled(ctx, level)
}

func (h *datadogLogHandler) Handle(ctx context.Context, record slog.Record) error {
	record.AddAttrs(h.resourceAttrs...)
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		record.AddAttrs(
			slog.String("dd.trace_id", sc.TraceID().String()),
			slog.String("dd.span_id", sc.SpanID().String()),
		)
	}
	return h.next.Handle(ctx, record)
}

func (h *datadogLogHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &datadogLogHandler{next: h.next.WithAttrs(attrs), resourceAttrs: h.resourceAttrs}
}

func (h *datadogLogHandler) WithGroup(name string) slog.Handler {
	return &datadogLogHandler{next: h.next.WithGroup(name), resourceAttrs: h.resourceAttrs}
}
