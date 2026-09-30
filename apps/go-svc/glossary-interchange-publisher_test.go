package main

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/stretchr/testify/require"
)

type fakeGlossaryInterchangeSQSClient struct {
	attributesInput *sqs.GetQueueAttributesInput
	attributesErr   error
}

func (f *fakeGlossaryInterchangeSQSClient) SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	return &sqs.SendMessageOutput{}, nil
}

func (f *fakeGlossaryInterchangeSQSClient) GetQueueAttributes(_ context.Context, input *sqs.GetQueueAttributesInput, _ ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error) {
	f.attributesInput = input
	return &sqs.GetQueueAttributesOutput{}, f.attributesErr
}

func TestSQSGlossaryInterchangePublisherPing(t *testing.T) {
	client := &fakeGlossaryInterchangeSQSClient{}
	publisher := newSQSGlossaryInterchangePublisher(client, "https://sqs.example/glossary")

	require.NoError(t, publisher.Ping(context.Background()))
	require.Equal(t, "https://sqs.example/glossary", aws.ToString(client.attributesInput.QueueUrl))
	require.Equal(t, []types.QueueAttributeName{types.QueueAttributeNameQueueArn}, client.attributesInput.AttributeNames)
}

func TestSQSGlossaryInterchangePublisherPingUnavailable(t *testing.T) {
	publisher := newSQSGlossaryInterchangePublisher(&fakeGlossaryInterchangeSQSClient{attributesErr: errors.New("denied")}, "queue")

	require.ErrorContains(t, publisher.Ping(context.Background()), "get glossary interchange queue attributes")
}
