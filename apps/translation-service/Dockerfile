FROM debian:bookworm-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

COPY bazel-bin/apps/translation-service/translation-service_/translation-service /app/translation-service

EXPOSE 8080
ENV LISTEN_ADDR=:8080

USER appuser
ENTRYPOINT ["/app/translation-service"]
