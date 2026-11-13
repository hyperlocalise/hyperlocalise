package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	"github.com/stretchr/testify/require"
)

type fakeGuidelineIngestSQSClient struct {
	body            string
	sendErr         error
	attributesInput *sqs.GetQueueAttributesInput
	attributesErr   error
}

func (f *fakeGuidelineIngestSQSClient) SendMessage(_ context.Context, input *sqs.SendMessageInput, _ ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	if f.sendErr != nil {
		return nil, f.sendErr
	}
	f.body = *input.MessageBody
	return &sqs.SendMessageOutput{}, nil
}

func (f *fakeGuidelineIngestSQSClient) GetQueueAttributes(_ context.Context, input *sqs.GetQueueAttributesInput, _ ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error) {
	f.attributesInput = input
	if f.attributesErr != nil {
		return nil, f.attributesErr
	}
	return &sqs.GetQueueAttributesOutput{}, nil
}

func TestNewGuidelineIngestPublisherDisabledWithoutQueue(t *testing.T) {
	t.Setenv(GUIDELINE_INGEST_QUEUE_URL_ENV, "")

	publisher, err := newGuidelineIngestPublisher(t.Context())
	require.NoError(t, err)
	require.Nil(t, publisher)
}

func TestGuidelineIngestPublisherPublishesVersionedMessage(t *testing.T) {
	client := &fakeGuidelineIngestSQSClient{}
	publisher := &sqsGuidelineIngestPublisher{client: client, queueURL: "https://sqs.example/ingest"}
	organizationID := uuid.NewString()
	documentID := uuid.NewString()
	revisionID := uuid.NewString()

	require.NoError(t, publisher.Publish(t.Context(), ingest.Message{
		Operation:      ingest.OperationExtractIndex,
		OrganizationID: organizationID,
		DocumentID:     documentID,
		RevisionID:     revisionID,
	}))

	var message ingest.Message
	require.NoError(t, json.Unmarshal([]byte(client.body), &message))
	require.Equal(t, ingest.SchemaVersion, message.SchemaVersion)
	require.Equal(t, ingest.OperationExtractIndex, message.Operation)
	require.Equal(t, organizationID, message.OrganizationID)
	require.Equal(t, documentID, message.DocumentID)
	require.Equal(t, revisionID, message.RevisionID)
}

func TestGuidelineIngestPublisherPropagatesFailures(t *testing.T) {
	require.ErrorContains(t, (*sqsGuidelineIngestPublisher)(nil).Publish(t.Context(), ingest.Message{}), "unavailable")

	initFailure := &sqsGuidelineIngestPublisher{initErr: errors.New("load AWS configuration")}
	require.ErrorContains(t, initFailure.Publish(t.Context(), ingest.Message{}), "load AWS configuration")
	require.ErrorContains(t, initFailure.Ping(t.Context()), "load AWS configuration")

	missingClient := &sqsGuidelineIngestPublisher{queueURL: "https://sqs.example/ingest"}
	require.ErrorContains(t, missingClient.Publish(t.Context(), ingest.Message{}), "unavailable")
	require.ErrorContains(t, missingClient.Ping(t.Context()), "unavailable")

	denied := &sqsGuidelineIngestPublisher{
		client:   &fakeGuidelineIngestSQSClient{sendErr: errors.New("denied")},
		queueURL: "https://sqs.example/ingest",
	}
	require.ErrorContains(t, denied.Publish(t.Context(), ingest.Message{
		Operation:      ingest.OperationSync,
		OrganizationID: uuid.NewString(),
	}), "send guideline ingest message")
}

func TestGuidelineIngestPublisherPing(t *testing.T) {
	require.NoError(t, (*sqsGuidelineIngestPublisher)(nil).Ping(t.Context()))

	client := &fakeGuidelineIngestSQSClient{}
	publisher := &sqsGuidelineIngestPublisher{client: client, queueURL: "https://sqs.example/ingest"}
	require.NoError(t, publisher.Ping(t.Context()))
	require.Equal(t, "https://sqs.example/ingest", aws.ToString(client.attributesInput.QueueUrl))
	require.Equal(t, []types.QueueAttributeName{types.QueueAttributeNameQueueArn}, client.attributesInput.AttributeNames)

	denied := &sqsGuidelineIngestPublisher{
		client:   &fakeGuidelineIngestSQSClient{attributesErr: errors.New("denied")},
		queueURL: "https://sqs.example/ingest",
	}
	require.ErrorContains(t, denied.Ping(t.Context()), "get guideline ingest queue attributes")
}
