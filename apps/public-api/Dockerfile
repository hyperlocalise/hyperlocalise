# Build from the repository root: docker build -f apps/public-api/Dockerfile .
FROM golang:1.26.1-bookworm AS builder
WORKDIR /repo
COPY go.mod go.sum ./
COPY apps/public-api ./apps/public-api
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /public-api ./apps/public-api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /public-api /public-api
ENV PORT=8081
EXPOSE 8081
USER nonroot:nonroot
ENTRYPOINT ["/public-api"]
