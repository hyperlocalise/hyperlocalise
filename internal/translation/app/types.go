package app

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// JobQueuedPayload is the outbox payload for a queued translation job.
type JobQueuedPayload struct {
	EventID      string `json:"event_id"`
	JobID        string `json:"job_id"`
	ProjectID    string `json:"project_id"`
	Type         string `json:"type"`
	InputKind    string `json:"input_kind"`
	AttemptCount int    `json:"attempt_count,omitempty"`
	MaxAttempts  int    `json:"max_attempts,omitempty"`
	OccurredAt   string `json:"occurred_at"`
}

// JobRecord is the application view of a translation job.
type JobRecord struct {
	ID             string
	ProjectID      string
	Type           string
	Status         string
	InputKind      string
	InputPayload   []byte
	OutcomeKind    string
	OutcomePayload []byte
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CompletedAt    *time.Time
}

type FileVariantRecord struct {
	Locale    string
	FileID    string
	Path      string
	UpdatedAt time.Time
}

type FileRecord struct {
	ID           string
	ProjectID    string
	Path         string
	FileFormat   string
	SourceLocale string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Variants     []FileVariantRecord
}

type FileTreeNodeRecord struct {
	Type       string
	Path       string
	Name       string
	ParentPath string
	File       *FileRecord
}

// Clock is used for deterministic testing and timestamping.
type Clock func() time.Time

func defaultClock() time.Time {
	return time.Now().UTC()
}

func newID(prefix string) (string, error) {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate random id: %w", err)
	}

	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}

// EncodeProto marshals a protobuf message to JSON for Postgres storage.
func EncodeProto(message proto.Message) ([]byte, error) {
	payload, err := protojson.Marshal(message)
	if err != nil {
		return nil, fmt.Errorf("marshal proto payload: %w", err)
	}

	return payload, nil
}

func encodeJSON(value any) ([]byte, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal json payload: %w", err)
	}

	return payload, nil
}

// DecodeStringInput unmarshals a stored string job input payload.
func DecodeStringInput(payload []byte) (*translationv1.StringTranslationJobInput, error) {
	message := &translationv1.StringTranslationJobInput{}
	if err := protojson.Unmarshal(payload, message); err != nil {
		return nil, fmt.Errorf("decode string job input: %w", err)
	}

	return message, nil
}

// DecodeFileInput unmarshals a stored file job input payload.
func DecodeFileInput(payload []byte) (*translationv1.FileTranslationJobInput, error) {
	message := &translationv1.FileTranslationJobInput{}
	if err := protojson.Unmarshal(payload, message); err != nil {
		return nil, fmt.Errorf("decode file job input: %w", err)
	}

	return message, nil
}

func decodeStringResult(payload []byte) (*translationv1.StringTranslationJobResult, error) {
	message := &translationv1.StringTranslationJobResult{}
	if err := protojson.Unmarshal(payload, message); err != nil {
		return nil, fmt.Errorf("decode string job result: %w", err)
	}

	return message, nil
}

func decodeFileResult(payload []byte) (*translationv1.FileTranslationJobResult, error) {
	message := &translationv1.FileTranslationJobResult{}
	if err := protojson.Unmarshal(payload, message); err != nil {
		return nil, fmt.Errorf("decode file job result: %w", err)
	}

	return message, nil
}

func decodeJobError(payload []byte) (*translationv1.TranslationJobError, error) {
	message := &translationv1.TranslationJobError{}
	if err := protojson.Unmarshal(payload, message); err != nil {
		return nil, fmt.Errorf("decode translation job error: %w", err)
	}

	return message, nil
}

// ToProto converts the application record into the protobuf resource.
func (r JobRecord) ToProto() (*translationv1.TranslationJob, error) {
	job := &translationv1.TranslationJob{
		Id:        r.ID,
		ProjectId: r.ProjectID,
		Type:      toProtoJobType(r.Type),
		Status:    toProtoJobStatus(r.Status),
		CreatedAt: timestamppb.New(r.CreatedAt),
		UpdatedAt: timestamppb.New(r.UpdatedAt),
		CompletedAt: func() *timestamppb.Timestamp {
			if r.CompletedAt == nil {
				return nil
			}

			return timestamppb.New(*r.CompletedAt)
		}(),
	}

	switch r.InputKind {
	case "string":
		input, err := DecodeStringInput(r.InputPayload)
		if err != nil {
			return nil, err
		}
		job.Input = &translationv1.TranslationJob_StringInput{StringInput: input}
	case "file":
		input, err := DecodeFileInput(r.InputPayload)
		if err != nil {
			return nil, err
		}
		job.Input = &translationv1.TranslationJob_FileInput{FileInput: input}
	}

	switch r.OutcomeKind {
	case "string_result":
		result, err := decodeStringResult(r.OutcomePayload)
		if err != nil {
			return nil, err
		}
		job.Outcome = &translationv1.TranslationJob_StringResult{StringResult: result}
	case "file_result":
		result, err := decodeFileResult(r.OutcomePayload)
		if err != nil {
			return nil, err
		}
		job.Outcome = &translationv1.TranslationJob_FileResult{FileResult: result}
	case "error":
		jobError, err := decodeJobError(r.OutcomePayload)
		if err != nil {
			return nil, err
		}
		job.Outcome = &translationv1.TranslationJob_Error{Error: jobError}
	}

	return job, nil
}

