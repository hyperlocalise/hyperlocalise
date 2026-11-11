package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
)

const GUIDELINE_INGEST_QUEUE_URL_ENV = "GUIDELINE_INGEST_SQS_QUEUE_URL"

type guidelineIngestPublisher interface {
	Publish(context.Context, ingest.Message) error
	Ping(context.Context) error
}

type sqsGuidelineIngestPublisher struct {
	client   memoryInterchangeSQSClient
	queueURL string
	initErr  error
}

func newGuidelineIngestPublisher(ctx context.Context) (guidelineIngestPublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(GUIDELINE_INGEST_QUEUE_URL_ENV))
	if queueURL == "" {
		slog.Warn("guideline_ingest_publisher_disabled", "reason", "missing_queue_url", "environment_variable", GUIDELINE_INGEST_QUEUE_URL_ENV)
		return nil, nil
	}
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
	if err != nil {
		publisher := &sqsGuidelineIngestPublisher{queueURL: queueURL, initErr: fmt.Errorf("load AWS configuration: %w", err)}
		return publisher, publisher.initErr
	}
	return &sqsGuidelineIngestPublisher{client: sqs.NewFromConfig(config), queueURL: queueURL}, nil
}

func (p *sqsGuidelineIngestPublisher) Publish(ctx context.Context, message ingest.Message) error {
	if p == nil {
		return errors.New("guideline ingest publisher is unavailable")
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil || p.queueURL == "" {
		return errors.New("guideline ingest SQS client is unavailable")
	}
	message.SchemaVersion = ingest.SchemaVersion
	body, err := ingest.Encode(message)
	if err != nil {
		return fmt.Errorf("encode guideline ingest message: %w", err)
	}
	if _, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{QueueUrl: aws.String(p.queueURL), MessageBody: aws.String(string(body))}); err != nil {
		return fmt.Errorf("send guideline ingest message: %w", err)
	}
	return nil
}

func (p *sqsGuidelineIngestPublisher) Ping(ctx context.Context) error {
	if p == nil {
		return nil
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil || p.queueURL == "" {
		return errors.New("guideline ingest SQS client is unavailable")
	}
	_, err := p.client.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl:       aws.String(p.queueURL),
		AttributeNames: []types.QueueAttributeName{types.QueueAttributeNameQueueArn},
	})
	if err != nil {
		return fmt.Errorf("get guideline ingest queue attributes: %w", err)
	}
	return nil
}
