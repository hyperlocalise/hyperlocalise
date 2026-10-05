package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

type fakeMemoryInterchangeSQSClient struct {
	body       string
	sendErr    error
	attributes error
}

func (f *fakeMemoryInterchangeSQSClient) SendMessage(_ context.Context, input *sqs.SendMessageInput, _ ...func(*sqs.Options)) (*sqs.SendMessageOutput, error) {
	if f.sendErr != nil {
		return nil, f.sendErr
	}
	f.body = *input.MessageBody
	return &sqs.SendMessageOutput{}, nil
}

func (f *fakeMemoryInterchangeSQSClient) GetQueueAttributes(_ context.Context, _ *sqs.GetQueueAttributesInput, _ ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error) {
	if f.attributes != nil {
		return nil, f.attributes
	}
	return &sqs.GetQueueAttributesOutput{Attributes: map[string]string{}}, nil
}

func TestMemoryInterchangePublisherPublishesVersionedMessage(t *testing.T) {
	client := &fakeMemoryInterchangeSQSClient{}
	publisher := newSQSMemoryInterchangePublisher(client, "https://sqs.example/memory")
	if err := publisher.Publish(context.Background(), memoryInterchangeMessage{AttemptID: "attempt", Operation: "export"}); err != nil {
		t.Fatal(err)
	}
	var message memoryInterchangeMessage
	if err := json.Unmarshal([]byte(client.body), &message); err != nil {
		t.Fatal(err)
	}
	if message.SchemaVersion != 1 || message.AttemptID != "attempt" || message.Operation != "export" {
		t.Fatalf("unexpected message: %+v", message)
	}
}

func TestMemoryInterchangePublisherPropagatesFailures(t *testing.T) {
	publisher := newSQSMemoryInterchangePublisher(&fakeMemoryInterchangeSQSClient{sendErr: errors.New("denied")}, "queue")
	if err := publisher.Publish(context.Background(), memoryInterchangeMessage{AttemptID: "attempt", Operation: "import"}); err == nil {
		t.Fatal("expected publish error")
	}
	publisher = newSQSMemoryInterchangePublisher(&fakeMemoryInterchangeSQSClient{attributes: errors.New("denied")}, "queue")
	if err := publisher.Ping(context.Background()); err == nil {
		t.Fatal("expected ping error")
	}
}
