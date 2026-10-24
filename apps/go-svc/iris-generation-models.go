package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

type irisModelKind string

const (
	irisKindImage irisModelKind = "image"
	irisKindVideo irisModelKind = "video"
	irisKindVoice irisModelKind = "voice"
	irisKindAudio irisModelKind = "audio"
	irisKindTool  irisModelKind = "tool"
)

type irisModelInfo struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Pricing     irisPricing   `json:"pricing"`
	Kind        irisModelKind `json:"-"`
	GatewayID   string        `json:"-"`
	ETASeconds  int           `json:"-"`
	PromptMax   int           `json:"-"`
	RequiresRef bool          `json:"-"`
}

type irisPricing struct {
	Unit    string   `json:"unit"`
	Credits float64  `json:"credits"`
	Minimum *float64 `json:"minimum,omitempty"`
}

type irisEstimate struct {
	Allowed    bool     `json:"allowed"`
	Remaining  *float64 `json:"remaining,omitempty"`
	Unlimited  bool     `json:"unlimited"`
	FeatureID  string   `json:"featureId"`
	ETASeconds int      `json:"etaSeconds"`
}

type irisAssetRef struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
	URL  string `json:"url,omitempty"`
}

type irisGenerateRequest map[string]any

func irisModels() []irisModelInfo {
	min1 := 1.0
	return []irisModelInfo{
		{ID: "nano-banana-2.1", Name: "Nano Banana 2.1", Kind: irisKindImage, GatewayID: "google/gemini-3-pro-image", Pricing: irisPricing{Unit: "image", Credits: 4, Minimum: &min1}, ETASeconds: 20, PromptMax: 32000},
		{ID: "nano-banana-pro", Name: "Nano Banana Pro", Kind: irisKindImage, GatewayID: "google/gemini-3-pro-image", Pricing: irisPricing{Unit: "image", Credits: 6, Minimum: &min1}, ETASeconds: 25, PromptMax: 32000},
		{ID: "gpt-image-2.5-sunburst", Name: "GPT Image 2.5 Sunburst", Kind: irisKindImage, GatewayID: "openai/gpt-image-2.5-flare", Pricing: irisPricing{Unit: "image", Credits: 8, Minimum: &min1}, ETASeconds: 30, PromptMax: 32000},
		{ID: "nano-banana-2", Name: "Nano Banana 2", Kind: irisKindImage, GatewayID: "google/gemini-3-pro-image", Pricing: irisPricing{Unit: "image", Credits: 3, Minimum: &min1}, ETASeconds: 18, PromptMax: 32000},
		{ID: "seedream-5.0-pro", Name: "Seedream 5.0 Pro", Kind: irisKindImage, GatewayID: "bytedance/seedream-4.5", Pricing: irisPricing{Unit: "image", Credits: 5, Minimum: &min1}, ETASeconds: 22, PromptMax: 32000},
		{ID: "flux-3-image", Name: "FLUX.3 Image", Kind: irisKindImage, GatewayID: "black-forest-labs/flux-2-pro", Pricing: irisPricing{Unit: "image", Credits: 6, Minimum: &min1}, ETASeconds: 24, PromptMax: 32000},
		{ID: "flux-2-pro", Name: "FLUX.2 Pro", Kind: irisKindImage, GatewayID: "black-forest-labs/flux-2-pro", Pricing: irisPricing{Unit: "image", Credits: 5, Minimum: &min1}, ETASeconds: 20, PromptMax: 32000},
		{ID: "grok-imagine-image-2.0", Name: "Grok Imagine 2.0", Kind: irisKindImage, GatewayID: "xai/grok-imagine-image", Pricing: irisPricing{Unit: "image", Credits: 3, Minimum: &min1}, ETASeconds: 16, PromptMax: 32000},
		{ID: "flux-2-klein", Name: "FLUX.2 Klein", Kind: irisKindImage, GatewayID: "black-forest-labs/flux-2-klein", Pricing: irisPricing{Unit: "image", Credits: 1, Minimum: &min1}, ETASeconds: 12, PromptMax: 32000},
		{ID: "krea-2-large", Name: "Krea 2 Large", Kind: irisKindImage, GatewayID: "krea/krea-2", Pricing: irisPricing{Unit: "image", Credits: 4, Minimum: &min1}, ETASeconds: 18, PromptMax: 32000},
		{ID: "veo-3.1", Name: "Veo 3.1", Kind: irisKindVideo, GatewayID: "google/veo-3.1", Pricing: irisPricing{Unit: "second", Credits: 8, Minimum: &min1}, ETASeconds: 90, PromptMax: 4000},
		{ID: "veo-3.1-fast", Name: "Veo 3.1 Fast", Kind: irisKindVideo, GatewayID: "google/veo-3.1-fast", Pricing: irisPricing{Unit: "second", Credits: 4, Minimum: &min1}, ETASeconds: 60, PromptMax: 4000},
		{ID: "kling-3-pro", Name: "Kling 3.0", Kind: irisKindVideo, GatewayID: "kuaishou/kling-v3", Pricing: irisPricing{Unit: "second", Credits: 5, Minimum: &min1}, ETASeconds: 80, PromptMax: 4000},
		{ID: "kling-o3-pro", Name: "Kling 3.0 Omni", Kind: irisKindVideo, GatewayID: "kuaishou/kling-v3", Pricing: irisPricing{Unit: "second", Credits: 6, Minimum: &min1}, ETASeconds: 90, PromptMax: 4000},
		{ID: "seedance-2.5", Name: "Seedance 2.5", Kind: irisKindVideo, GatewayID: "bytedance/seedance-2.5", Pricing: irisPricing{Unit: "second", Credits: 3, Minimum: &min1}, ETASeconds: 70, PromptMax: 4000},
		{ID: "wan-3.0", Name: "Wan 3.0", Kind: irisKindVideo, GatewayID: "alibaba/wan-2.6", Pricing: irisPricing{Unit: "second", Credits: 3, Minimum: &min1}, ETASeconds: 75, PromptMax: 4000},
		{ID: "minimax-h3", Name: "MiniMax H3", Kind: irisKindVideo, GatewayID: "minimax/hailuo-2.3", Pricing: irisPricing{Unit: "second", Credits: 5, Minimum: &min1}, ETASeconds: 80, PromptMax: 4000},
		{ID: "minimax-h3-max", Name: "MiniMax H3 Max", Kind: irisKindVideo, GatewayID: "minimax/hailuo-2.3", Pricing: irisPricing{Unit: "second", Credits: 3, Minimum: &min1}, ETASeconds: 55, PromptMax: 4000},
		{ID: "flux-3-video", Name: "FLUX.3 Video", Kind: irisKindVideo, GatewayID: "black-forest-labs/flux-2-pro", Pricing: irisPricing{Unit: "second", Credits: 4, Minimum: &min1}, ETASeconds: 70, PromptMax: 4000},
		{ID: "grok-imagine-video-1.5", Name: "Grok Imagine Video 1.5", Kind: irisKindVideo, GatewayID: "xai/grok-imagine-video", Pricing: irisPricing{Unit: "second", Credits: 2, Minimum: &min1}, ETASeconds: 50, PromptMax: 4000},
		{ID: "elevenlabs-v4", Name: "ElevenLabs v4", Kind: irisKindVoice, GatewayID: "elevenlabs/eleven-v3", Pricing: irisPricing{Unit: "input-minute", Credits: 6, Minimum: &min1}, ETASeconds: 15, PromptMax: 10000},
		{ID: "elevenlabs-v3", Name: "ElevenLabs v3", Kind: irisKindVoice, GatewayID: "elevenlabs/eleven-multilingual-v2", Pricing: irisPricing{Unit: "input-minute", Credits: 4, Minimum: &min1}, ETASeconds: 12, PromptMax: 5000},
		{ID: "gemini-3.8-flash-tts", Name: "Gemini 3.8 Flash TTS", Kind: irisKindVoice, GatewayID: "google/gemini-2.5-flash-preview-tts", Pricing: irisPricing{Unit: "input-minute", Credits: 2, Minimum: &min1}, ETASeconds: 10, PromptMax: 10000},
		{ID: "elevenlabs-music", Name: "ElevenLabs Music", Kind: irisKindAudio, GatewayID: "elevenlabs/music-v1", Pricing: irisPricing{Unit: "second", Credits: 1, Minimum: &min1}, ETASeconds: 40, PromptMax: 4100},
		{ID: "elevenlabs-sfx", Name: "ElevenLabs SFX", Kind: irisKindAudio, GatewayID: "elevenlabs/sound-effects-v2", Pricing: irisPricing{Unit: "second", Credits: 1, Minimum: &min1}, ETASeconds: 20, PromptMax: 4100},
		{ID: "bria-rmbg-2.0", Name: "Bria RMBG 2.0", Kind: irisKindTool, GatewayID: "bria/rmbg-2.0", Pricing: irisPricing{Unit: "flat", Credits: 2, Minimum: &min1}, ETASeconds: 15, RequiresRef: true},
		{ID: "seedvr-2", Name: "SeedVR 2", Kind: irisKindTool, GatewayID: "bytedance/seedvr2", Pricing: irisPricing{Unit: "flat", Credits: 3, Minimum: &min1}, ETASeconds: 20, RequiresRef: true},
		{ID: "bytedance-upscaler", Name: "ByteDance Upscaler", Kind: irisKindTool, GatewayID: "bytedance/seedance-2.5", Pricing: irisPricing{Unit: "flat", Credits: 8, Minimum: &min1}, ETASeconds: 60, RequiresRef: true},
		{ID: "universal-3.5-pro", Name: "Universal 3.5 Pro", Kind: irisKindTool, GatewayID: "google/gemini-3.5-transcribe", Pricing: irisPricing{Unit: "input-minute", Credits: 3, Minimum: &min1}, ETASeconds: 25, RequiresRef: true},
		{ID: "qwen3.8-omni-flash", Name: "Qwen 3.8 Omni Flash", Kind: irisKindTool, GatewayID: "alibaba/qwen3-omni-flash", Pricing: irisPricing{Unit: "input-minute", Credits: 2, Minimum: &min1}, ETASeconds: 20, RequiresRef: true},
	}
}

