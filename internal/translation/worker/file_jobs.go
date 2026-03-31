package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"

	translationfileparser "github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	translationapp "github.com/hyperlocalise/hyperlocalise/internal/translation/app"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/store"
	translationv1 "github.com/hyperlocalise/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
)

func (p *Processor) buildFileOutcome(
	ctx context.Context,
	job *store.TranslationJobModel,
) (string, []byte, time.Time, error) {
	if p.executor == nil {
		return "", nil, time.Time{}, permanentErrorf("string translation executor is not configured")
	}
	if p.objectStore == nil {
		return "", nil, time.Time{}, permanentErrorf("translation object store is not configured")
	}

	input, err := translationapp.DecodeFileInput(job.InputPayload)
	if err != nil {
		return "", nil, time.Time{}, permanentErrorf("decode file input: %w", err)
	}

	sourceFile, err := p.repository.GetFile(ctx, input.GetSourceFileId(), job.ProjectID)
	if err != nil {
		return "", nil, time.Time{}, permanentErrorf("load source file: %w", err)
	}
	if sourceFile.FileFormat != fileFormatString(input.GetFileFormat()) {
		return "", nil, time.Time{}, permanentErrorf("source file format mismatch")
	}

	sourceBytes, err := p.objectStore.GetObject(ctx, objectstore.GetRequest{
		Object: objectstore.ObjectRef{
			Driver: sourceFile.StorageDriver,
			Bucket: sourceFile.Bucket,
			Key:    sourceFile.ObjectKey,
		},
	})
	if err != nil {
		return "", nil, time.Time{}, retryableErrorf("download source file: %w", err)
	}

	adapter, err := newFileFormatAdapter(input.GetFileFormat())
	if err != nil {
		return "", nil, time.Time{}, permanentErrorf("resolve file format adapter: %w", err)
	}

	sourceEntries, entryContext, err := adapter.Parse(sourceFile.Path, sourceBytes)
	if err != nil {
		return "", nil, time.Time{}, permanentErrorf("parse source file: %w", err)
	}

	checkpoint, err := decodeFileCheckpoint(job.CheckpointPayload)
	if err != nil {
		return "", nil, time.Time{}, permanentErrorf("decode file checkpoint: %w", err)
	}

	for _, locale := range input.GetTargetLocales() {
		if _, ok := checkpoint.CompletedLocales[locale]; ok {
			continue
		}

		translatedEntries, translateErr := p.translateFileEntries(ctx, job.ProjectID, sourceEntries, entryContext, input, locale)
		if translateErr != nil {
			return "", nil, time.Time{}, retryableErrorf("translate locale %q: %w", locale, translateErr)
		}

		rendered, renderErr := adapter.Render(sourceFile.Path, sourceBytes, translatedEntries, input.GetSourceLocale(), locale)
		if renderErr != nil {
			return "", nil, time.Time{}, permanentErrorf("render locale %q: %w", locale, renderErr)
		}

		variant := &store.TranslationFileVariantModel{
			ID:             variantID(sourceFile.ID, locale),
			FileID:         sourceFile.ID,
			Locale:         locale,
			Path:           sourceFile.Path,
			ContentType:    sourceFile.ContentType,
			SizeBytes:      int64(len(rendered)),
			ChecksumSHA256: checksumSHA256(rendered),
			StorageDriver:  sourceFile.StorageDriver,
			Bucket:         sourceFile.Bucket,
			ObjectKey:      buildVariantObjectKey(job.ProjectID, sourceFile.ID, locale, sourceFile.Path),
			LastJobID:      job.ID,
			Status:         store.FileVariantStatusReady,
			CreatedAt:      p.clock(),
			UpdatedAt:      p.clock(),
		}

		if putErr := p.objectStore.PutObject(ctx, objectstore.PutRequest{
			Object: objectstore.ObjectRef{
				Driver: variant.StorageDriver,
				Bucket: variant.Bucket,
				Key:    variant.ObjectKey,
			},
			ContentType: variant.ContentType,
			Body:        rendered,
		}); putErr != nil {
			return "", nil, time.Time{}, retryableErrorf("upload locale %q artifact: %w", locale, putErr)
		}

		if err := p.repository.SaveFileVariant(ctx, variant); err != nil {
			return "", nil, time.Time{}, retryableErrorf("persist locale %q variant: %w", locale, err)
		}

		checkpoint.CompletedLocales[locale] = variant.ID
		if err := p.persistAnyCheckpoint(ctx, job, checkpoint, ""); err != nil {
			return "", nil, time.Time{}, retryableErrorf("persist file checkpoint after locale %q: %w", locale, err)
		}
	}

	translations := make([]*translationv1.FileTranslation, 0, len(input.GetTargetLocales()))
	for _, locale := range input.GetTargetLocales() {
		translations = append(translations, &translationv1.FileTranslation{
			FileId: sourceFile.ID,
			Locale: locale,
			Path:   sourceFile.Path,
		})
	}
	payload, err := translationapp.EncodeProto(&translationv1.FileTranslationJobResult{Translations: translations})
	if err != nil {
		return "", nil, time.Time{}, permanentErrorf("encode file result: %w", err)
	}
	return "file_result", payload, p.clock(), nil
}

