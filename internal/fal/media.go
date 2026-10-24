package fal

import (
	"encoding/json"
	"strings"
)

var mediaURLKeys = map[string]struct{}{
	"url":          {},
	"image_url":    {},
	"video_url":    {},
	"audio_url":    {},
	"file_url":     {},
	"output_url":   {},
	"download_url": {},
}

// MediaURLs extracts https media URLs from a fal result payload.
func MediaURLs(raw json.RawMessage) []string {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil
	}
	seen := map[string]struct{}{}
	var out []string
	collectMediaURLs(value, seen, &out)
	return out
}

func collectMediaURLs(value any, seen map[string]struct{}, out *[]string) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if _, ok := mediaURLKeys[strings.ToLower(key)]; ok {
				if text, _ := child.(string); isHTTPSURL(text) {
					if _, exists := seen[text]; !exists {
						seen[text] = struct{}{}
						*out = append(*out, text)
					}
					continue
				}
			}
			collectMediaURLs(child, seen, out)
		}
	case []any:
		for _, child := range typed {
			collectMediaURLs(child, seen, out)
		}
	}
}

func isHTTPSURL(value string) bool {
	trimmed := strings.TrimSpace(value)
	return strings.HasPrefix(trimmed, "https://")
}
