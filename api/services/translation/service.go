package translation

import (
	"context"

	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Service exposes the translation gRPC API for deployment as a standalone service.
type Service struct {
	translationv1.UnimplementedTranslationServiceServer
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) CreateTranslationJob(
	context.Context,
	*translationv1.CreateTranslationJobRequest,
) (*translationv1.CreateTranslationJobResponse, error) {
	// TODO: Wire translation job creation into the microservice workflow.
	return nil, status.Error(codes.Unimplemented, "CreateTranslationJob is not implemented")
}

func (s *Service) GetTranslationJob(
	context.Context,
	*translationv1.GetTranslationJobRequest,
) (*translationv1.GetTranslationJobResponse, error) {
	// TODO: Wire translation job lookup into the microservice workflow.
	return nil, status.Error(codes.Unimplemented, "GetTranslationJob is not implemented")
}

func (s *Service) GetTranslationJobStatus(
	context.Context,
	*translationv1.GetTranslationJobStatusRequest,
) (*translationv1.GetTranslationJobStatusResponse, error) {
	// TODO: Wire translation job status reads into the microservice workflow.
	return nil, status.Error(codes.Unimplemented, "GetTranslationJobStatus is not implemented")
}

func (s *Service) ListTranslationJobs(
	context.Context,
	*translationv1.ListTranslationJobsRequest,
) (*translationv1.ListTranslationJobsResponse, error) {
	// TODO: Wire translation job listing into the microservice workflow.
	return nil, status.Error(codes.Unimplemented, "ListTranslationJobs is not implemented")
}
