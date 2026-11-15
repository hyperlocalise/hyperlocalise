package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// isIrisChatImageModel reports whether a Gateway image model is a language
// model that answers with images (Gemini "Nano Banana"). AI Gateway rejects
// those on /images/* with ModelTypeMismatchError; they only run through chat
// completions with the image output modality.
func isIrisChatImageModel(gatewayID string) bool {
	return strings.HasPrefix(strings.TrimSpace(gatewayID), "google/gemini-")
}

// chatImage generates or edits images with a chat-completions image model.
// The chat API returns one image per call, so a count above one runs that
// many completions. Reference images and the mask go in as image parts of
// the user message.
func (p *irisGatewayProvider) chatImage(ctx context.Context, req irisProviderRequest, refs []irisProviderInput, count int) ([]irisProviderOutput, error) {
	content := []map[string]any{{"type": "text", "text": req.Prompt}}
	for _, ref := range refs {
		content = append(content, irisImageContentPart(ref))
	}
	if mask, ok := firstInput(req.Inputs, "mask"); ok {
		content = append(content,
			map[string]any{"type": "text", "text": "The next image is a mask. Only change the area where the mask is transparent; keep the rest of the image exactly as it is."},
			irisImageContentPart(mask),
		)
	}
	payload := map[string]any{
		"model":      p.modelID(req.Model.GatewayID),
		"messages":   []map[string]any{{"role": "user", "content": content}},
		"modalities": []string{"text", "image"},
	}
	if config := irisGeminiImageConfig(req.AspectRatio, req.Resolution); len(config) > 0 {
		payload["providerOptions"] = map[string]any{"google": map[string]any{"imageConfig": config}}
	}

	count = clampIrisImageCount(count)
	images := make([][]byte, 0, count)
	for range count {
		body, err := p.json(ctx, http.MethodPost, "/chat/completions", payload)
		if err != nil {
			return nil, err
		}
		raw, err := decodeChatImage(ctx, body)
		if err != nil {
			return nil, err
		}
		images = append(images, raw)
	}

	out := make([]irisProviderOutput, 0, len(images))
	for i, raw := range images {
		name := "image.png"
		if len(images) > 1 {
			name = fmt.Sprintf("image-%d.png", i+1)
		}
		contentType := http.DetectContentType(raw)
		if !strings.HasPrefix(contentType, "image/") {
			contentType = "image/png"
		}
		out = append(out, irisProviderOutput{Bytes: raw, Filename: name, ContentType: contentType})
	}
	return out, nil
}

func irisImageContentPart(image irisProviderInput) map[string]any {
	contentType, _ := irisImageFormMIME(image)
	return map[string]any{
		"type":      "image_url",
		"image_url": map[string]string{"url": "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(image.Bytes)},
	}
}

// irisGeminiImageConfig maps the request's ratio and resolution onto
// Gemini's imageConfig. Unknown values are left for the model to choose.
func irisGeminiImageConfig(aspect, resolution string) map[string]string {
	config := map[string]string{}
	switch aspect {
	case "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9":
		config["aspectRatio"] = aspect
	}
	switch strings.ToUpper(strings.TrimSpace(resolution)) {
	case "1K":
		config["imageSize"] = "1K"
	case "2K":
		config["imageSize"] = "2K"
	case "4K":
		config["imageSize"] = "4K"
	}
	return config
}

// decodeChatImage reads the first image of a chat completion. Gateway puts
// generated images on message.images as data URLs.
func decodeChatImage(ctx context.Context, body []byte) ([]byte, error) {
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
				Images  []struct {
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
				} `json:"images"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	for _, choice := range parsed.Choices {
		for _, image := range choice.Message.Images {
			url := strings.TrimSpace(image.ImageURL.URL)
			if url == "" {
				continue
			}
			if rest, ok := strings.CutPrefix(url, "data:"); ok {
				_, data, found := strings.Cut(rest, ";base64,")
				if !found {
					return nil, fmt.Errorf("gateway returned an image data URL that is not base64")
				}
				return base64.StdEncoding.DecodeString(data)
			}
			raw, _, err := fetchHTTPS(ctx, url)
			return raw, err
		}
	}
	if len(parsed.Choices) > 0 {
		if text := strings.TrimSpace(parsed.Choices[0].Message.Content); text != "" {
			return nil, fmt.Errorf("gateway returned no image: %s", truncate(text, 200))
		}
	}
	return nil, fmt.Errorf("gateway returned no images")
}
