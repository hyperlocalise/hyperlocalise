package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/translation/queue"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"github.com/uptrace/bun"
)

// ErrInvalidArgument reports invalid input at the application boundary.
var ErrInvalidArgument = errors.New("invalid translation request")

const defaultOutboxMaxAttempts = 5

// Service orchestrates translation job storage and async dispatch.
type Service struct {
	repository  *store.Repository
	publisher   queue.Publisher
	queueDriver string
	clock       Clock
}

// NewService constructs the translation application service.
func NewService(repository *store.Repository, publisher queue.Publisher, queueDriver string) *Service {
	return &Service{
		repository:  repository,
		publisher:   publisher,
		queueDriver: queueDriver,
		clock:       defaultClock,
	}
}

// CreateJob persists a queued job and writes an outbox record in the same transaction.
func (s *Service) CreateJob(
	ctx context.Context,
	request *translationv1.CreateTranslationJobRequest,
) (*JobRecord, error) {
	if request.GetProjectId() == "" {
		return nil, fmt.Errorf("%w: project_id is required", ErrInvalidArgument)
	}

	jobModel, queuedPayload, err := s.newQueuedJob(request)
	if err != nil {
		return nil, err
	}

	eventID, err := newID("evt")
	if err != nil {
		return nil, err
	}

	headers, err := encodeJSON(map[string]string{
		"queue_driver": s.queueDriver,
	})
	if err != nil {
		return nil, err
	}

	eventModel := &store.OutboxEventModel{
		ID:            eventID,
		Topic:         queue.TopicJobQueued,
		AggregateID:   jobModel.ID,
		Headers:       headers,
		Status:        store.OutboxStatusPending,
		AttemptCount:  0,
		MaxAttempts:   defaultOutboxMaxAttempts,
		NextAttemptAt: jobModel.CreatedAt,
		CreatedAt:     jobModel.CreatedAt,
		UpdatedAt:     jobModel.UpdatedAt,
	}

	queuedPayload.EventID = eventID
	outboxPayload, err := encodeJSON(queuedPayload)
	if err != nil {
		return nil, err
	}
	eventModel.Payload = outboxPayload
	err = s.repository.DB().RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if insertErr := s.repository.InsertJob(ctx, tx, jobModel); insertErr != nil {
			return insertErr
		}

		if insertErr := s.repository.InsertOutboxEvent(ctx, tx, eventModel); insertErr != nil {
			return insertErr
		}

		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("create translation job transaction: %w", err)
	}

	if publishErr := s.publisher.Publish(ctx, queue.Message{
		Topic:       eventModel.Topic,
		AggregateID: eventModel.AggregateID,
		Payload:     eventModel.Payload,
		Headers: map[string]string{
			"queue_driver": s.queueDriver,
		},
	}); publishErr != nil {
		// TODO: Move broker publication into a dedicated outbox dispatcher so that queue
		// delivery retries are decoupled from the gRPC request path.
		return nil, fmt.Errorf("publish queued job message: %w", publishErr)
	}

	return modelToJobRecord(jobModel), nil
}

// GetJob returns the full translation job resource.
func (s *Service) GetJob(ctx context.Context, projectID, jobID string) (*JobRecord, error) {
	job, err := s.repository.GetJob(ctx, jobID, projectID)
	if err != nil {
		return nil, err
	}

	return modelToJobRecord(job), nil
}

// ListJobs returns a bounded set of jobs for a project.
func (s *Service) ListJobs(
	ctx context.Context,
	projectID string,
	jobType translationv1.TranslationJob_Type,
	status translationv1.TranslationJob_Status,
	pageSize int32,
) ([]JobRecord, error) {
	jobs, err := s.repository.ListJobs(
		ctx,
		projectID,
		fromProtoJobType(jobType),
		fromProtoJobStatus(status),
		int(pageSize),
	)
	if err != nil {
		return nil, err
	}

	records := make([]JobRecord, 0, len(jobs))
	for idx := range jobs {
		records = append(records, *modelToJobRecord(&jobs[idx]))
	}

	return records, nil
}

func (s *Service) newQueuedJob(
	request *translationv1.CreateTranslationJobRequest,
) (*store.TranslationJobModel, *JobQueuedPayload, error) {
	now := s.clock()
	jobID, err := newID("job")
	if err != nil {
		return nil, nil, err
	}

	job := &store.TranslationJobModel{
		ID:        jobID,
		ProjectID: request.GetProjectId(),
		Status:    store.JobStatusQueued,
		CreatedAt: now,
		UpdatedAt: now,
	}

	switch input := request.Input.(type) {
	case *translationv1.CreateTranslationJobRequest_StringInput:
		if input.StringInput == nil {
			return nil, nil, fmt.Errorf("%w: string_input is required", ErrInvalidArgument)
		}

		payload, marshalErr := EncodeProto(input.StringInput)
		if marshalErr != nil {
			return nil, nil, marshalErr
		}

		job.Type = store.JobTypeString
		job.InputKind = store.JobTypeString
		job.InputPayload = payload
	case *translationv1.CreateTranslationJobRequest_FileInput:
		if input.FileInput == nil {
			return nil, nil, fmt.Errorf("%w: file_input is required", ErrInvalidArgument)
		}

		payload, marshalErr := EncodeProto(input.FileInput)
		if marshalErr != nil {
			return nil, nil, marshalErr
		}

		job.Type = store.JobTypeFile
		job.InputKind = store.JobTypeFile
		job.InputPayload = payload
	default:
		return nil, nil, fmt.Errorf("%w: one input variant must be set", ErrInvalidArgument)
	}

	return job, &JobQueuedPayload{
		JobID:        job.ID,
		ProjectID:    job.ProjectID,
		Type:         job.Type,
		InputKind:    job.InputKind,
		AttemptCount: 0,
		MaxAttempts:  defaultOutboxMaxAttempts,
		OccurredAt:   now.Format(time.RFC3339Nano),
	}, nil
}

func modelToJobRecord(model *store.TranslationJobModel) *JobRecord {
	if model == nil {
		return nil
	}

	return &JobRecord{
		ID:             model.ID,
		ProjectID:      model.ProjectID,
		Type:           model.Type,
		Status:         model.Status,
		InputKind:      model.InputKind,
		InputPayload:   model.InputPayload,
		OutcomeKind:    model.OutcomeKind,
		OutcomePayload: model.OutcomePayload,
		CreatedAt:      model.CreatedAt,
		UpdatedAt:      model.UpdatedAt,
		CompletedAt:    model.CompletedAt,
	}
}

func fromProtoJobType(value translationv1.TranslationJob_Type) string {
	switch value {
	case translationv1.TranslationJob_TYPE_STRING:
		return store.JobTypeString
	case translationv1.TranslationJob_TYPE_FILE:
		return store.JobTypeFile
	default:
		return ""
	}
}

func fromProtoJobStatus(value translationv1.TranslationJob_Status) string {
	switch value {
	case translationv1.TranslationJob_STATUS_QUEUED:
		return store.JobStatusQueued
	case translationv1.TranslationJob_STATUS_RUNNING:
		return store.JobStatusRunning
	case translationv1.TranslationJob_STATUS_SUCCEEDED:
		return store.JobStatusSucceeded
	case translationv1.TranslationJob_STATUS_FAILED:
		return store.JobStatusFailed
	default:
		return ""
	}
}
