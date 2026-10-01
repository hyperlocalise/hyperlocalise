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

const glossaryInterchangeQueueURLEnv = "GLOSSARY_INTERCHANGE_QUEUE_URL"

type glossaryInterchangeMessage struct {
	SchemaVersion int    `json:"schemaVersion"`
	RunID         string `json:"runId"`
	Operation     string `json:"operation"`
}

type glossaryInterchangePublisher interface {
	Publish(context.Context, glossaryInterchangeMessage) error
	Ping(context.Context) error
}

type glossaryInterchangeSQSClient interface {
	SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
	GetQueueAttributes(context.Context, *sqs.GetQueueAttributesInput, ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error)
}

type sqsGlossaryInterchangePublisher struct {
	client   glossaryInterchangeSQSClient
	queueURL string
	initErr  error
}

func newGlossaryInterchangePublisher(ctx context.Context) (glossaryInterchangePublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(glossaryInterchangeQueueURLEnv))
	if queueURL == "" {
		slog.Warn("glossary_interchange_publisher_disabled", "reason", "missing_queue_url", "environment_variable", glossaryInterchangeQueueURLEnv)
		return nil, nil
	}
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
	if err != nil {
		publisher := newSQSGlossaryInterchangePublisher(nil, queueURL)
		publisher.initErr = fmt.Errorf("load AWS configuration: %w", err)
		slog.Error("glossary_interchange_publisher_configuration_failed", "reason", "load_aws_config", "environment_variable", glossaryInterchangeQueueURLEnv, "error", err)
		return publisher, publisher.initErr
	}
	slog.Info("glossary_interchange_publisher_configured", "environment_variable", glossaryInterchangeQueueURLEnv, "aws_region", strings.TrimSpace(os.Getenv("AWS_REGION")))
	return &sqsGlossaryInterchangePublisher{client: sqs.NewFromConfig(config), queueURL: queueURL}, nil
}

//nolint:unused // Kept as an injectable constructor for publisher tests and local wiring.
func newSQSGlossaryInterchangePublisher(client glossaryInterchangeSQSClient, queueURL string) *sqsGlossaryInterchangePublisher {
	return &sqsGlossaryInterchangePublisher{client: client, queueURL: strings.TrimSpace(queueURL)}
}

func (p *sqsGlossaryInterchangePublisher) Publish(ctx context.Context, message glossaryInterchangeMessage) error {
	if p == nil {
		return errors.New("glossary interchange publisher is unavailable")
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil || p.queueURL == "" {
		return errors.New("glossary interchange SQS client is unavailable")
	}
	if message.SchemaVersion == 0 {
		message.SchemaVersion = 1
	}
	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal glossary interchange message: %w", err)
	}
	if _, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{
		QueueUrl:    aws.String(p.queueURL),
		MessageBody: aws.String(string(body)),
	}); err != nil {
		return fmt.Errorf("send glossary interchange message: %w", err)
	}
	return nil
}

func (p *sqsGlossaryInterchangePublisher) Ping(ctx context.Context) error {
	if p == nil {
		return nil
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil || p.queueURL == "" {
		return errors.New("glossary interchange SQS client is unavailable")
	}
	_, err := p.client.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl: aws.String(p.queueURL),
		AttributeNames: []types.QueueAttributeName{
			types.QueueAttributeNameQueueArn,
		},
	})
	if err != nil {
		return fmt.Errorf("get glossary interchange queue attributes: %w", err)
	}
	return nil
}
