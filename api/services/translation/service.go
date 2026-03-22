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
	"google.golang.org/protobuf/types/known/timestamppb"
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

func (s *Service) CreateTranslationFileUpload(
	ctx context.Context,
	request *translationv1.CreateTranslationFileUploadRequest,
) (*translationv1.CreateTranslationFileUploadResponse, error) {
	uploadID, uploadURL, expiresAt, err := s.app.CreateFileUpload(ctx, request)
	if err != nil {
		return nil, mapError(err)
	}
	return &translationv1.CreateTranslationFileUploadResponse{
		UploadId:  uploadID,
		UploadUrl: uploadURL,
		ExpiresAt: timestamppb.New(expiresAt),
	}, nil
}

func (s *Service) FinalizeTranslationFileUpload(
	ctx context.Context,
	request *translationv1.FinalizeTranslationFileUploadRequest,
) (*translationv1.FinalizeTranslationFileUploadResponse, error) {
	file, err := s.app.FinalizeFileUpload(ctx, request.GetProjectId(), request.GetUploadId())
	if err != nil {
		return nil, mapError(err)
	}
	return &translationv1.FinalizeTranslationFileUploadResponse{File: file.ToProto()}, nil
}

func (s *Service) GetTranslationFile(
	ctx context.Context,
	request *translationv1.GetTranslationFileRequest,
) (*translationv1.GetTranslationFileResponse, error) {
	file, err := s.app.GetFile(ctx, request.GetProjectId(), request.GetFileId())
	if err != nil {
		return nil, mapError(err)
	}
	return &translationv1.GetTranslationFileResponse{File: file.ToProto()}, nil
}

func (s *Service) ListTranslationFileTree(
	ctx context.Context,
	request *translationv1.ListTranslationFileTreeRequest,
) (*translationv1.ListTranslationFileTreeResponse, error) {
	nodes, err := s.app.ListFileTree(ctx, request.GetProjectId(), request.GetPrefix())
	if err != nil {
		return nil, mapError(err)
	}
	response := &translationv1.ListTranslationFileTreeResponse{
		Nodes: make([]*translationv1.TranslationFileTreeNode, 0, len(nodes)),
	}
	for _, node := range nodes {
		response.Nodes = append(response.Nodes, node.ToProto())
	}
	return response, nil
}

func (s *Service) GetTranslationFileDownload(
	ctx context.Context,
	request *translationv1.GetTranslationFileDownloadRequest,
) (*translationv1.GetTranslationFileDownloadResponse, error) {
	url, expiresAt, err := s.app.GetFileDownload(ctx, request.GetProjectId(), request.GetFileId(), request.GetLocale())
	if err != nil {
		return nil, mapError(err)
	}
	return &translationv1.GetTranslationFileDownloadResponse{
		DownloadUrl: url,
		ExpiresAt:   timestamppb.New(expiresAt),
	}, nil
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
