package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/stretchr/testify/require"
)

type fakeActivityLogSQSClient struct {
	sendInput  *sqs.SendMessageInput
	sendErr    error
	attrsInput *sqs.GetQueueAttributesInput
	attrsErr   error
}

func (f *fakeActivityLogSQSClient) SendMessage(_ context.Context, input *sqs.SendMessageInput, _ ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	f.sendInput = input
	return &sqs.SendMessageOutput{}, f.sendErr
}

func (f *fakeActivityLogSQSClient) GetQueueAttributes(_ context.Context, input *sqs.GetQueueAttributesInput, _ ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error) {
	f.attrsInput = input
	return &sqs.GetQueueAttributesOutput{}, f.attrsErr
}

func TestSQSActivityLogPublisherPublish(t *testing.T) {
	client := &fakeActivityLogSQSClient{}
	publisher := newSQSActivityLogPublisher(client, "https://sqs.example/queue")
	publisher.clock = func() time.Time { return time.Date(2026, 9, 28, 1, 2, 3, 4_000_000, time.UTC) }
	publisher.newEventID = func() string { return "11111111-1111-4111-8111-111111111111" }
	organizationID := "22222222-2222-4222-8222-222222222222"
	actorID := "33333333-3333-4333-8333-333333333333"
	glossaryID := "44444444-4444-4444-8444-444444444444"

	err := publisher.Publish(context.Background(), activityLogEventInput{
		ActorUserID:    actorID,
		EventType:      "glossary_deleted",
		OrganizationID: organizationID,
		Payload:        map[string]any{"name": "Product terms", "resourceId": glossaryID},
		TargetID:       glossaryID,
		TargetKind:     "glossary",
	})

	require.NoError(t, err)
	require.Equal(t, "https://sqs.example/queue", aws.ToString(client.sendInput.QueueUrl))
	message, err := activitylog.DecodeMessage([]byte(aws.ToString(client.sendInput.MessageBody)))
	require.NoError(t, err)
	require.Equal(t, "glossary_deleted", message.Event.EventType)
	require.Equal(t, actorID, aws.ToString(message.Event.ActorUserID))
	require.Equal(t, organizationID, message.Event.OrganizationID)
	require.Equal(t, glossaryID, message.Event.TargetID)
	require.Equal(t, "2026-09-28T01:02:03.004Z", message.Event.CreatedAt)

	var payload map[string]any
	require.NoError(t, json.Unmarshal(message.Event.Payload, &payload))
	require.Equal(t, "Product terms", payload["name"])
}

func TestSQSActivityLogPublisherPing(t *testing.T) {
	client := &fakeActivityLogSQSClient{}
	publisher := newSQSActivityLogPublisher(client, "https://sqs.example/queue")

	require.NoError(t, publisher.Ping(context.Background()))
	require.Equal(t, "https://sqs.example/queue", aws.ToString(client.attrsInput.QueueUrl))
	require.Equal(t, []types.QueueAttributeName{types.QueueAttributeNameQueueArn}, client.attrsInput.AttributeNames)
}

func TestSQSActivityLogPublisherErrors(t *testing.T) {
	t.Run("send", func(t *testing.T) {
		publisher := newSQSActivityLogPublisher(&fakeActivityLogSQSClient{sendErr: errors.New("denied")}, "queue")
		err := publisher.Publish(context.Background(), activityLogEventInput{
			ActorUserID:    uuid.NewString(),
			EventType:      "glossary_deleted",
			OrganizationID: uuid.NewString(),
			Payload:        map[string]any{"resourceId": uuid.NewString()},
			TargetID:       uuid.NewString(),
			TargetKind:     "glossary",
		})
		require.ErrorContains(t, err, "send activity log message")
	})

	t.Run("ping", func(t *testing.T) {
		publisher := newSQSActivityLogPublisher(&fakeActivityLogSQSClient{attrsErr: errors.New("denied")}, "queue")
		require.ErrorContains(t, publisher.Ping(context.Background()), "get activity log queue attributes")
	})
}

func TestHealthActivityLog(t *testing.T) {
	h := newHandler()
	h.activityLog = &sqsActivityLogPublisher{initErr: errors.New("queue unavailable")}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)

	h.health(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	activityLog := dependencyStatus(t, rec.Body.Bytes(), "activity_log")
	require.Equal(t, "unavailable", activityLog["status"])
}
