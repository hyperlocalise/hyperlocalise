package runsvc

import (
	"bytes"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"mime"
	"path/filepath"
	"strings"

	"github.com/HugoSmits86/nativewebp"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
)

const (
	taskKindText          = ""
	taskKindImage         = "image"
	imageEntryKey         = "__image__"
	imagePromptVersion    = "image-localize-v1"
	imageCheckpointPrefix = "sha512:"
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

func convertCopiedImage(content []byte, outputFormat string) ([]byte, error) {
	format := strings.ToLower(strings.TrimSpace(outputFormat))
	if format == "jpg" {
		format = "jpeg"
	}
	if format == "" {
		return append([]byte(nil), content...), nil
	}
	if len(content) == 0 {
		return nil, fmt.Errorf("empty image content")
	}
	if detected := detectImageFormat(content); detected == format {
		return append([]byte(nil), content...), nil
	}

	img, _, err := image.Decode(bytes.NewReader(content))
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}
	var buf bytes.Buffer
	switch format {
	case "png":
		err = png.Encode(&buf, img)
	case "jpeg":
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90})
	case "webp":
		err = nativewebp.Encode(&buf, img, nil)
	default:
		return nil, fmt.Errorf("unsupported image output format %q", outputFormat)
	}
	if err != nil {
		return nil, fmt.Errorf("encode image as %s: %w", format, err)
	}
	if buf.Len() == 0 {
		return nil, fmt.Errorf("encode image as %s: empty output", format)
	}
	return buf.Bytes(), nil
}

func detectImageFormat(content []byte) string {
	_, format, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil {
		return ""
	}
	if format == "jpg" {
		return "jpeg"
	}
	return format
}

func imageSourceFingerprint(content []byte) string {
	sum := sha512.Sum512(content)
	// Bolt: Use hex.EncodeToString instead of fmt.Sprintf("%x") to avoid reflection/formatting overhead
	return hex.EncodeToString(sum[:])
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
	return imageCheckpointPrefix + imageSourceFingerprint(content)
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

func isImageCheckpointHash(value string) bool {
	return strings.HasPrefix(strings.TrimSpace(value), imageCheckpointPrefix)
}

func readImageCheckpointContent(value, targetPath string, readFile func(string) ([]byte, error)) ([]byte, error) {
	value = strings.TrimSpace(value)
	if !isImageCheckpointHash(value) {
		return decodeImageCheckpoint(value)
	}
	if readFile == nil {
		return nil, fmt.Errorf("read image checkpoint %q: no file reader configured", targetPath)
	}
	content, err := readFile(targetPath)
	if err != nil {
		return nil, fmt.Errorf("read image checkpoint %q: %w", targetPath, err)
	}
	if len(content) == 0 {
		return nil, fmt.Errorf("read image checkpoint %q: empty image content", targetPath)
	}
	if got := imageCheckpointPrefix + imageSourceFingerprint(content); got != value {
		return nil, fmt.Errorf("read image checkpoint %q: content hash mismatch", targetPath)
	}
	return content, nil
}
