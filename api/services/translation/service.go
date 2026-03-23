package translation

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	commonv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/common/v1"
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

const listJobsCursorVersion = 2

type listJobsPageToken struct {
	Version   int32  `json:"v"`
	ProjectID string `json:"project_id"`
	Type      int32  `json:"type"`
	Status    int32  `json:"status"`
	CreatedAt string `json:"created_at"`
	ID        string `json:"id"`
}

func NewService(app *translationapp.Service) *Service {
	return &Service{app: app}
}

func (s *Service) CreateProject(
	ctx context.Context,
	request *translationv1.CreateProjectRequest,
) (*translationv1.CreateProjectResponse, error) {
	project, err := s.app.CreateProject(ctx, request)
	if err != nil {
		return nil, mapError(err)
	}

	return &translationv1.CreateProjectResponse{Project: project.ToProto()}, nil
}

func (s *Service) GetProject(
	ctx context.Context,
	request *translationv1.GetProjectRequest,
) (*translationv1.GetProjectResponse, error) {
	project, err := s.app.GetProject(ctx, request.GetId())
	if err != nil {
		return nil, mapError(err)
	}

	return &translationv1.GetProjectResponse{Project: project.ToProto()}, nil
}

func (s *Service) ListProjects(
	ctx context.Context,
	request *translationv1.ListProjectsRequest,
) (*translationv1.ListProjectsResponse, error) {
	const maxPageSize int32 = 200

	pageSize := int32(50)
	if request.GetPage() != nil && request.GetPage().GetPageSize() > 0 {
		pageSize = request.GetPage().GetPageSize()
	}
	if pageSize > maxPageSize {
		return nil, status.Errorf(codes.InvalidArgument, "page_size must be <= %d", maxPageSize)
	}

	projects, err := s.app.ListProjects(ctx, pageSize)
	if err != nil {
		return nil, mapError(err)
	}

	response := &translationv1.ListProjectsResponse{
		Projects: make([]*translationv1.Project, 0, len(projects)),
		Page:     &commonv1.PageResponse{},
		// TODO: Add cursor-based pagination once the storage contract is settled.
	}
	for idx := range projects {
		response.Projects = append(response.Projects, projects[idx].ToProto())
	}

	return response, nil
}

func (s *Service) UpdateProject(
	ctx context.Context,
	request *translationv1.UpdateProjectRequest,
) (*translationv1.UpdateProjectResponse, error) {
	project, err := s.app.UpdateProject(ctx, request)
	if err != nil {
		return nil, mapError(err)
	}

	return &translationv1.UpdateProjectResponse{Project: project.ToProto()}, nil
}

func (s *Service) DeleteProject(
	ctx context.Context,
	request *translationv1.DeleteProjectRequest,
) (*translationv1.DeleteProjectResponse, error) {
	if err := s.app.DeleteProject(ctx, request.GetId()); err != nil {
		return nil, mapError(err)
	}

	return &translationv1.DeleteProjectResponse{}, nil
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

	pageRequest := request.GetPage()
	pageToken := ""
	if pageRequest != nil {
		pageToken = pageRequest.GetPageToken()
	}

	cursor, err := decodeListJobsPageToken(pageToken, request)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid page_token: %v", err)
	}

	page, err := s.app.ListJobs(ctx, request.GetProjectId(), request.GetType(), request.GetStatus(), pageSize, cursor)
	if err != nil {
		return nil, mapError(err)
	}

	response := &translationv1.ListTranslationJobsResponse{
		Jobs: make([]*translationv1.TranslationJob, 0, len(page.Jobs)),
	}

	for idx := range page.Jobs {
		jobProto, encodeErr := page.Jobs[idx].ToProto()
		if encodeErr != nil {
			return nil, status.Errorf(codes.Internal, "encode listed translation job: %v", encodeErr)
		}

		response.Jobs = append(response.Jobs, jobProto)
	}
	if page.NextCursor != nil {
		token, err := encodeListJobsPageToken(page.NextCursor, request)
		if err != nil {
			return nil, status.Errorf(codes.Internal, "encode translation job page token: %v", err)
		}
		response.Page = &commonv1.PageResponse{NextPageToken: token}
	}

	return response, nil
}

func encodeListJobsPageToken(
	cursor *translationapp.JobListCursor,
	request *translationv1.ListTranslationJobsRequest,
) (string, error) {
	if cursor == nil {
		return "", nil
	}
	if request == nil {
		return "", fmt.Errorf("request is required")
	}
	if cursor.ID == "" || cursor.CreatedAt.IsZero() {
		return "", fmt.Errorf("cursor is incomplete")
	}

	payload, err := json.Marshal(listJobsPageToken{
		Version:   listJobsCursorVersion,
		ProjectID: request.GetProjectId(),
		Type:      int32(request.GetType()),
		Status:    int32(request.GetStatus()),
		CreatedAt: cursor.CreatedAt.UTC().Format(time.RFC3339Nano),
		ID:        cursor.ID,
	})
	if err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func decodeListJobsPageToken(
	token string,
	request *translationv1.ListTranslationJobsRequest,
) (*translationapp.JobListCursor, error) {
	if token == "" {
		return nil, nil
	}
	if request == nil {
		return nil, fmt.Errorf("request is required")
	}

	payload, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}

	var decoded listJobsPageToken
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	if decoded.Version != listJobsCursorVersion {
		return nil, fmt.Errorf("unsupported version %d", decoded.Version)
	}
	if decoded.ID == "" || decoded.CreatedAt == "" {
		return nil, fmt.Errorf("missing cursor fields")
	}
	if decoded.ProjectID == "" {
		return nil, fmt.Errorf("missing project_id")
	}
	if decoded.ProjectID != request.GetProjectId() {
		return nil, fmt.Errorf("page_token does not match project_id")
	}
	if decoded.Type != int32(request.GetType()) {
		return nil, fmt.Errorf("page_token does not match type filter")
	}
	if decoded.Status != int32(request.GetStatus()) {
		return nil, fmt.Errorf("page_token does not match status filter")
	}

	createdAt, err := time.Parse(time.RFC3339Nano, decoded.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("parse created_at: %w", err)
	}

	return &translationapp.JobListCursor{
		CreatedAt: createdAt.UTC(),
		ID:        decoded.ID,
	}, nil
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
