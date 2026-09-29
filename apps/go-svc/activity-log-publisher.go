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

const (
	activityLogQueueURLEnv    = "ACTIVITY_LOG_QUEUE_URL"
	activityLogPublishTimeout = 2 * time.Second
)

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

func newActivityLogPublisher(ctx context.Context) (activityLogPublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(activityLogQueueURLEnv))
	if queueURL == "" {
		slog.Warn(
			"activity_log_publisher_disabled",
			"reason", "missing_queue_url",
			"environment_variable", activityLogQueueURLEnv,
		)
		return nil, nil
	}

	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		slog.Error(
			"activity_log_publisher_configuration_failed",
			"reason", "load_aws_config",
			"environment_variable", activityLogQueueURLEnv,
			"aws_region", region,
			"error", err,
		)
		publisher := newSQSActivityLogPublisher(nil, queueURL)
		publisher.initErr = fmt.Errorf("load AWS configuration: %w", err)
		return publisher, publisher.initErr
	}

	slog.Info(
		"activity_log_publisher_configured",
		"environment_variable", activityLogQueueURLEnv,
		"aws_region", region,
	)
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
	slog.InfoContext(ctx, "activity_log_publish_started",
		"event_type", input.EventType,
		"organization_id", input.OrganizationID,
		"target_id", input.TargetID,
		"target_kind", input.TargetKind,
	)

	payload, err := json.Marshal(input.Payload)
	if err != nil {
		slog.ErrorContext(ctx, "activity_log_publish_failed",
			"phase", "marshal_payload",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
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
		slog.ErrorContext(ctx, "activity_log_publish_failed",
			"phase", "validate_message",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
		return fmt.Errorf("validate activity log message: %w", err)
	}
	body, err := json.Marshal(message)
	if err != nil {
		slog.ErrorContext(ctx, "activity_log_publish_failed",
			"phase", "marshal_message",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
		return fmt.Errorf("marshal activity log message: %w", err)
	}

	output, err := p.client.SendMessage(ctx, &sqs.SendMessageInput{
		MessageBody: aws.String(string(body)),
		QueueUrl:    aws.String(p.queueURL),
	})
	if err != nil {
		slog.ErrorContext(ctx, "activity_log_publish_failed",
			"phase", "send_sqs_message",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
		return fmt.Errorf("send activity log message: %w", err)
	}
	messageID := ""
	if output != nil {
		messageID = aws.ToString(output.MessageId)
	}
	slog.InfoContext(ctx, "activity_log_publish_succeeded",
		"event_type", input.EventType,
		"organization_id", input.OrganizationID,
		"target_id", input.TargetID,
		"target_kind", input.TargetKind,
		"message_id", messageID,
	)
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
	slog.InfoContext(ctx, "activity_log_health_check_started")

	_, err := p.client.GetQueueAttributes(ctx, &sqs.GetQueueAttributesInput{
		QueueUrl: aws.String(p.queueURL),
		AttributeNames: []types.QueueAttributeName{
			types.QueueAttributeNameQueueArn,
		},
	})
	if err != nil {
		slog.ErrorContext(ctx, "activity_log_health_check_failed", "error", err)
		return fmt.Errorf("get activity log queue attributes: %w", err)
	}
	slog.InfoContext(ctx, "activity_log_health_check_succeeded")
	return nil
}

func (api *glossaryAPI) publishActivity(ctx context.Context, input activityLogEventInput) {
	if api.activityLog == nil {
		slog.WarnContext(ctx, "glossary_activity_log_publish_skipped",
			"reason", "publisher_disabled",
			"environment_variable", activityLogQueueURLEnv,
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
		)
		return
	}
	slog.InfoContext(ctx, "glossary_activity_log_publish_requested",
		"event_type", input.EventType,
		"organization_id", input.OrganizationID,
		"target_id", input.TargetID,
		"target_kind", input.TargetKind,
	)
	publishCtx, cancel := context.WithTimeout(ctx, activityLogPublishTimeout)
	defer cancel()
	if err := api.activityLog.Publish(publishCtx, input); err != nil {
		slog.ErrorContext(ctx, "glossary_activity_log_publish_failed",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
	}
}

func (api *projectAPI) publishActivity(ctx context.Context, input activityLogEventInput) {
	if api.activityLog == nil {
		slog.WarnContext(ctx, "project_activity_log_publish_skipped",
			"reason", "publisher_disabled",
			"environment_variable", activityLogQueueURLEnv,
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
		)
		return
	}
	slog.InfoContext(ctx, "project_activity_log_publish_requested",
		"event_type", input.EventType,
		"organization_id", input.OrganizationID,
		"target_id", input.TargetID,
		"target_kind", input.TargetKind,
	)
	publishCtx, cancel := context.WithTimeout(ctx, activityLogPublishTimeout)
	defer cancel()
	if err := api.activityLog.Publish(publishCtx, input); err != nil {
		slog.ErrorContext(ctx, "project_activity_log_publish_failed",
			"event_type", input.EventType,
			"organization_id", input.OrganizationID,
			"target_id", input.TargetID,
			"target_kind", input.TargetKind,
			"error", err,
		)
	}
}