// ToStatusProto converts the application record into the polling status resource.
func (r JobRecord) ToStatusProto() (*translationv1.TranslationJobStatus, error) {
	statusView := &translationv1.TranslationJobStatus{
		Id:        r.ID,
		ProjectId: r.ProjectID,
		Type:      toProtoJobType(r.Type),
		Status:    toProtoJobStatus(r.Status),
		CreatedAt: timestamppb.New(r.CreatedAt),
		UpdatedAt: timestamppb.New(r.UpdatedAt),
		CompletedAt: func() *timestamppb.Timestamp {
			if r.CompletedAt == nil {
				return nil
			}

			return timestamppb.New(*r.CompletedAt)
		}(),
	}

	if r.OutcomeKind == "error" {
		jobError, err := decodeJobError(r.OutcomePayload)
		if err != nil {
			return nil, err
		}
		statusView.Error = jobError
	}

	return statusView, nil
}

func toProtoJobType(value string) translationv1.TranslationJob_Type {
	switch value {
	case "string":
		return translationv1.TranslationJob_TYPE_STRING
	case "file":
		return translationv1.TranslationJob_TYPE_FILE
	default:
		return translationv1.TranslationJob_TYPE_UNSPECIFIED
	}
}

func toProtoJobStatus(value string) translationv1.TranslationJob_Status {
	switch value {
	case "queued":
		return translationv1.TranslationJob_STATUS_QUEUED
	case "running":
		return translationv1.TranslationJob_STATUS_RUNNING
	case "succeeded":
		return translationv1.TranslationJob_STATUS_SUCCEEDED
	case "failed":
		return translationv1.TranslationJob_STATUS_FAILED
	default:
		return translationv1.TranslationJob_STATUS_UNSPECIFIED
	}
}

func (r FileRecord) ToProto() *translationv1.TranslationFile {
	variants := make([]*translationv1.TranslationFileVariant, 0, len(r.Variants))
	for _, variant := range r.Variants {
		variants = append(variants, &translationv1.TranslationFileVariant{
			Locale:    variant.Locale,
			FileId:    variant.FileID,
			Path:      variant.Path,
			UpdatedAt: timestamppb.New(variant.UpdatedAt),
		})
	}
	return &translationv1.TranslationFile{
		Id:           r.ID,
		ProjectId:    r.ProjectID,
		Path:         r.Path,
		FileFormat:   toProtoFileFormat(r.FileFormat),
		SourceLocale: r.SourceLocale,
		CreatedAt:    timestamppb.New(r.CreatedAt),
		UpdatedAt:    timestamppb.New(r.UpdatedAt),
		Variants:     variants,
	}
}

func (r FileTreeNodeRecord) ToProto() *translationv1.TranslationFileTreeNode {
	node := &translationv1.TranslationFileTreeNode{
		Type:       toProtoNodeType(r.Type),
		Path:       r.Path,
		Name:       r.Name,
		ParentPath: r.ParentPath,
	}
	if r.File != nil {
		node.File = r.File.ToProto()
	}
	return node
}

func toProtoFileFormat(value string) translationv1.FileTranslationJobInput_FileFormat {
	switch value {
	case "xliff":
		return translationv1.FileTranslationJobInput_FILE_FORMAT_XLIFF
	case "json":
		return translationv1.FileTranslationJobInput_FILE_FORMAT_JSON
	case "po":
		return translationv1.FileTranslationJobInput_FILE_FORMAT_PO
	case "csv":
		return translationv1.FileTranslationJobInput_FILE_FORMAT_CSV
	default:
		return translationv1.FileTranslationJobInput_FILE_FORMAT_UNSPECIFIED
	}
}

func fromProtoFileFormat(value translationv1.FileTranslationJobInput_FileFormat) string {
	switch value {
	case translationv1.FileTranslationJobInput_FILE_FORMAT_XLIFF:
		return "xliff"
	case translationv1.FileTranslationJobInput_FILE_FORMAT_JSON:
		return "json"
	case translationv1.FileTranslationJobInput_FILE_FORMAT_PO:
		return "po"
	case translationv1.FileTranslationJobInput_FILE_FORMAT_CSV:
		return "csv"
	default:
		return ""
	}
}

func toProtoNodeType(value string) translationv1.TranslationFileTreeNode_NodeType {
	switch value {
	case "folder":
		return translationv1.TranslationFileTreeNode_NODE_TYPE_FOLDER
	case "file":
		return translationv1.TranslationFileTreeNode_NODE_TYPE_FILE
	default:
		return translationv1.TranslationFileTreeNode_NODE_TYPE_UNSPECIFIED
	}
}
