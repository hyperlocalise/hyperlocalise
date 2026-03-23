package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/translation/objectstore"
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
	repository        *store.Repository
	queueDriver       string
	objectStoreDriver string
	objectStore       objectstore.Store
	bucket            string
	clock             Clock
}

// NewService constructs the translation application service.
func NewService(repository *store.Repository, queueDriver, objectStoreDriver string, objectStore objectstore.Store, bucket string) *Service {
	return &Service{
		repository:        repository,
		queueDriver:       queueDriver,
		objectStoreDriver: objectStoreDriver,
		objectStore:       objectStore,
		bucket:            bucket,
		clock:             defaultClock,
	}
}

func (s *Service) CreateProject(
	ctx context.Context,
	request *translationv1.CreateProjectRequest,
) (*ProjectRecord, error) {
	name := strings.TrimSpace(request.GetName())
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrInvalidArgument)
	}

	now := s.clock()
	projectID, err := newID("proj")
	if err != nil {
		return nil, err
	}

	project := &store.TranslationProjectModel{
		ID:          projectID,
		Name:        name,
		Description: strings.TrimSpace(request.GetDescription()),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.repository.InsertProject(ctx, s.repository.DB(), project); err != nil {
		return nil, err
	}

	return modelToProjectRecord(project), nil
}

func (s *Service) GetProject(ctx context.Context, projectID string) (*ProjectRecord, error) {
	project, err := s.repository.GetProject(ctx, projectID)
	if err != nil {
		return nil, err
	}

	return modelToProjectRecord(project), nil
}

func (s *Service) ListProjects(ctx context.Context, pageSize int32) ([]ProjectRecord, error) {
	projects, err := s.repository.ListProjects(ctx, int(pageSize))
	if err != nil {
		return nil, err
	}

	records := make([]ProjectRecord, 0, len(projects))
	for idx := range projects {
		records = append(records, *modelToProjectRecord(&projects[idx]))
	}

	return records, nil
}

func (s *Service) UpdateProject(
	ctx context.Context,
	request *translationv1.UpdateProjectRequest,
) (*ProjectRecord, error) {
	if strings.TrimSpace(request.GetId()) == "" {
		return nil, fmt.Errorf("%w: id is required", ErrInvalidArgument)
	}

	var name *string
	if request.Name != nil {
		trimmed := strings.TrimSpace(request.GetName())
		if trimmed == "" {
			return nil, fmt.Errorf("%w: name cannot be empty", ErrInvalidArgument)
		}
		name = &trimmed
	}

	var description *string
	if request.Description != nil {
		trimmed := strings.TrimSpace(request.GetDescription())
		description = &trimmed
	}

	if name == nil && description == nil {
		return nil, fmt.Errorf("%w: at least one field must be updated", ErrInvalidArgument)
	}

	project, err := s.repository.UpdateProject(ctx, request.GetId(), name, description, s.clock())
	if err != nil {
		return nil, err
	}

	return modelToProjectRecord(project), nil
}

func (s *Service) DeleteProject(ctx context.Context, projectID string) error {
	if strings.TrimSpace(projectID) == "" {
		return fmt.Errorf("%w: id is required", ErrInvalidArgument)
	}

	objectRefs, err := s.projectObjectRefs(ctx, projectID)
	if err != nil {
		return err
	}
	if len(objectRefs) > 0 && s.objectStore == nil {
		return fmt.Errorf("translation object store is not configured")
	}
	for _, ref := range objectRefs {
		if deleteErr := s.objectStore.DeleteObject(ctx, objectstore.DeleteRequest{Object: ref}); deleteErr != nil && !errors.Is(deleteErr, objectstore.ErrObjectNotFound) {
			return deleteErr
		}
	}

	return s.repository.DeleteProject(ctx, projectID)
}

