package runsvc

import (
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"mime"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
)

const (
	taskKindText       = ""
	taskKindImage      = "image"
	imageEntryKey      = "__image__"
	imagePromptVersion = "image-localize-v1"
)

func isImageTask(task Task) bool {
	return task.Kind == taskKindImage
}

func isSupportedImagePath(path string) bool {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".png", ".jpg", ".jpeg", ".webp":
		return true
	default:
		return false
	}
}

func imageOutputFormat(path string) (string, error) {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".png":
		return "png", nil
	case ".jpg", ".jpeg":
		return "jpeg", nil
	case ".webp":
		return "webp", nil
	default:
		return "", fmt.Errorf("unsupported image target extension %q for %q", filepath.Ext(path), path)
	}
}

func imageSourceFingerprint(content []byte) string {
	sum := sha512.Sum512(content)
	return fmt.Sprintf("%x", sum[:])
}

func imageLockSourceHash(content []byte) string {
	return lockStoredFingerprint(imageSourceFingerprint(content))
}

func imageEditPrompt(targetLocale string) string {
	return strings.TrimSpace(fmt.Sprintf(
		"Localize the visible text in this image into %s. Preserve the original layout, composition, branding, colors, typography style, aspect ratio, and all non-text visual elements. Only change text that should be localized for the target language. Return the finished localized image with no explanations.",
		strings.TrimSpace(targetLocale),
	))
}

func buildImageEditRequest(task Task, sourceImage []byte) translator.ImageEditRequest {
	return translator.ImageEditRequest{
		SourceImage:    sourceImage,
		TargetLanguage: task.TargetLocale,
		ModelProvider:  task.Provider,
		Model:          task.Model,
		Prompt:         imageEditPrompt(task.TargetLocale),
		OutputFormat:   task.OutputFormat,
		SourceFilename: filepath.Base(task.SourcePath),
		SourceMIMEType: mime.TypeByExtension(filepath.Ext(task.SourcePath)),
	}
}

func encodeImageCheckpoint(content []byte) string {
	return base64.StdEncoding.EncodeToString(content)
}

func decodeImageCheckpoint(value string) ([]byte, error) {
	content, err := base64.StdEncoding.DecodeString(strings.TrimSpace(value))
	if err != nil {
		return nil, fmt.Errorf("decode image checkpoint: %w", err)
	}
	if len(content) == 0 {
		return nil, fmt.Errorf("decode image checkpoint: empty image content")
	}
	return content, nil
}
