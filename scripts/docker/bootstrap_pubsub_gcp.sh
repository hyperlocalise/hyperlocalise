#!/bin/sh
set -eu

: "${PUBSUB_EMULATOR_HOST:=pubsub-emulator:8085}"
: "${PUBSUB_PROJECT_ID:=hyperlocalise-local}"
: "${PUBSUB_TOPIC:=translation-job-queued}"
: "${PUBSUB_SUBSCRIPTION:=translation-job-queued-local}"

export PUBSUB_EMULATOR_HOST
export CLOUDSDK_CORE_PROJECT="$PUBSUB_PROJECT_ID"

attempt=1
max_attempts=30
while [ "$attempt" -le "$max_attempts" ]; do
  if gcloud pubsub topics list >/dev/null 2>&1; then
    break
  fi

  echo "waiting for Pub/Sub emulator at ${PUBSUB_EMULATOR_HOST} (${attempt}/${max_attempts})"
  sleep 1
  attempt=$((attempt + 1))
done

if [ "$attempt" -gt "$max_attempts" ]; then
  echo "Pub/Sub emulator did not become ready in time" >&2
  exit 1
fi

if ! gcloud pubsub topics describe "$PUBSUB_TOPIC" >/dev/null 2>&1; then
  gcloud pubsub topics create "$PUBSUB_TOPIC"
fi

if ! gcloud pubsub subscriptions describe "$PUBSUB_SUBSCRIPTION" >/dev/null 2>&1; then
  gcloud pubsub subscriptions create "$PUBSUB_SUBSCRIPTION" --topic "$PUBSUB_TOPIC"
fi

echo "Pub/Sub emulator bootstrap completed for topic=${PUBSUB_TOPIC} subscription=${PUBSUB_SUBSCRIPTION}"
