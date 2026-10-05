package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

const memoryInterchangeQueueURLEnv = "MEMORY_INTERCHANGE_QUEUE_URL"

type memoryInterchangeMessage struct {
	SchemaVersion int    `json:"schemaVersion"`
	AttemptID     string `json:"attemptId"`
	Operation     string `json:"operation"`
}

type memoryInterchangePublisher interface {
	Publish(context.Context, memoryInterchangeMessage) error
	Ping(context.Context) error
}

type memoryInterchangeSQSClient interface {
	SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
	GetQueueAttributes(context.Context, *sqs.GetQueueAttributesInput, ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error)
}

type sqsMemoryInterchangePublisher struct {
	client   memoryInterchangeSQSClient
	queueURL string
	initErr  error
}

func newMemoryInterchangePublisher(ctx context.Context) (memoryInterchangePublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(memoryInterchangeQueueURLEnv))
	if queueURL == "" {
		slog.Warn("memory_interchange_publisher_disabled", "reason", "missing_queue_url", "environment_variable", memoryInterchangeQueueURLEnv)
		return nil, nil
	}
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
	if err != nil {
		publisher := newSQSMemoryInterchangePublisher(nil, queueURL)
		publisher.initErr = fmt.Errorf("load AWS configuration: %w", err)
		return publisher, publisher.initErr
	}
	return &sqsMemoryInterchangePublisher{client: sqs.NewFromConfig(config), queueURL: queueURL}, nil
}

func newSQSMemoryInterchangePublisher(client memoryInterchangeSQSClient, queueURL string) *sqsMemoryInterchangePublisher {
	return &sqsMemoryInterchangePublisher{client: client, queueURL: strings.TrimSpace(queueURL)}
}

func (p *sqsMemoryInterchangePublisher) Publish(ctx context.Context, message memoryInterchangeMessage) error {
	if p == nil || p.initErr != nil {
		if p != nil && p.initErr != nil {
			return p.initErr
		}
		return errors.New("memory interchange publisher is unavailable")
	}
	if p.client == nil || p.queueURL == "" {
		return errors.New("memory interchange SQS client is unavailable")
	}
	if message.SchemaVersion == 0 {
		message.SchemaVersion = 1
	}
	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal memory interchange message: %w", err)
	}
	if _, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{QueueUrl: aws.String(p.queueURL), MessageBody: aws.String(string(body))}); err != nil {
		return fmt.Errorf("send memory interchange message: %w", err)
	}
	return nil
}

func (p *sqsMemoryInterchangePublisher) Ping(ctx context.Context) error {
	if p == nil {
		return nil
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil || p.queueURL == "" {
		return errors.New("memory interchange SQS client is unavailable")
	}
	_, err := p.client.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl: aws.String(p.queueURL),
		AttributeNames: []types.QueueAttributeName{
			types.QueueAttributeNameQueueArn,
		},
	})
	if err != nil {
		return fmt.Errorf("get memory interchange queue attributes: %w", err)
	}
	return nil
}
