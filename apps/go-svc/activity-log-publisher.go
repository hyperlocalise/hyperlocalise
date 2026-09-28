package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
)

const activityLogSQSQueueURLEnv = "ACTIVITY_LOG_QUEUE_URL"

type activityLogEventInput struct {
	ActorUserID    string
	EventType      string
	OrganizationID string
	Payload        map[string]any
	TargetID       string
	TargetKind     string
}

type activityLogPublisher interface {
	Publish(context.Context, activityLogEventInput) error
	Ping(context.Context) error
}

type activityLogSQSClient interface {
	SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
	GetQueueAttributes(context.Context, *sqs.GetQueueAttributesInput, ...func(*sqs.Options)) (*sqs.GetQueueAttributesOutput, error)
}

type sqsActivityLogPublisher struct {
	client     activityLogSQSClient
	clock      func() time.Time
	initErr    error
	queueURL   string
	newEventID func() string
}

func newActivityLogPublisher(ctx context.Context) (*sqsActivityLogPublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(activityLogSQSQueueURLEnv))
	if queueURL == "" {
		return nil, nil
	}

	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		publisher := newSQSActivityLogPublisher(nil, queueURL)
		publisher.initErr = fmt.Errorf("load AWS configuration: %w", err)
		return publisher, publisher.initErr
	}

	return newSQSActivityLogPublisher(sqs.NewFromConfig(config), queueURL), nil
}

func newSQSActivityLogPublisher(client activityLogSQSClient, queueURL string) *sqsActivityLogPublisher {
	return &sqsActivityLogPublisher{
		client:     client,
		clock:      time.Now,
		queueURL:   strings.TrimSpace(queueURL),
		newEventID: uuid.NewString,
	}
}

func (p *sqsActivityLogPublisher) Publish(ctx context.Context, input activityLogEventInput) error {
	if p == nil {
		return nil
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil {
		return errors.New("activity log SQS client is unavailable")
	}

	payload, err := json.Marshal(input.Payload)
	if err != nil {
		return fmt.Errorf("marshal activity log payload: %w", err)
	}

	event := activitylog.Event{
		ActorUserID:    aws.String(input.ActorUserID),
		ActorKind:      "user",
		CreatedAt:      p.clock().UTC().Format(time.RFC3339Nano),
		EventType:      input.EventType,
		ID:             p.newEventID(),
		OrganizationID: input.OrganizationID,
		Payload:        payload,
		TargetID:       input.TargetID,
		TargetKind:     input.TargetKind,
	}
	message := activitylog.Message{
		Event:         event,
		MessageType:   activitylog.MessageType,
		SchemaVersion: activitylog.SchemaVersion,
	}
	if err := activitylog.ValidateMessage(message); err != nil {
		return fmt.Errorf("validate activity log message: %w", err)
	}
	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal activity log message: %w", err)
	}

	_, err = p.client.SendMessage(ctx, &sqs.SendMessageInput{
		MessageBody: aws.String(string(body)),
		QueueUrl:    aws.String(p.queueURL),
	})
	if err != nil {
		return fmt.Errorf("send activity log message: %w", err)
	}
	return nil
}

func (p *sqsActivityLogPublisher) Ping(ctx context.Context) error {
	if p == nil {
		return nil
	}
	if p.initErr != nil {
		return p.initErr
	}
	if p.client == nil {
		return errors.New("activity log SQS client is unavailable")
	}

	_, err := p.client.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl: aws.String(p.queueURL),
		AttributeNames: []types.QueueAttributeName{
			types.QueueAttributeNameQueueArn,
		},
	})
	if err != nil {
		return fmt.Errorf("get activity log queue attributes: %w", err)
	}
	return nil
}

func (api *glossaryAPI) publishActivity(ctx context.Context, input activityLogEventInput) {
	if api.activityLog == nil {
		return
	}
	if err := api.activityLog.Publish(ctx, input); err != nil {
		slog.ErrorContext(ctx, "glossary_activity_log_publish_failed",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
	}
}
