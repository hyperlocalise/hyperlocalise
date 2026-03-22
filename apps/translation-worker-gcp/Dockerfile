FROM debian:bookworm-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

COPY bazel-bin/apps/translation-worker-gcp/translation-worker-gcp_/translation-worker-gcp /app/translation-worker-gcp

ENV TRANSLATION_QUEUE_DRIVER=gcp-pubsub
ENV TRANSLATION_GCP_PUBSUB_PROJECT_ID=
ENV TRANSLATION_GCP_PUBSUB_SUBSCRIPTION=
ENV TRANSLATION_LLM_PROVIDER=
ENV TRANSLATION_LLM_MODEL=
ENV TRANSLATION_LLM_SYSTEM_PROMPT=
ENV TRANSLATION_LLM_USER_PROMPT=

USER appuser
ENTRYPOINT ["/app/translation-worker-gcp"]