func (p *Processor) translateFileEntries(
	ctx context.Context,
	projectID string,
	sourceEntries map[string]string,
	entryContext map[string]string,
	input *translationv1.FileTranslationJobInput,
	targetLocale string,
) (map[string]string, error) {
	keys := make([]string, 0, len(sourceEntries))
	for key := range sourceEntries {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	out := make(map[string]string, len(sourceEntries))
	glossaryTerms, err := p.repository.ListGlossaryTerms(ctx, store.GlossaryListParams{
		ProjectID:    projectID,
		SourceLocale: input.GetSourceLocale(),
		TargetLocale: targetLocale,
		Limit:        10000,
	})
	if err != nil {
		return nil, fmt.Errorf("load glossary terms for %s->%s: %w", input.GetSourceLocale(), targetLocale, err)
	}

	for _, key := range keys {
		metadata := cloneMetadata(input.GetMetadata())
		metadata["file_entry_key"] = key
		if contextValue := strings.TrimSpace(entryContext[key]); contextValue != "" {
			metadata["file_entry_context"] = contextValue
		}
		task := TranslationTask{
			ProjectID:    projectID,
			SourceText:   sourceEntries[key],
			SourceLocale: input.GetSourceLocale(),
			TargetLocale: targetLocale,
			Metadata:     metadata,
		}
		task.RuntimeContext = buildGlossaryRuntimeContextFromTerms(store.RankGlossaryTerms(glossaryTerms, task.SourceText, p.glossaryTopK))
		text, route, err := p.executor.Translate(ctx, task)
		if err != nil {
			return nil, fmt.Errorf("entry %q with route %s/%s: %w", key, route.Provider, route.Model, err)
		}
		out[key] = text
	}
	return out, nil
}

func decodeFileCheckpoint(payload []byte) (*fileCheckpoint, error) {
	checkpoint := &fileCheckpoint{CompletedLocales: map[string]string{}}
	if len(payload) == 0 {
		return checkpoint, nil
	}
	if err := json.Unmarshal(payload, checkpoint); err != nil {
		return nil, err
	}
	if checkpoint.CompletedLocales == nil {
		checkpoint.CompletedLocales = map[string]string{}
	}
	return checkpoint, nil
}

func (p *Processor) persistAnyCheckpoint(
	ctx context.Context,
	job *store.TranslationJobModel,
	checkpoint any,
	lastError string,
) error {
	payload, err := json.Marshal(checkpoint)
	if err != nil {
		return fmt.Errorf("marshal checkpoint: %w", err)
	}
	if err := p.repository.SaveRunningJobCheckpoint(ctx, job.ID, store.JobStatusRunning, payload, lastError); err != nil {
		return err
	}
	job.CheckpointPayload = payload
	job.LastError = lastError
	return nil
}

type fileFormatAdapter interface {
	Parse(filePath string, content []byte) (map[string]string, map[string]string, error)
	Render(filePath string, template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error)
}

func newFileFormatAdapter(format translationv1.FileTranslationJobInput_FileFormat) (fileFormatAdapter, error) {
	switch format {
	case translationv1.FileTranslationJobInput_FILE_FORMAT_JSON:
		return jsonFileAdapter{}, nil
	case translationv1.FileTranslationJobInput_FILE_FORMAT_XLIFF:
		return xliffFileAdapter{}, nil
	case translationv1.FileTranslationJobInput_FILE_FORMAT_PO:
		return poFileAdapter{}, nil
	case translationv1.FileTranslationJobInput_FILE_FORMAT_CSV:
		return csvFileAdapter{}, nil
	default:
		return nil, fmt.Errorf("unsupported file format %s", format.String())
	}
}

type jsonFileAdapter struct{}

func (jsonFileAdapter) Parse(_ string, content []byte) (map[string]string, map[string]string, error) {
	return (translationfileparser.JSONParser{}).ParseWithContext(content)
}

func (jsonFileAdapter) Render(_ string, template []byte, values map[string]string, _, _ string) ([]byte, error) {
	return translationfileparser.MarshalJSON(template, values)
}

type xliffFileAdapter struct{}

func (xliffFileAdapter) Parse(filePath string, content []byte) (map[string]string, map[string]string, error) {
	return translationfileparser.NewDefaultStrategy().ParseWithContext(filePath, content)
}

func (xliffFileAdapter) Render(_ string, template []byte, values map[string]string, sourceLocale, targetLocale string) ([]byte, error) {
	return translationfileparser.MarshalXLIFF(template, values, sourceLocale, targetLocale)
}

type poFileAdapter struct{}

func (poFileAdapter) Parse(filePath string, content []byte) (map[string]string, map[string]string, error) {
	return translationfileparser.NewDefaultStrategy().ParseWithContext(filePath, content)
}

func (poFileAdapter) Render(_ string, template []byte, values map[string]string, _, _ string) ([]byte, error) {
	return translationfileparser.MarshalPOFile(template, values)
}

type csvFileAdapter struct{}

func (csvFileAdapter) Parse(filePath string, content []byte) (map[string]string, map[string]string, error) {
	return translationfileparser.NewDefaultStrategy().ParseWithContext(filePath, content)
}

func (csvFileAdapter) Render(_ string, template []byte, values map[string]string, _, targetLocale string) ([]byte, error) {
	return translationfileparser.MarshalCSV(template, values, translationfileparser.CSVParser{ValueColumn: targetLocale})
}

func variantID(fileID, locale string) string {
	return fmt.Sprintf("%s:%s", fileID, locale)
}

func buildVariantObjectKey(projectID, fileID, locale, filePath string) string {
	return path.Join("projects", projectID, "variants", fileID, locale, filePath)
}

func checksumSHA256(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

func cloneMetadata(metadata map[string]string) map[string]string {
	if len(metadata) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(metadata))
	for key, value := range metadata {
		cloned[key] = value
	}
	return cloned
}

func fileFormatString(value translationv1.FileTranslationJobInput_FileFormat) string {
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
