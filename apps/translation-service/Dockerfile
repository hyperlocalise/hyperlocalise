FROM debian:bookworm-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

COPY bazel-bin/apps/translation-service/translation-service_/translation-service /app/translation-service

EXPOSE 8080
ENV LISTEN_ADDR=:8080
ENV TRANSLATION_QUEUE_DRIVER=stub
ENV TRANSLATION_GCP_PUBSUB_PROJECT_ID=
ENV TRANSLATION_GCP_PUBSUB_TOPIC=
ENV GOOGLE_APPLICATION_CREDENTIALS=

USER appuser
ENTRYPOINT ["/app/translation-service"]
