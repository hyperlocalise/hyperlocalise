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
)

const visualContextMatchQueueURLEnv = "VISUAL_CONTEXT_MATCH_QUEUE_URL"

// visualContextMatchMessage is the versioned contract consumed by
// apps/visual-context-match-lambda.
type visualContextMatchMessage struct {
	SchemaVersion int    `json:"schemaVersion"`
	ProcessID     string `json:"processId"`
}

type visualContextMatchPublisher interface {
	Publish(context.Context, visualContextMatchMessage) error
}

type visualContextMatchSQSClient interface {
	SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
}

type sqsVisualContextMatchPublisher struct {
	client   visualContextMatchSQSClient
	queueURL string
}

// newVisualContextMatchPublisher returns nil when the queue is not configured,
// which disables the optional match API rather than failing startup.
func newVisualContextMatchPublisher(ctx context.Context) (visualContextMatchPublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(visualContextMatchQueueURLEnv))
	if queueURL == "" {
		slog.Warn("visual_context_match_publisher_disabled", "reason", "missing_queue_url", "environment_variable", visualContextMatchQueueURLEnv)
		return nil, nil
	}
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
	if err != nil {
		return nil, fmt.Errorf("load AWS configuration: %w", err)
	}
	slog.Info("visual_context_match_publisher_configured", "environment_variable", visualContextMatchQueueURLEnv)
	return &sqsVisualContextMatchPublisher{client: sqs.NewFromConfig(config), queueURL: queueURL}, nil
}

func (p *sqsVisualContextMatchPublisher) Publish(ctx context.Context, message visualContextMatchMessage) error {
	if p == nil || p.client == nil || p.queueURL == "" {
		return errors.New("visual context match SQS client is unavailable")
	}
	if message.SchemaVersion == 0 {
		message.SchemaVersion = 1
	}
	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal visual context match message: %w", err)
	}
	if _, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:    aws.String(p.queueURL),
		MessageBody: aws.String(string(body)),
	}); err != nil {
		return fmt.Errorf("send visual context match message: %w", err)
	}
	return nil
}