// CreateJob persists a queued job and writes an outbox record in the same transaction.
func (s *Service) CreateJob(
	ctx context.Context,
	request *translationv1.CreateTranslationJobRequest,
) (*JobRecord, error) {
	if request.GetProjectId() == "" {
		return nil, fmt.Errorf("%w: project_id is required", ErrInvalidArgument)
	}
	if err := s.requireProject(ctx, request.GetProjectId()); err != nil {
		return nil, err
	}

	jobModel, queuedPayload, err := s.newQueuedJob(ctx, request)
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
		ID:                    eventID,
		Topic:                 queue.TopicJobQueued,
		AggregateID:           jobModel.ID,
		Headers:               headers,
		Status:                store.OutboxStatusPending,
		AttemptCount:          0,
		MaxAttempts:           defaultOutboxMaxAttempts,
		NextAttemptAt:         jobModel.CreatedAt,
		DeliveryStatus:        store.OutboxDeliveryStatusPending,
		DeliveryAttemptCount:  0,
		DeliveryMaxAttempts:   defaultOutboxMaxAttempts,
		DeliveryNextAttemptAt: jobModel.CreatedAt,
		CreatedAt:             jobModel.CreatedAt,
		UpdatedAt:             jobModel.UpdatedAt,
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

func (s *Service) CreateFileUpload(
	ctx context.Context,
	request *translationv1.CreateTranslationFileUploadRequest,
) (string, string, time.Time, error) {
	if request.GetProjectId() == "" {
		return "", "", time.Time{}, fmt.Errorf("%w: project_id is required", ErrInvalidArgument)
	}
	if err := s.requireProject(ctx, request.GetProjectId()); err != nil {
		return "", "", time.Time{}, err
	}
	if strings.TrimSpace(request.GetPath()) == "" {
		return "", "", time.Time{}, fmt.Errorf("%w: path is required", ErrInvalidArgument)
	}
	fileFormat := fromProtoFileFormat(request.GetFileFormat())
	if fileFormat == "" {
		return "", "", time.Time{}, fmt.Errorf("%w: file_format is required", ErrInvalidArgument)
	}
	if strings.TrimSpace(request.GetSourceLocale()) == "" {
		return "", "", time.Time{}, fmt.Errorf("%w: source_locale is required", ErrInvalidArgument)
	}
	if s.objectStore == nil {
		return "", "", time.Time{}, fmt.Errorf("translation object store is not configured")
	}

	now := s.clock()
	expiresAt := now.Add(15 * time.Minute)
	uploadID, err := newID("upload")
	if err != nil {
		return "", "", time.Time{}, err
	}
	objectKey := buildSourceObjectKey(request.GetProjectId(), uploadID, request.GetPath())
	upload := &store.TranslationFileUploadModel{
		ID:             uploadID,
		ProjectID:      request.GetProjectId(),
		Path:           cleanCatalogPath(request.GetPath()),
		FileFormat:     fileFormat,
		SourceLocale:   request.GetSourceLocale(),
		ContentType:    strings.TrimSpace(request.GetContentType()),
		ChecksumSHA256: request.GetChecksumSha256(),
		StorageDriver:  s.bucketDriver(),
		Bucket:         s.bucket,
		ObjectKey:      objectKey,
		Status:         store.FileUploadStatusPending,
		CreatedAt:      now,
		UpdatedAt:      now,
		ExpiresAt:      expiresAt,
	}
	if request.SizeBytes != nil {
		size := request.GetSizeBytes()
		upload.SizeBytes = &size
	}
	if upload.ContentType == "" {
		upload.ContentType = "application/octet-stream"
	}
	if err := s.repository.InsertFileUpload(ctx, s.repository.DB(), upload); err != nil {
		return "", "", time.Time{}, err
	}

	url, err := s.objectStore.CreateUploadURL(ctx, objectstore.UploadRequest{
		Object:      objectstore.ObjectRef{Driver: upload.StorageDriver, Bucket: upload.Bucket, Key: upload.ObjectKey},
		ContentType: upload.ContentType,
		ExpiresAt:   expiresAt,
	})
	if err != nil {
		return "", "", time.Time{}, err
	}
	return uploadID, url, expiresAt, nil
}

func (s *Service) FinalizeFileUpload(
	ctx context.Context,
	projectID, uploadID string,
) (*FileRecord, error) {
	if projectID == "" || uploadID == "" {
		return nil, fmt.Errorf("%w: project_id and upload_id are required", ErrInvalidArgument)
	}
	upload, err := s.repository.GetFileUpload(ctx, uploadID, projectID)
	if err != nil {
		return nil, err
	}
	if upload.Status != store.FileUploadStatusPending {
		return nil, fmt.Errorf("%w: upload %s is already finalized", ErrInvalidArgument, uploadID)
	}

	objectInfo, err := s.objectStore.StatObject(ctx, objectstore.StatRequest{
		Object: objectstore.ObjectRef{
			Driver: upload.StorageDriver,
			Bucket: upload.Bucket,
			Key:    upload.ObjectKey,
		},
	})
	if err != nil {
		if errors.Is(err, objectstore.ErrObjectNotFound) {
			return nil, fmt.Errorf("%w: uploaded object is missing", ErrInvalidArgument)
		}
		return nil, err
	}
	if upload.SizeBytes != nil && *upload.SizeBytes != objectInfo.SizeBytes {
		return nil, fmt.Errorf("%w: uploaded object size mismatch", ErrInvalidArgument)
	}
	if strings.TrimSpace(upload.ChecksumSHA256) != "" {
		body, err := s.objectStore.GetObject(ctx, objectstore.GetRequest{
			Object: objectstore.ObjectRef{
				Driver: upload.StorageDriver,
				Bucket: upload.Bucket,
				Key:    upload.ObjectKey,
			},
		})
		if err != nil {
			return nil, err
		}
		sum := sha256.Sum256(body)
		if got := hex.EncodeToString(sum[:]); !strings.EqualFold(got, strings.TrimSpace(upload.ChecksumSHA256)) {
			return nil, fmt.Errorf("%w: uploaded object checksum mismatch", ErrInvalidArgument)
		}
	}

	now := s.clock()
	file, err := s.finalizeUploadTx(ctx, upload, objectInfo, now)
	if err != nil {
		return nil, err
	}
	return file, nil
}

func (s *Service) GetFile(ctx context.Context, projectID, fileID string) (*FileRecord, error) {
	fileModel, err := s.repository.GetFile(ctx, fileID, projectID)
	if err != nil {
		return nil, err
	}
	return s.loadFileRecord(ctx, fileModel)
}

func (s *Service) ListFileTree(ctx context.Context, projectID, prefix string) ([]FileTreeNodeRecord, error) {
	if projectID == "" {
		return nil, fmt.Errorf("%w: project_id is required", ErrInvalidArgument)
	}
	if err := s.requireProject(ctx, projectID); err != nil {
		return nil, err
	}
	cleanPrefix := cleanCatalogPrefix(prefix)
	files, err := s.repository.ListFilesByPrefix(ctx, projectID, cleanPrefix)
	if err != nil {
		return nil, err
	}
	fileIDs := make([]string, 0, len(files))
	for idx := range files {
		fileIDs = append(fileIDs, files[idx].ID)
	}
	allVariants, err := s.repository.ListFileVariantsByFileIDs(ctx, fileIDs)
	if err != nil {
		return nil, err
	}
	variantsByFileID := make(map[string][]store.TranslationFileVariantModel, len(fileIDs))
	for _, variant := range allVariants {
		variantsByFileID[variant.FileID] = append(variantsByFileID[variant.FileID], variant)
	}

	nodes := make([]FileTreeNodeRecord, 0)
	folders := map[string]struct{}{}
	for idx := range files {
		record := fileModelToRecord(&files[idx], variantsByFileID[files[idx].ID])
		nodes = append(nodes, FileTreeNodeRecord{
			Type:       "file",
			Path:       record.Path,
			Name:       path.Base(record.Path),
			ParentPath: parentCatalogPath(record.Path),
			File:       record,
		})

		current := parentCatalogPath(record.Path)
		for current != "" && current != cleanPrefix {
			folders[current] = struct{}{}
			current = parentCatalogPath(current)
		}
	}

	folderPaths := make([]string, 0, len(folders))
	for folderPath := range folders {
		if cleanPrefix != "" && !strings.HasPrefix(folderPath, cleanPrefix) {
			continue
		}
		folderPaths = append(folderPaths, folderPath)
	}
	sort.Strings(folderPaths)
	for _, folderPath := range folderPaths {
		nodes = append(nodes, FileTreeNodeRecord{
			Type:       "folder",
			Path:       folderPath,
			Name:       path.Base(folderPath),
			ParentPath: parentCatalogPath(folderPath),
		})
	}

	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].Path == nodes[j].Path {
			return nodes[i].Type < nodes[j].Type
		}
		return nodes[i].Path < nodes[j].Path
	})
	return nodes, nil
}

