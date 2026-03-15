FROM debian:bookworm-slim

WORKDIR /app

COPY bazel-bin/apps/translation-service/translation-service_/translation-service /app/translation-service

EXPOSE 8080
ENV LISTEN_ADDR=:8080

ENTRYPOINT ["/app/translation-service"]
