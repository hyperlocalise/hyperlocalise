package translator

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func translateWithOpenAICompatibleClient(ctx context.Context, providerName string, req Request, opts ...option.RequestOption) (string, error) {
	client := newOpenAIClient(opts...)

	resp, err := client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.SystemMessage(req.SystemPrompt),
			openai.UserMessage(req.UserPrompt),
		},
		Model: openai.ChatModel(strings.TrimSpace(req.Model)),
	})
	if err != nil {
		return "", fmt.Errorf("%s generate text: %w", providerName, err)
	}

	output, err := responseText(resp)
	if err != nil {
		return "", fmt.Errorf("%s response: %w", providerName, err)
	}

	if usage, ok := usageFromGenerateTextResponse(resp); ok {
		SetUsage(ctx, usage)
	}

	return output, nil
}

func editImageWithOpenAICompatibleClient(ctx context.Context, providerName string, req ImageEditRequest, opts ...option.RequestOption) ([]byte, error) {
	client := newOpenAIClient(opts...)

	resp, err := client.Images.Edit(ctx, openai.ImageEditParams{
		Image: openai.ImageEditParamsImageUnion{
			OfFile: imageUploadReader(req.SourceImage, req.SourceFilename, req.SourceMIMEType),
		},
		Prompt:       req.Prompt,
		Model:        openai.ImageModel(strings.TrimSpace(req.Model)),
		N:            openai.Int(1),
		OutputFormat: openai.ImageEditParamsOutputFormat(strings.ToLower(strings.TrimSpace(req.OutputFormat))),
	})
	if err != nil {
		return nil, fmt.Errorf("%s edit image: %w", providerName, err)
	}
	if resp == nil || len(resp.Data) == 0 {
		return nil, fmt.Errorf("%s image response: no image returned", providerName)
	}
	encoded := strings.TrimSpace(resp.Data[0].B64JSON)
	if encoded == "" {
		return nil, fmt.Errorf("%s image response: empty base64 image", providerName)
	}
	content, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("%s image response: decode base64 image: %w", providerName, err)
	}
	if len(content) == 0 {
		return nil, fmt.Errorf("%s image response: empty decoded image", providerName)
	}

	if usage, ok := usageFromImagesResponse(resp); ok {
		SetUsage(ctx, usage)
	}

	return content, nil
}

type namedImageReader struct {
	*bytes.Reader
	filename    string
	contentType string
}

func imageUploadReader(content []byte, filename, contentType string) io.Reader {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		filename = "source-image"
	}
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return namedImageReader{
		Reader:      bytes.NewReader(content),
		filename:    filename,
		contentType: contentType,
	}
}

func (r namedImageReader) Filename() string {
	return r.filename
}

func (r namedImageReader) ContentType() string {
	return r.contentType
}

func usageFromGenerateTextResponse(resp *openai.ChatCompletion) (Usage, bool) {
	if resp == nil {
		return Usage{}, false
	}

	prompt := int(resp.Usage.PromptTokens)
	completion := int(resp.Usage.CompletionTokens)
	total := int(resp.Usage.TotalTokens)
	if total == 0 && (prompt != 0 || completion != 0) {
		total = prompt + completion
	}
	if prompt == 0 && completion == 0 && total == 0 {
		return Usage{}, false
	}

	return Usage{PromptTokens: prompt, CompletionTokens: completion, TotalTokens: total}, true
}

func usageFromImagesResponse(resp *openai.ImagesResponse) (Usage, bool) {
	if resp == nil {
		return Usage{}, false
	}
	prompt := int(resp.Usage.InputTokens)
	completion := int(resp.Usage.OutputTokens)
	total := int(resp.Usage.TotalTokens)
	if total == 0 && (prompt != 0 || completion != 0) {
		total = prompt + completion
	}
	if prompt == 0 && completion == 0 && total == 0 {
		return Usage{}, false
	}
	return Usage{PromptTokens: prompt, CompletionTokens: completion, TotalTokens: total}, true
}
