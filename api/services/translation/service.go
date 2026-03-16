package translation

import (
	"context"
	"errors"
	"fmt"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Service exposes the translation gRPC API for deployment as a standalone service.
type Service struct {
	translationv1.UnimplementedTranslationServiceServer

	app *translationapp.Service
}

func NewService(app *translationapp.Service) *Service {
	return &Service{app: app}
}

func (s *Service) CreateTranslationJob(
	ctx context.Context,
	request *translationv1.CreateTranslationJobRequest,
) (*translationv1.CreateTranslationJobResponse, error) {
	job, err := s.app.CreateJob(ctx, request)
	if err != nil {
		return nil, mapError(err)
	}

	jobProto, err := job.ToProto()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "encode translation job response: %v", err)
	}

	return &translationv1.CreateTranslationJobResponse{Job: jobProto}, nil
}

func (s *Service) GetTranslationJob(
	ctx context.Context,
	request *translationv1.GetTranslationJobRequest,
) (*translationv1.GetTranslationJobResponse, error) {
	ref := request.GetTranslationJob()
	if ref == nil {
		return nil, status.Error(codes.InvalidArgument, "translation_job is required")
	}

	job, err := s.app.GetJob(ctx, ref.GetProjectId(), ref.GetId())
	if err != nil {
		return nil, mapError(err)
	}

	jobProto, err := job.ToProto()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "encode translation job response: %v", err)
	}

	return &translationv1.GetTranslationJobResponse{Job: jobProto}, nil
}

func (s *Service) GetTranslationJobStatus(
	ctx context.Context,
	request *translationv1.GetTranslationJobStatusRequest,
) (*translationv1.GetTranslationJobStatusResponse, error) {
	ref := request.GetTranslationJob()
	if ref == nil {
		return nil, status.Error(codes.InvalidArgument, "translation_job is required")
	}

	job, err := s.app.GetJob(ctx, ref.GetProjectId(), ref.GetId())
	if err != nil {
		return nil, mapError(err)
	}

	statusProto, err := job.ToStatusProto()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "encode translation job status: %v", err)
	}

	return &translationv1.GetTranslationJobStatusResponse{Job: statusProto}, nil
}

func (s *Service) ListTranslationJobs(
	ctx context.Context,
	request *translationv1.ListTranslationJobsRequest,
) (*translationv1.ListTranslationJobsResponse, error) {
	const maxPageSize int32 = 200

	if request.GetProjectId() == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	pageSize := int32(50)
	if request.GetPage() != nil && request.GetPage().GetPageSize() > 0 {
		pageSize = request.GetPage().GetPageSize()
	}
	if pageSize > maxPageSize {
		return nil, status.Errorf(codes.InvalidArgument, "page_size must be <= %d", maxPageSize)
	}

	jobs, err := s.app.ListJobs(ctx, request.GetProjectId(), request.GetType(), request.GetStatus(), pageSize)
	if err != nil {
		return nil, mapError(err)
	}

	response := &translationv1.ListTranslationJobsResponse{
		Jobs: make([]*translationv1.TranslationJob, 0, len(jobs)),
		// TODO: Add cursor-based pagination once the storage contract is settled.
	}

	for idx := range jobs {
		jobProto, encodeErr := jobs[idx].ToProto()
		if encodeErr != nil {
			return nil, status.Errorf(codes.Internal, "encode listed translation job: %v", encodeErr)
		}

		response.Jobs = append(response.Jobs, jobProto)
	}

	return response, nil
}

func mapError(err error) error {
	switch {
	case errors.Is(err, translationapp.ErrInvalidArgument):
		return status.Error(codes.InvalidArgument, err.Error())
	case errors.Is(err, store.ErrNotFound):
		return status.Error(codes.NotFound, err.Error())
	default:
		return status.Error(codes.Internal, fmt.Sprintf("translation service error: %v", err))
	}
}
