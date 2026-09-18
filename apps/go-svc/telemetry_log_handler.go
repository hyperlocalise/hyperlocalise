package main

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel/trace"
)

// groupOrAttrs preserves caller grouping without grouping Datadog correlation fields.
type groupOrAttrs struct {
	group string
	attrs []slog.Attr
}

// datadogLogHandler adds Datadog trace correlation fields to slog records.
type datadogLogHandler struct {
	next          slog.Handler
	resourceAttrs []slog.Attr
	goas          []groupOrAttrs
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
	out := slog.NewRecord(record.Time, record.Level, record.Message, record.PC)
	out.AddAttrs(h.resourceAttrs...)
	if sc := trace.SpanContextFromContext(ctx); sc.IsValid() {
		out.AddAttrs(
			slog.String("dd.trace_id", sc.TraceID().String()),
			slog.String("dd.span_id", sc.SpanID().String()),
		)
	}

	attrs := make([]slog.Attr, 0, record.NumAttrs())
	record.Attrs(func(a slog.Attr) bool {
		attrs = append(attrs, a)
		return true
	})
	for i := len(h.goas) - 1; i >= 0; i-- {
		goa := h.goas[i]
		if goa.group != "" {
			attrs = []slog.Attr{{Key: goa.group, Value: slog.GroupValue(attrs...)}}
			continue
		}
		combined := make([]slog.Attr, 0, len(goa.attrs)+len(attrs))
		combined = append(combined, goa.attrs...)
		combined = append(combined, attrs...)
		attrs = combined
	}
	out.AddAttrs(attrs...)
	return h.next.Handle(ctx, out)
}

func (h *datadogLogHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return h
	}
	copied := make([]slog.Attr, len(attrs))
	copy(copied, attrs)
	return h.withGroupOrAttrs(groupOrAttrs{attrs: copied})
}

func (h *datadogLogHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}
	return h.withGroupOrAttrs(groupOrAttrs{group: name})
}

func (h *datadogLogHandler) withGroupOrAttrs(goa groupOrAttrs) *datadogLogHandler {
	goas := make([]groupOrAttrs, len(h.goas)+1)
	copy(goas, h.goas)
	goas[len(h.goas)] = goa
	return &datadogLogHandler{
		next:          h.next,
		resourceAttrs: h.resourceAttrs,
		goas:          goas,
	}
}
