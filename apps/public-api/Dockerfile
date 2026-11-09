# Build from the repository root: docker build -f apps/public-api/Dockerfile .
# Compiled with Datadog Orchestrion (same v1.14.0 pin as apps/go-svc) so
# net/http, pgx, and slog are auto-instrumented for APM, matching go-svc.
FROM golang:1.27.3-bookworm AS builder
WORKDIR /repo
COPY go.mod go.sum ./
COPY orchestrion.tool.go ./
COPY apps/public-api ./apps/public-api
RUN go mod download
RUN go install github.com/DataDog/orchestrion@v1.14.0
RUN CGO_ENABLED=0 orchestrion go build -trimpath -ldflags="-s -w" -o /public-api ./apps/public-api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /public-api /public-api
ENV PORT=8081
EXPOSE 8081
USER nonroot:nonroot
ENTRYPOINT ["/public-api"]
