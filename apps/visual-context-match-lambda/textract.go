package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/textract"
	textracttypes "github.com/aws/aws-sdk-go-v2/service/textract/types"
	"github.com/aws/smithy-go"
)

type textDetector interface {
	DetectLines(ctx context.Context, image []byte) ([]ocrLine, error)
}

type textractAPI interface {
	DetectDocumentText(ctx context.Context, input *textract.DetectDocumentTextInput, optFns ...func(*textract.Options)) (*textract.DetectDocumentTextOutput, error)
}

type textractDetector struct {
	client textractAPI
}

var permanentTextractErrorCodes = map[string]bool{
	"InvalidParameterException":    true,
	"UnsupportedDocumentException": true,
	"BadDocumentException":         true,
	"DocumentTooLargeException":    true,
}

func (d textractDetector) DetectLines(ctx context.Context, image []byte) ([]ocrLine, error) {
	output, err := d.client.DetectDocumentText(ctx, &textract.DetectDocumentTextInput{
		Document: &textracttypes.Document{Bytes: image},
	})
	if err != nil {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && permanentTextractErrorCodes[apiErr.ErrorCode()] {
			return nil, fmt.Errorf("%w: %s", errUnsupportedImage, apiErr.ErrorCode())
		}
		return nil, fmt.Errorf("detect document text: %w", err)
	}
	lines := make([]ocrLine, 0, len(output.Blocks))
	for _, block := range output.Blocks {
		if block.BlockType != textracttypes.BlockTypeLine || block.Geometry == nil || block.Geometry.BoundingBox == nil {
			continue
		}
		box := block.Geometry.BoundingBox
		lines = append(lines, ocrLine{
			Text:       aws.ToString(block.Text),
			Confidence: float64(aws.ToFloat32(block.Confidence)),
			Box: ocrBox{
				Left:   float64(box.Left),
				Top:    float64(box.Top),
				Width:  float64(box.Width),
				Height: float64(box.Height),
			},
		})
	}
	return lines, nil
}