func irisModelByID(id string) (irisModelInfo, bool) {
	for _, model := range irisModels() {
		if model.ID == id {
			return model, true
		}
	}
	return irisModelInfo{}, false
}

func irisPublicModels() []map[string]any {
	out := make([]map[string]any, 0, len(irisModels()))
	for _, model := range irisModels() {
		item := map[string]any{"id": model.ID, "name": model.Name, "pricing": model.Pricing}
		out = append(out, item)
	}
	return out
}

func (req irisGenerateRequest) modelID() string {
	id, _ := req["model"].(string)
	return strings.TrimSpace(id)
}

func (req irisGenerateRequest) prompt() string {
	prompt, _ := req["prompt"].(string)
	return strings.TrimSpace(prompt)
}

func (req irisGenerateRequest) voice() string {
	voice, _ := req["voice"].(string)
	return strings.TrimSpace(voice)
}

func (req irisGenerateRequest) languageCode() string {
	code, _ := req["languageCode"].(string)
	return strings.TrimSpace(code)
}

func (req irisGenerateRequest) count() int {
	switch value := req["count"].(type) {
	case float64:
		return int(value)
	case int:
		return value
	case json.Number:
		n, _ := value.Int64()
		return int(n)
	default:
		return 1
	}
}

func (req irisGenerateRequest) duration() float64 {
	switch value := req["duration"].(type) {
	case float64:
		return value
	case int:
		return float64(value)
	case json.Number:
		n, _ := value.Float64()
		return n
	default:
		return 0
	}
}

