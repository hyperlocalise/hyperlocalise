package main

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"

	"golang.org/x/image/webp"
)

// textractMaxBytes is Textract's synchronous DetectDocumentText byte limit.
const (
	textractMaxBytes    = 10 * 1024 * 1024
	fallbackJPEGQuality = 85
)

var errUnsupportedImage = errors.New("unsupported visual context image")

// prepareTextractImage returns PNG or JPEG bytes within Textract's limits.
// Textract does not accept WebP, so WebP screenshots are re-encoded.
func prepareTextractImage(data []byte, contentType string) ([]byte, error) {
	switch contentType {
	case "image/png", "image/jpeg":
		if len(data) > textractMaxBytes {
			return nil, errUnsupportedImage
		}
		return data, nil
	case "image/webp":
		decoded, err := webp.Decode(bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("%w: %v", errUnsupportedImage, err)
		}
		return encodeForTextract(decoded)
	default:
		return nil, errUnsupportedImage
	}
}

func encodeForTextract(img image.Image) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&buffer, img); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	if buffer.Len() <= textractMaxBytes {
		return buffer.Bytes(), nil
	}
	buffer.Reset()
	if err := jpeg.Encode(&buffer, img, &jpeg.Options{Quality: fallbackJPEGQuality}); err != nil {
		return nil, fmt.Errorf("encode jpeg: %w", err)
	}
	if buffer.Len() > textractMaxBytes {
		return nil, errUnsupportedImage
	}
	return buffer.Bytes(), nil
}
