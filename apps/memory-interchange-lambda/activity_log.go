package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
)

const memoryInterchangeActivityLogQueueURLEnv = "ACTIVITY_LOG_QUEUE_URL"

type memoryInterchangeActivityInput struct {
	ActorKind      string
	ActorUserID    string
	EventType      string
	OrganizationID string
	Payload        json.RawMessage
	TargetID       string
	TargetKind     string
}

type memoryInterchangeActivityPublisher struct {
	client   *sqs.Client
	queueURL string
}

func newMemoryInterchangeActivityPublisher(ctx context.Context) (*memoryInterchangeActivityPublisher, error) {
	queueURL := strings.TrimSpace(os.Getenv(memoryInterchangeActivityLogQueueURLEnv))
	if queueURL == "" {
		return nil, nil
	}
	region := strings.TrimSpace(os.Getenv("AWS_REGION"))
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("load AWS configuration: %w", err)
	}
	return &memoryInterchangeActivityPublisher{
		client:   sqs.NewFromConfig(config),
		queueURL: queueURL,
	}, nil
}

func (p *memoryInterchangeActivityPublisher) Publish(ctx context.Context, input memoryInterchangeActivityInput) error {
	if p == nil || p.client == nil {
		return nil
	}
	actorKind := strings.TrimSpace(input.ActorKind)
	if actorKind == "" {
		actorKind = "user"
	}
	event := activitylog.Event{
		ActorKind:      actorKind,
		CreatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		EventType:      input.EventType,
		ID:             uuid.NewString(),
		OrganizationID: input.OrganizationID,
		Payload:        input.Payload,
		TargetID:       input.TargetID,
		TargetKind:     input.TargetKind,
	}
	if userID := strings.TrimSpace(input.ActorUserID); userID != "" {
		event.ActorUserID = aws.String(userID)
	}
	message := activitylog.Message{
		Event:         event,
		MessageType:   activitylog.MessageType,
		SchemaVersion: activitylog.SchemaVersion,
	}
	if err := activitylog.ValidateMessage(message); err != nil {
		return err
	}
	body, err := json.Marshal(message)
	if err != nil {
		return err
	}
	_, err = p.client.SendMessage(ctx, &sqs.SendMessageInput{
		MessageBody: aws.String(string(body)),
		QueueUrl:    aws.String(p.queueURL),
	})
	if err != nil {
		return errors.New("send activity log message")
	}
	return nil
}