func (req irisGenerateRequest) stringField(name string) string {
	value, _ := req[name].(string)
	return strings.TrimSpace(value)
}

func decodeAssetRef(value any) (irisAssetRef, bool) {
	raw, ok := value.(map[string]any)
	if !ok {
		return irisAssetRef{}, false
	}
	ref := irisAssetRef{Kind: strings.TrimSpace(stringFrom(raw["kind"]))}
	if ref.Kind != "asset" {
		return irisAssetRef{}, false
	}
	ref.ID = strings.ToLower(strings.TrimSpace(stringFrom(raw["id"])))
	return ref, isSHA256(ref.ID)
}

func (req irisGenerateRequest) asset(name string) (irisAssetRef, bool) {
	return decodeAssetRef(req[name])
}

func (req irisGenerateRequest) assets(name string) []irisAssetRef {
	raw, ok := req[name].([]any)
	if !ok {
		return nil
	}
	refs := make([]irisAssetRef, 0, len(raw))
	for _, item := range raw {
		ref, ok := decodeAssetRef(item)
		if ok {
			refs = append(refs, ref)
		}
	}
	return refs
}

func validateIrisGenerateRequest(req irisGenerateRequest) (irisModelInfo, error) {
	if err := rejectRemoteAssetURLs(req); err != nil {
		return irisModelInfo{}, err
	}
	model, ok := irisModelByID(req.modelID())
	if !ok {
		return irisModelInfo{}, fmt.Errorf("unknown model")
	}
	switch model.Kind {
	case irisKindImage, irisKindVideo, irisKindVoice, irisKindAudio:
		prompt := req.prompt()
		if prompt == "" {
			return model, fmt.Errorf("prompt is required")
		}
		if model.PromptMax > 0 && len([]rune(prompt)) > model.PromptMax {
			return model, fmt.Errorf("prompt is too long")
		}
	}
	if model.Kind == irisKindVoice && req.voice() == "" {
		return model, fmt.Errorf("voice is required")
	}
	switch model.ID {
	case "bria-rmbg-2.0", "seedvr-2":
		if _, ok := req.asset("image"); !ok {
			return model, fmt.Errorf("image is required")
		}
	case "bytedance-upscaler":
		if _, ok := req.asset("video"); !ok {
			return model, fmt.Errorf("video is required")
		}
	case "universal-3.5-pro":
		if _, ok := req.asset("audio"); !ok {
			if scene, _ := req["audio"].(map[string]any); stringFrom(scene["scene"]) == "" {
				return model, fmt.Errorf("audio is required")
			}
		}
	case "qwen3.8-omni-flash":
		if _, ok := req.asset("media"); !ok {
			return model, fmt.Errorf("media is required")
		}
	}
	return model, nil
}