func (s *Service) GetFileDownload(ctx context.Context, projectID, fileID, locale string) (string, time.Time, error) {
	fileModel, err := s.repository.GetFile(ctx, fileID, projectID)
	if err != nil {
		return "", time.Time{}, err
	}
	ref := objectstore.ObjectRef{
		Driver: fileModel.StorageDriver,
		Bucket: fileModel.Bucket,
		Key:    fileModel.ObjectKey,
	}
	if trimmedLocale := strings.TrimSpace(locale); trimmedLocale != "" {
		variant, variantErr := s.repository.GetFileVariant(ctx, fileID, trimmedLocale)
		if variantErr != nil {
			return "", time.Time{}, variantErr
		}
		ref = objectstore.ObjectRef{
			Driver: variant.StorageDriver,
			Bucket: variant.Bucket,
			Key:    variant.ObjectKey,
		}
	}
	expiresAt := s.clock().Add(15 * time.Minute)
	url, err := s.objectStore.CreateDownloadURL(ctx, objectstore.DownloadRequest{
		Object:    ref,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return url, expiresAt, nil
}

// ListJobs returns a bounded set of jobs for a project.
func (s *Service) ListJobs(
	ctx context.Context,
	projectID string,
	jobType translationv1.TranslationJob_Type,
	status translationv1.TranslationJob_Status,
	pageSize int32,
	cursor *JobListCursor,
) (*JobListPage, error) {
	if err := s.requireProject(ctx, projectID); err != nil {
		return nil, err
	}
	var storeCursor *store.JobListCursor
	if cursor != nil {
		storeCursor = &store.JobListCursor{
			CreatedAt: cursor.CreatedAt,
			ID:        cursor.ID,
		}
	}

	page, err := s.repository.ListJobsPage(
		ctx,
		projectID,
		fromProtoJobType(jobType),
		fromProtoJobStatus(status),
		int(pageSize),
		storeCursor,
	)
	if err != nil {
		return nil, err
	}

	records := make([]JobRecord, 0, len(page.Jobs))
	for idx := range page.Jobs {
		records = append(records, *modelToJobRecord(&page.Jobs[idx]))
	}

	result := &JobListPage{Jobs: records}
	if page.NextCursor != nil {
		result.NextCursor = &JobListCursor{
			CreatedAt: page.NextCursor.CreatedAt,
			ID:        page.NextCursor.ID,
		}
	}

	return result, nil
}

func (s *Service) requireProject(ctx context.Context, projectID string) error {
	if _, err := s.repository.GetProject(ctx, projectID); err != nil {
		return err
	}

	return nil
}

func (s *Service) projectObjectRefs(ctx context.Context, projectID string) ([]objectstore.ObjectRef, error) {
	if _, err := s.repository.GetProject(ctx, projectID); err != nil {
		return nil, err
	}

	refs := map[objectstore.ObjectRef]struct{}{}
	uploads, err := s.repository.ListFileUploadsByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	for _, upload := range uploads {
		refs[objectstore.ObjectRef{
			Driver: upload.StorageDriver,
			Bucket: upload.Bucket,
			Key:    upload.ObjectKey,
		}] = struct{}{}
	}

	files, err := s.repository.ListFilesByPrefix(ctx, projectID, "")
	if err != nil {
		return nil, err
	}
	fileIDs := make([]string, 0, len(files))
	for _, file := range files {
		fileIDs = append(fileIDs, file.ID)
		refs[objectstore.ObjectRef{
			Driver: file.StorageDriver,
			Bucket: file.Bucket,
			Key:    file.ObjectKey,
		}] = struct{}{}
	}

	variants, err := s.repository.ListFileVariantsByFileIDs(ctx, fileIDs)
	if err != nil {
		return nil, err
	}
	for _, variant := range variants {
		refs[objectstore.ObjectRef{
			Driver: variant.StorageDriver,
			Bucket: variant.Bucket,
			Key:    variant.ObjectKey,
		}] = struct{}{}
	}

	objectRefs := make([]objectstore.ObjectRef, 0, len(refs))
	for ref := range refs {
		objectRefs = append(objectRefs, ref)
	}
	sort.Slice(objectRefs, func(i, j int) bool {
		if objectRefs[i].Bucket != objectRefs[j].Bucket {
			return objectRefs[i].Bucket < objectRefs[j].Bucket
		}
		if objectRefs[i].Key != objectRefs[j].Key {
			return objectRefs[i].Key < objectRefs[j].Key
		}
		return objectRefs[i].Driver < objectRefs[j].Driver
	})

	return objectRefs, nil
}

func (s *Service) newQueuedJob(
	ctx context.Context,
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
		if strings.TrimSpace(input.FileInput.GetSourceFileId()) == "" {
			return nil, nil, fmt.Errorf("%w: source_file_id is required", ErrInvalidArgument)
		}
		if fromProtoFileFormat(input.FileInput.GetFileFormat()) == "" {
			return nil, nil, fmt.Errorf("%w: file_format is required", ErrInvalidArgument)
		}
		if strings.TrimSpace(input.FileInput.GetSourceLocale()) == "" {
			return nil, nil, fmt.Errorf("%w: source_locale is required", ErrInvalidArgument)
		}
		if len(input.FileInput.GetTargetLocales()) == 0 {
			return nil, nil, fmt.Errorf("%w: target_locales is required", ErrInvalidArgument)
		}
		file, lookupErr := s.repository.GetFile(ctx, input.FileInput.GetSourceFileId(), request.GetProjectId())
		if lookupErr != nil {
			return nil, nil, lookupErr
		}
		if file.FileFormat != fromProtoFileFormat(input.FileInput.GetFileFormat()) {
			return nil, nil, fmt.Errorf("%w: file_format does not match stored source file", ErrInvalidArgument)
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

func modelToProjectRecord(model *store.TranslationProjectModel) *ProjectRecord {
	if model == nil {
		return nil
	}

	return &ProjectRecord{
		ID:          model.ID,
		Name:        model.Name,
		Description: model.Description,
		CreatedAt:   model.CreatedAt,
		UpdatedAt:   model.UpdatedAt,
	}
}

func (s *Service) finalizeUploadTx(
	ctx context.Context,
	upload *store.TranslationFileUploadModel,
	objectInfo objectstore.ObjectInfo,
	now time.Time,
) (*FileRecord, error) {
	fileID, err := newID("file")
	if err != nil {
		return nil, err
	}

	model := &store.TranslationFileModel{
		ID:             fileID,
		ProjectID:      upload.ProjectID,
		Path:           upload.Path,
		FileFormat:     upload.FileFormat,
		SourceLocale:   upload.SourceLocale,
		ContentType:    upload.ContentType,
		ChecksumSHA256: upload.ChecksumSHA256,
		StorageDriver:  upload.StorageDriver,
		Bucket:         upload.Bucket,
		ObjectKey:      upload.ObjectKey,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	model.SizeBytes = objectInfo.SizeBytes
	err = s.repository.DB().RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		existing, lookupErr := s.repository.GetFileByPath(ctx, upload.ProjectID, upload.Path)
		if lookupErr != nil && !errors.Is(lookupErr, store.ErrNotFound) {
			return lookupErr
		}
		if existing != nil {
			model.ID = existing.ID
			model.CreatedAt = existing.CreatedAt
		}
		if upsertErr := s.repository.UpsertFile(ctx, tx, model); upsertErr != nil {
			return upsertErr
		}
		return s.repository.FinalizeFileUpload(ctx, tx, upload.ID, now)
	})
	if err != nil {
		return nil, fmt.Errorf("finalize translation file upload transaction: %w", err)
	}
	fileModel, err := s.repository.GetFileByPath(ctx, upload.ProjectID, upload.Path)
	if err != nil {
		return nil, err
	}
	return s.loadFileRecord(ctx, fileModel)
}

func (s *Service) loadFileRecord(ctx context.Context, model *store.TranslationFileModel) (*FileRecord, error) {
	variants, err := s.repository.ListFileVariants(ctx, model.ID)
	if err != nil {
		return nil, err
	}
	return fileModelToRecord(model, variants), nil
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

func buildSourceObjectKey(projectID, uploadID, filePath string) string {
	return path.Join("projects", projectID, "source", uploadID, cleanCatalogPath(filePath))
}

func cleanCatalogPath(value string) string {
	return strings.TrimPrefix(path.Clean("/"+strings.TrimSpace(value)), "/")
}

func cleanCatalogPrefix(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return cleanCatalogPath(trimmed)
}

func parentCatalogPath(value string) string {
	dir := path.Dir(value)
	if dir == "." || dir == "/" {
		return ""
	}
	return dir
}

func (s *Service) bucketDriver() string {
	return s.objectStoreDriver
}

func fileModelToRecord(model *store.TranslationFileModel, variants []store.TranslationFileVariantModel) *FileRecord {
	record := &FileRecord{
		ID:           model.ID,
		ProjectID:    model.ProjectID,
		Path:         model.Path,
		FileFormat:   model.FileFormat,
		SourceLocale: model.SourceLocale,
		CreatedAt:    model.CreatedAt,
		UpdatedAt:    model.UpdatedAt,
		Variants:     make([]FileVariantRecord, 0, len(variants)),
	}
	for _, variant := range variants {
		record.Variants = append(record.Variants, FileVariantRecord{
			Locale:    variant.Locale,
			FileID:    variant.FileID,
			Path:      variant.Path,
			UpdatedAt: variant.UpdatedAt,
		})
	}
	return record
}
