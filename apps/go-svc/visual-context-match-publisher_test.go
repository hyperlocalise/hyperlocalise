package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/stretchr/testify/require"
)

type fakeVisualContextMatchSQSClient struct {
	body    string
	sendErr error
}

func (f *fakeVisualContextMatchSQSClient) SendMessage(_ context.Context, input *sqs.SendMessageInput, _ ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	if f.sendErr != nil {
		return nil, f.sendErr
	}
	f.body = *input.MessageBody
	return &sqs.SendMessageOutput{}, nil
}

func TestNewVisualContextMatchPublisherDisabledWithoutQueue(t *testing.T) {
	t.Setenv(visualContextMatchQueueURLEnv, " ")

	publisher, err := newVisualContextMatchPublisher(t.Context())
	require.NoError(t, err)
	require.Nil(t, publisher)
}

func TestVisualContextMatchPublisherPublishesVersionedMessage(t *testing.T) {
	client := &fakeVisualContextMatchSQSClient{}
	publisher := &sqsVisualContextMatchPublisher{client: client, queueURL: "https://sqs.example/match"}

	require.NoError(t, publisher.Publish(t.Context(), visualContextMatchMessage{ProcessID: "proc_1"}))

	var message visualContextMatchMessage
	require.NoError(t, json.Unmarshal([]byte(client.body), &message))
	require.Equal(t, 1, message.SchemaVersion)
	require.Equal(t, "proc_1", message.ProcessID)
}

func TestVisualContextMatchPublisherPropagatesFailures(t *testing.T) {
	unavailable := (*sqsVisualContextMatchPublisher)(nil)
	require.ErrorContains(t, unavailable.Publish(t.Context(), visualContextMatchMessage{}), "unavailable")

	missingClient := &sqsVisualContextMatchPublisher{queueURL: "https://sqs.example/match"}
	require.ErrorContains(t, missingClient.Publish(t.Context(), visualContextMatchMessage{}), "unavailable")

	denied := &sqsVisualContextMatchPublisher{
		client:   &fakeVisualContextMatchSQSClient{sendErr: errors.New("denied")},
		queueURL: "https://sqs.example/match",
	}
	require.ErrorContains(t, denied.Publish(t.Context(), visualContextMatchMessage{ProcessID: "proc_1"}), "send visual context match message")
}