func estimateIrisRequest(req irisGenerateRequest) (irisEstimate, irisModelInfo, error) {
	model, err := validateIrisGenerateRequest(req)
	if err != nil {
		return irisEstimate{}, model, err
	}
	return irisEstimate{Allowed: true, FeatureID: "ai_tokens", ETASeconds: model.ETASeconds}, model, nil
}

func rejectRemoteAssetURLs(req irisGenerateRequest) error {
	fields := []string{"image", "video", "audio", "media", "startFrame", "endFrame"}
	for _, field := range fields {
		if assetKind(req[field]) == "url" {
			return fmt.Errorf("remote asset URLs are not supported; upload the file first")
		}
	}
	raw, ok := req["images"].([]any)
	if !ok {
		return nil
	}
	for _, item := range raw {
		if assetKind(item) == "url" {
			return fmt.Errorf("remote asset URLs are not supported; upload the file first")
		}
	}
	return nil
}

func assetKind(value any) string {
	raw, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	return strings.TrimSpace(stringFrom(raw["kind"]))
}

func stringFrom(value any) string {
	text, _ := value.(string)
	return text
}

func isSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, r := range value {
		isDigit := r >= '0' && r <= '9'
		isHex := r >= 'a' && r <= 'f'
		if !isDigit && !isHex {
			return false
		}
	}
	return true
}
