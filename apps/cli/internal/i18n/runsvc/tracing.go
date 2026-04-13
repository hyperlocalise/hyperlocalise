package runsvc

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

const otelTracerName = "github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"

func tracer() trace.Tracer {
	return otel.Tracer(otelTracerName)
}

func startRunSpan(ctx context.Context, name string) (context.Context, trace.Span) {
	return tracer().Start(ctx, name)
}

func endRunSpan(span trace.Span, err error, errDesc string) {
	if err != nil {
		span.SetStatus(codes.Error, errDesc)
	}
	span.End()
}
