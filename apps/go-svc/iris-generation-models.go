package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/elevenlabs"
)

const (
	// defaultIrisListenModel is the documented Gemini audio file-part path.
	defaultIrisListenModel = "google/gemini-3.8-flash"
	// defaultIrisListenBackupModel is tagged audio-input on AI Gateway.
	defaultIrisListenBackupModel = "xiaomi/mimo-v2.6-pro"
)

type irisModelKind string

const (
	irisKindImage irisModelKind = "image"
	irisKindVideo irisModelKind = "video"
	irisKindVoice irisModelKind = "voice"
	irisKindAudio irisModelKind = "audio"
	irisKindTool  irisModelKind = "tool"
)

type irisModelProvider string

const (
	irisProviderGateway    irisModelProvider = ""
	irisProviderElevenLabs irisModelProvider = "elevenlabs"
	irisProviderFal        irisModelProvider = "fal"
)

type irisModelInfo struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Kind       irisModelKind     `json:"-"`
	Provider   irisModelProvider `json:"-"`
	GatewayID  string            `json:"-"`
	NativeID   string            `json:"-"`
	FalRefID   string            `json:"-"`
	FalVideoID string            `json:"-"`
	// FalReferencesID is the endpoint a video's `images` go to as
	// references (`@Image1`…), keeping the people, set and look they show,
	// rather than as the frame FalRefID starts on.
	FalReferencesID string `json:"-"`
	// MaxReferences bounds `images` on a FalReferencesID model.
	MaxReferences int `json:"-"`
	// ReferencesReplaceFrames: FalReferencesID takes no start or end frame.
	ReferencesReplaceFrames bool `json:"-"`
	ETASeconds              int  `json:"-"`
	PromptMax               int  `json:"-"`
	RequiresRef             bool `json:"-"`
}

type irisEstimate struct {
	Allowed    bool     `json:"allowed"`
	Remaining  *float64 `json:"remaining,omitempty"`
	Unlimited  bool     `json:"unlimited"`
	FeatureID  string   `json:"featureId"`
	Unit       string   `json:"unit"`
	ETASeconds int      `json:"etaSeconds"`
}

type irisAssetRef struct {
	Kind string `json:"kind"`
	ID   string `json:"id,omitempty"`
	URL  string `json:"url,omitempty"`
}

type irisGenerateRequest map[string]any

// Image ids follow Artificial Analysis AA-Image-T2I among models we already
// ship. GPT Image 2.6 Sunburst is first; we do not add 2.5, Flare, Kling
// Image, MAI, or Canva Craft until they are in the generate catalog.
func irisModels() []irisModelInfo {
	return []irisModelInfo{
		{ID: "gpt-image-2.6-sunburst", Name: "GPT Image 2.6 Sunburst", Kind: irisKindImage, GatewayID: "openai/gpt-image-2.6-sunburst", ETASeconds: 30, PromptMax: 32000},
		{ID: "nano-banana-2.1", Name: "Nano Banana 2.1", Kind: irisKindImage, GatewayID: "google/gemini-nano-banana-2.1", ETASeconds: 20, PromptMax: 32000},
		{ID: "grok-imagine-image-2.0", Name: "Grok Imagine 2.0", Kind: irisKindImage, GatewayID: "spacexai/grok-imagine-image-2.0", ETASeconds: 16, PromptMax: 32000},
		{ID: "nano-banana-2", Name: "Nano Banana 2", Kind: irisKindImage, GatewayID: "google/gemini-3.1-flash-image", ETASeconds: 18, PromptMax: 32000},
		{ID: "nano-banana-pro", Name: "Nano Banana Pro", Kind: irisKindImage, GatewayID: "google/gemini-3-pro-image", ETASeconds: 25, PromptMax: 32000},
		{ID: "seedream-5.0-pro", Name: "Seedream 5.0 Pro", Kind: irisKindImage, Provider: irisProviderFal, GatewayID: "bytedance/seedream-4.5", NativeID: "fal-ai/bytedance/seedream/v4.5/text-to-image", FalRefID: "fal-ai/bytedance/seedream/v4.5/edit", ETASeconds: 22, PromptMax: 32000},
		{ID: "flux-3-image", Name: "FLUX.3 Image", Kind: irisKindImage, Provider: irisProviderFal, GatewayID: "black-forest-labs/flux-2-pro", NativeID: "fal-ai/flux-2-pro", ETASeconds: 24, PromptMax: 32000},
		{ID: "flux-2-pro", Name: "FLUX.2 Pro", Kind: irisKindImage, Provider: irisProviderFal, GatewayID: "black-forest-labs/flux-2-pro", NativeID: "fal-ai/flux-2-pro", ETASeconds: 20, PromptMax: 32000},
		{ID: "krea-2-large", Name: "Krea 2 Large", Kind: irisKindImage, Provider: irisProviderFal, GatewayID: "krea/krea-2", NativeID: "fal-ai/krea-2", ETASeconds: 18, PromptMax: 32000},
		{ID: "flux-2-klein", Name: "FLUX.2 Klein", Kind: irisKindImage, Provider: irisProviderFal, GatewayID: "black-forest-labs/flux-2-klein", NativeID: "fal-ai/flux/schnell", ETASeconds: 12, PromptMax: 32000},
		{ID: "veo-3.1", Name: "Veo 3.1", Kind: irisKindVideo, GatewayID: "google/veo-3.1-generate-001", ETASeconds: 90, PromptMax: 4000},
		{ID: "veo-3.1-fast", Name: "Veo 3.1 Fast", Kind: irisKindVideo, GatewayID: "google/veo-3.1-fast-generate-001", ETASeconds: 60, PromptMax: 4000},
		{ID: "kling-3-pro", Name: "Kling 3.0", Kind: irisKindVideo, Provider: irisProviderFal, GatewayID: "kuaishou/kling-v3", NativeID: "fal-ai/kling-video/v3/pro/text-to-video", FalRefID: "fal-ai/kling-video/v3/pro/image-to-video", ETASeconds: 80, PromptMax: 4000},
		{ID: "kling-o3-pro", Name: "Kling 3.0 Omni", Kind: irisKindVideo, Provider: irisProviderFal, GatewayID: "kuaishou/kling-v3", NativeID: "fal-ai/kling-video/o3/pro/text-to-video", FalRefID: "fal-ai/kling-video/o3/pro/image-to-video", FalVideoID: "fal-ai/kling-video/o3/pro/video-to-video/edit", FalReferencesID: "fal-ai/kling-video/o3/pro/reference-to-video", MaxReferences: 4, ETASeconds: 90, PromptMax: 4000},
		{ID: "seedance-2.5", Name: "Seedance 2.5", Kind: irisKindVideo, Provider: irisProviderFal, GatewayID: "bytedance/seedance-2.5", NativeID: "bytedance/seedance-2.5/text-to-video", FalRefID: "bytedance/seedance-2.5/image-to-video", FalReferencesID: "bytedance/seedance-2.5/reference-to-video", MaxReferences: 30, ReferencesReplaceFrames: true, ETASeconds: 70, PromptMax: 4000},
		{ID: "wan-3.0", Name: "Wan 3.0", Kind: irisKindVideo, Provider: irisProviderFal, GatewayID: "alibaba/wan-2.6", NativeID: "alibaba/wan-3.0-prime/text-to-video", FalRefID: "alibaba/wan-3.0-prime/reference-to-video", ETASeconds: 75, PromptMax: 4000},
		{ID: "minimax-h3", Name: "MiniMax H3", Kind: irisKindVideo, Provider: irisProviderFal, GatewayID: "minimax/hailuo-2.3", NativeID: "minimax/h3/text-to-video", FalRefID: "minimax/h3/image-to-video", ETASeconds: 80, PromptMax: 4000},
		{ID: "minimax-h3-max", Name: "MiniMax H3 Max", Kind: irisKindVideo, Provider: irisProviderFal, GatewayID: "minimax/hailuo-2.3", NativeID: "minimax/h3-max/text-to-video", FalRefID: "minimax/h3-max/image-to-video", ETASeconds: 55, PromptMax: 4000},
		{ID: "flux-3-video", Name: "FLUX.3 Video", Kind: irisKindVideo, GatewayID: "bfl/flux-3-video", ETASeconds: 70, PromptMax: 4000},
		{ID: "grok-imagine-video-1.5", Name: "Grok Imagine Video 1.5", Kind: irisKindVideo, GatewayID: "spacexai/grok-imagine-video-1.5", ETASeconds: 50, PromptMax: 4000},
		{ID: "elevenlabs-v4", Name: "ElevenLabs v4", Kind: irisKindVoice, Provider: irisProviderElevenLabs, GatewayID: "elevenlabs/eleven-v3", NativeID: "eleven_v4", ETASeconds: 15, PromptMax: 10000},
		{ID: "elevenlabs-v3", Name: "ElevenLabs v3", Kind: irisKindVoice, Provider: irisProviderElevenLabs, GatewayID: "elevenlabs/eleven-multilingual-v2", NativeID: "eleven_multilingual_v2", ETASeconds: 12, PromptMax: 5000},
		{ID: "gemini-3.8-flash-tts", Name: "Gemini 3.8 Flash TTS", Kind: irisKindVoice, GatewayID: "google/gemini-3.8-flash-tts", ETASeconds: 10, PromptMax: 10000},
		// Fish Audio on AI Gateway is speech and transcription only. There is
		// no Gateway music or SFX id; those stay on ElevenLabs. S2.1 Pro is
		// the production TTS; Drama 3 is the current performance model. S2
		// Pro and S1 are previous/deprecated and are not catalogued.
		{ID: "fish-audio-s2.1-pro", Name: "Fish Audio S2.1 Pro", Kind: irisKindVoice, GatewayID: "fish-audio/s2.1-pro", ETASeconds: 10, PromptMax: 10000},
		{ID: "fish-audio-drama-3", Name: "Fish Audio Drama 3", Kind: irisKindVoice, GatewayID: "fish-audio/drama-3", ETASeconds: 12, PromptMax: 10000},
		{ID: "elevenlabs-music", Name: "ElevenLabs Music", Kind: irisKindAudio, Provider: irisProviderElevenLabs, GatewayID: "elevenlabs/music-v1", NativeID: "music_v1", ETASeconds: 40, PromptMax: 4100},
		{ID: "elevenlabs-sfx", Name: "ElevenLabs SFX", Kind: irisKindAudio, Provider: irisProviderElevenLabs, GatewayID: "elevenlabs/sound-effects-v2", NativeID: "eleven_text_to_sound_v2", ETASeconds: 20, PromptMax: 4100},
		// Lyria takes no length: the prompt says how long, up to 3 minutes.
		// One image may set the mood.
		{ID: "lyria-3-pro", Name: "Lyria 3 Pro", Kind: irisKindAudio, Provider: irisProviderFal, NativeID: "fal-ai/lyria3/pro", ETASeconds: 60, PromptMax: 4000},
		{ID: "bria-rmbg-2.0", Name: "Bria RMBG 2.0", Kind: irisKindTool, Provider: irisProviderFal, GatewayID: "bria/rmbg-2.0", NativeID: "fal-ai/bria/background-removal", ETASeconds: 15, RequiresRef: true},
		{ID: "seedvr-2", Name: "SeedVR 2", Kind: irisKindTool, Provider: irisProviderFal, GatewayID: "bytedance/seedvr2", NativeID: "fal-ai/seedvr/upscale/image", ETASeconds: 20, RequiresRef: true},
		{ID: "bytedance-upscaler", Name: "ByteDance Upscaler", Kind: irisKindTool, Provider: irisProviderFal, GatewayID: "bytedance/seedance-2.5", NativeID: "fal-ai/bytedance-upscaler/upscale/video", ETASeconds: 60, RequiresRef: true},
		{ID: "universal-3.5-pro", Name: "Universal 3.5 Pro", Kind: irisKindTool, GatewayID: "google/gemini-3.5-transcribe", ETASeconds: 25, RequiresRef: true},
		{ID: "fish-audio-transcribe-1", Name: "Fish Audio Transcribe 1", Kind: irisKindTool, GatewayID: "fish-audio/transcribe-1", ETASeconds: 25, RequiresRef: true},
		// Listen: Gemini 3.8 Flash, then MiMo V2.6 Pro. Chat completions with
		// a file part; the answer is analysis.md, not a transcript.
		{ID: "listen", Name: "Listen", Kind: irisKindTool, GatewayID: defaultIrisListenModel, ETASeconds: 20, RequiresRef: true},
		// Sound out of a video or audio file: the speech alone, or the speech
		// in another voice. Each returns audio as long as the input.
		{ID: "elevenlabs-voice-isolator", Name: "ElevenLabs Voice Isolator", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "audio-isolation", ETASeconds: 30, RequiresRef: true},
		{ID: "elevenlabs-voice-changer", Name: "ElevenLabs Voice Changer", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "eleven_multilingual_sts_v2", ETASeconds: 30, RequiresRef: true},
		// Several speakers in one take, a voice made from a description (or a
		// designed preview kept as a voice), and transcripts: Scribe hears the
		// speech, forced alignment times a script already written.
		{ID: "elevenlabs-dialogue", Name: "ElevenLabs Dialogue", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "eleven_v3", ETASeconds: 30},
		{ID: "elevenlabs-voice-design", Name: "ElevenLabs Voice Design", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "eleven_ttv_v3", ETASeconds: 30},
		{ID: "elevenlabs-scribe", Name: "ElevenLabs Scribe", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "scribe_v2", ETASeconds: 25, RequiresRef: true},
		{ID: "elevenlabs-forced-alignment", Name: "ElevenLabs Forced Alignment", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "forced-alignment", ETASeconds: 20, RequiresRef: true},
		// Localisation: dubbing in the speakers' own voices, lip-sync to new
		// audio, and reading and rewriting the copy baked into an image.
		{ID: "elevenlabs-dubbing", Name: "ElevenLabs Dubbing", Kind: irisKindTool, Provider: irisProviderElevenLabs, NativeID: "dubbing", ETASeconds: 240, RequiresRef: true},
		{ID: "sync-lipsync-2", Name: "Sync Lipsync 2", Kind: irisKindTool, Provider: irisProviderFal, NativeID: "fal-ai/sync-lipsync/v2", ETASeconds: 180, RequiresRef: true},
		{ID: "image-localise", Name: "Image Localise", Kind: irisKindTool, GatewayID: defaultIrisOpenAIImageModel, ETASeconds: 30, RequiresRef: true},
		{ID: "image-edit", Name: "Image Edit", Kind: irisKindTool, GatewayID: defaultIrisOpenAIImageModel, ETASeconds: 30, RequiresRef: true},
		{ID: "image-text", Name: "Image Text", Kind: irisKindTool, GatewayID: defaultGuidelineCheckModel, ETASeconds: 15, RequiresRef: true},
	}
}

// irisModelAliases maps ids the Iris client sends onto catalogue ids. Iris
// names the Fish Audio models with a slash, as the Gateway does.
var irisModelAliases = map[string]string{
	"fish-audio/s2.1-pro":     "fish-audio-s2.1-pro",
	"fish-audio/drama-3":      "fish-audio-drama-3",
	"fish-audio/transcribe-1": "fish-audio-transcribe-1",
	"qwen3.8-omni-flash":      "listen",
}

func irisModelByID(id string) (irisModelInfo, bool) {
	if canonical, ok := irisModelAliases[id]; ok {
		id = canonical
	}
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
		out = append(out, map[string]any{"id": model.ID, "name": model.Name})
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

// irisMaxImageCount matches the client contract's limit on images per job.
const irisMaxImageCount = 10

// clampIrisImageCount keeps a requested image count within 1..irisMaxImageCount.
func clampIrisImageCount(n int) int {
	if n < 1 {
		return 1
	}
	if n > irisMaxImageCount {
		return irisMaxImageCount
	}
	return n
}

func (req irisGenerateRequest) count() int {
	switch value := req["count"].(type) {
	case float64:
		if value > irisMaxImageCount {
			return irisMaxImageCount
		}
		return clampIrisImageCount(int(value))
	case int:
		return clampIrisImageCount(value)
	case json.Number:
		n, _ := value.Int64()
		if n > irisMaxImageCount {
			return irisMaxImageCount
		}
		return clampIrisImageCount(int(n))
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

const irisMaxImageTranslations = 100

// irisImageBounds is a text region's box, as fractions of the image
// (origin top-left). Width and height are positive.
type irisImageBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// irisImageLocaliseRegion is one reviewed text layer for image-localise:
// where the copy sits, what it says, and the replacement to draw.
type irisImageLocaliseRegion struct {
	ID              string          `json:"id,omitempty"`
	SourceText      string          `json:"sourceText"`
	Bounds          irisImageBounds `json:"bounds"`
	ReplacementText string          `json:"replacementText,omitempty"`
	Instructions    string          `json:"instructions,omitempty"`
}

// irisMaxImageEditPrompt bounds an image-edit instruction, in runes.
const irisMaxImageEditPrompt = 4000

// irisMaxImageEditReferences bounds the reference images sent with an image
// edit. GPT Image takes at most 16 images per edit, the edited one included.
const irisMaxImageEditReferences = 8

var irisSyncModes = map[string]bool{"cut_off": true, "loop": true, "bounce": true, "silence": true, "remap": true}

// irisTranslationPair is one source string and the translation an image's
// copy should carry instead.
type irisTranslationPair struct {
	Source string
	Target string
}

func (req irisGenerateRequest) translations() []irisTranslationPair {
	raw, ok := req["translations"].([]any)
	if !ok {
		return nil
	}
	pairs := make([]irisTranslationPair, 0, len(raw))
	for _, item := range raw {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		source := strings.TrimSpace(stringFrom(entry["source"]))
		target := strings.TrimSpace(stringFrom(entry["target"]))
		if source != "" && target != "" {
			pairs = append(pairs, irisTranslationPair{Source: source, Target: target})
		}
	}
	return pairs
}

func (req irisGenerateRequest) regions() []irisImageLocaliseRegion {
	raw, ok := req["regions"].([]any)
	if !ok {
		return nil
	}
	regions := make([]irisImageLocaliseRegion, 0, len(raw))
	for _, item := range raw {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}
		bounds, ok := parseIrisImageBounds(entry["bounds"])
		if !ok {
			continue
		}
		source := strings.TrimSpace(firstString(entry, "sourceText", "source", "text"))
		if source == "" {
			continue
		}
		regions = append(regions, irisImageLocaliseRegion{
			ID:              strings.TrimSpace(stringFrom(entry["id"])),
			SourceText:      source,
			Bounds:          bounds,
			ReplacementText: strings.TrimSpace(firstString(entry, "replacementText", "target")),
			Instructions:    strings.TrimSpace(stringFrom(entry["instructions"])),
		})
	}
	return regions
}

func (req irisGenerateRequest) intField(name string) int {
	switch value := req[name].(type) {
	case float64:
		return int(value)
	case int:
		return value
	case json.Number:
		n, _ := value.Int64()
		return int(n)
	default:
		return 0
	}
}

// isIrisLocale accepts an ISO 639 language or a BCP 47 tag: fr, pt-BR, zh-Hans.
func isIrisLocale(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 35 {
		return false
	}
	for i, part := range strings.Split(strings.ReplaceAll(value, "_", "-"), "-") {
		if i == 0 && (len(part) < 2 || len(part) > 3) {
			return false
		}
		if len(part) < 2 || len(part) > 8 {
			return false
		}
		for _, r := range part {
			isLetter := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
			isDigit := i > 0 && r >= '0' && r <= '9'
			if isLetter || isDigit {
				continue
			}
			return false
		}
	}
	return true
}

const (
	irisMaxDialogueLines    = 100
	irisMaxVoiceDescription = 1000
	irisMaxKeyterms         = 1000
	irisMaxAlignmentText    = 100_000
)

// irisDialogueLine is one turn of a dialogue: what is said, in which voice.
type irisDialogueLine struct {
	Text  string
	Voice string
}

func (req irisGenerateRequest) dialogueLines() []irisDialogueLine {
	raw, ok := req["lines"].([]any)
	if !ok {
		return nil
	}
	lines := make([]irisDialogueLine, 0, len(raw))
	for _, item := range raw {
		entry, _ := item.(map[string]any)
		lines = append(lines, irisDialogueLine{
			Text:  strings.TrimSpace(stringFrom(entry["text"])),
			Voice: strings.TrimSpace(stringFrom(entry["voice"])),
		})
	}
	return lines
}

func validateIrisDialogue(lines []irisDialogueLine) error {
	if len(lines) == 0 {
		return fmt.Errorf("lines is required: [{ text, voice }, …]")
	}
	if len(lines) > irisMaxDialogueLines {
		return fmt.Errorf("lines takes at most %d turns", irisMaxDialogueLines)
	}
	voices := map[string]bool{}
	runes := 0
	for i, line := range lines {
		if line.Text == "" || line.Voice == "" {
			return fmt.Errorf("lines[%d] needs text and voice", i)
		}
		voices[strings.ToLower(line.Voice)] = true
		runes += len([]rune(line.Text))
	}
	if len(voices) > elevenlabs.MaxDialogueVoices {
		return fmt.Errorf("a dialogue takes at most %d voices", elevenlabs.MaxDialogueVoices)
	}
	if runes > elevenlabs.MaxDialogueRunes {
		return fmt.Errorf("a dialogue takes at most %d characters across its lines", elevenlabs.MaxDialogueRunes)
	}
	return nil
}

func (req irisGenerateRequest) stringList(name string) []string {
	raw, ok := req[name].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if text := strings.TrimSpace(stringFrom(item)); text != "" {
			out = append(out, text)
		}
	}
	return out
}

func (req irisGenerateRequest) boolField(name string) bool {
	value, _ := req[name].(bool)
	return value
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
	if images := len(req.assets("images")); images > 0 && model.FalReferencesID != "" {
		if images > model.MaxReferences {
			return model, fmt.Errorf("%s takes at most %d reference images", model.ID, model.MaxReferences)
		}
		_, start := req.asset("startFrame")
		_, end := req.asset("endFrame")
		if model.ReferencesReplaceFrames && (start || end) {
			return model, fmt.Errorf("%s takes reference images or frames, not both", model.ID)
		}
	}
	switch model.ID {
	case "lyria-3-pro":
		if len(req.assets("images")) > 1 {
			return model, fmt.Errorf("lyria-3-pro takes at most 1 image")
		}
	case "bria-rmbg-2.0", "seedvr-2":
		if _, ok := req.asset("image"); !ok {
			return model, fmt.Errorf("image is required")
		}
	case "bytedance-upscaler":
		if _, ok := req.asset("video"); !ok {
			return model, fmt.Errorf("video is required")
		}
	case "universal-3.5-pro", "fish-audio-transcribe-1":
		if _, ok := req.asset("audio"); !ok {
			if scene, _ := req["audio"].(map[string]any); stringFrom(scene["scene"]) != "" {
				return model, fmt.Errorf("scene audio references are not supported; upload the file first")
			}
			return model, fmt.Errorf("audio is required")
		}
	case "listen":
		if _, ok := req.asset("media"); !ok {
			return model, fmt.Errorf("media is required")
		}
	case "elevenlabs-voice-isolator":
		if _, ok := req.asset("media"); !ok {
			return model, fmt.Errorf("media is required")
		}
	case "elevenlabs-voice-changer":
		if _, ok := req.asset("media"); !ok {
			return model, fmt.Errorf("media is required")
		}
		if req.voice() == "" {
			return model, fmt.Errorf("voice is required")
		}
		if value, ok := req["removeBackgroundNoise"]; ok {
			if _, ok := value.(bool); !ok {
				return model, fmt.Errorf("removeBackgroundNoise must be true or false")
			}
		}
	case "elevenlabs-dialogue":
		if err := validateIrisDialogue(req.dialogueLines()); err != nil {
			return model, err
		}
		if code := req.languageCode(); code != "" && !isIrisLocale(code) {
			return model, fmt.Errorf("languageCode must be a language or locale")
		}
	case "elevenlabs-voice-design":
		// Saved voices would live in the one ElevenLabs account every
		// workspace shares, so designing stops at the previews for now.
		if req.stringField("generatedVoiceId") != "" {
			return model, fmt.Errorf("keeping a designed voice is not available yet; use the previews to pick a voice from the ElevenLabs library")
		}
		prompt := req.prompt()
		if prompt == "" {
			return model, fmt.Errorf("prompt is required: describe the voice")
		}
		if len([]rune(prompt)) > irisMaxVoiceDescription {
			return model, fmt.Errorf("prompt is too long")
		}
		if text := req.stringField("text"); text != "" {
			if n := len([]rune(text)); n < 100 || n > 1000 {
				return model, fmt.Errorf("text takes 100 to 1,000 characters")
			}
		}
	case "elevenlabs-scribe":
		if _, ok := req.asset("audio"); !ok {
			return model, fmt.Errorf("audio is required")
		}
		if code := req.languageCode(); code != "" && !isIrisLocale(code) {
			return model, fmt.Errorf("languageCode must be a language or locale")
		}
		if value, ok := req["diarize"]; ok {
			if _, ok := value.(bool); !ok {
				return model, fmt.Errorf("diarize must be true or false")
			}
		}
		if speakers := req.intField("speakers"); speakers < 0 || speakers > 32 {
			return model, fmt.Errorf("speakers takes 1 to 32")
		}
		if len(req.stringList("keyterms")) > irisMaxKeyterms {
			return model, fmt.Errorf("keyterms takes at most %d terms", irisMaxKeyterms)
		}
	case "elevenlabs-forced-alignment":
		if _, ok := req.asset("audio"); !ok {
			return model, fmt.Errorf("audio is required")
		}
		text := req.stringField("text")
		if text == "" {
			return model, fmt.Errorf("text is required: the script the audio says")
		}
		if len([]rune(text)) > irisMaxAlignmentText {
			return model, fmt.Errorf("text is too long")
		}
	case "elevenlabs-dubbing":
		if _, ok := req.asset("media"); !ok {
			return model, fmt.Errorf("media is required")
		}
		if !isIrisLocale(req.stringField("targetLanguage")) {
			return model, fmt.Errorf("targetLanguage is required (a language like fr or a locale like pt-BR)")
		}
		if source := req.stringField("sourceLanguage"); source != "" && !isIrisLocale(source) {
			return model, fmt.Errorf("sourceLanguage must be a language or locale")
		}
	case "sync-lipsync-2":
		if _, ok := req.asset("video"); !ok {
			return model, fmt.Errorf("video is required")
		}
		if _, ok := req.asset("audio"); !ok {
			return model, fmt.Errorf("audio is required")
		}
		if mode := req.stringField("syncMode"); mode != "" && !irisSyncModes[mode] {
			return model, fmt.Errorf("syncMode must be cut_off, loop, bounce, silence or remap")
		}
	case "image-localise":
		if _, ok := req.asset("image"); !ok {
			return model, fmt.Errorf("image is required")
		}
		if !isIrisLocale(req.stringField("targetLocale")) {
			return model, fmt.Errorf("targetLocale is required (a locale like ja-JP)")
		}
		if len(req.translations()) > irisMaxImageTranslations {
			return model, fmt.Errorf("translations takes at most %d pairs", irisMaxImageTranslations)
		}
		if len(req.regions()) > irisMaxImageTranslations {
			return model, fmt.Errorf("regions takes at most %d text layers", irisMaxImageTranslations)
		}
	case "image-text":
		if _, ok := req.asset("image"); !ok {
			return model, fmt.Errorf("image is required")
		}
	case "image-edit":
		if _, ok := req.asset("image"); !ok {
			return model, fmt.Errorf("image is required")
		}
		if req.prompt() == "" {
			return model, fmt.Errorf("prompt is required")
		}
		if len([]rune(req.prompt())) > irisMaxImageEditPrompt {
			return model, fmt.Errorf("prompt is too long")
		}
		if _, ok := req["mask"]; ok {
			if _, ok := req.asset("mask"); !ok {
				return model, fmt.Errorf("mask must be an uploaded asset")
			}
		}
		if len(req.assets("images")) > irisMaxImageEditReferences {
			return model, fmt.Errorf("image-edit takes at most %d reference images", irisMaxImageEditReferences)
		}
	}
	return model, nil
}

func estimateIrisRequest(req irisGenerateRequest) (irisEstimate, irisModelInfo, error) {
	model, err := validateIrisGenerateRequest(req)
	if err != nil {
		return irisEstimate{}, model, err
	}
	return irisEstimate{Allowed: true, FeatureID: autumn.AITokens, Unit: irisEstimateUnitUSD, ETASeconds: model.ETASeconds}, model, nil
}

func rejectRemoteAssetURLs(req irisGenerateRequest) error {
	fields := []string{"image", "mask", "video", "audio", "media", "startFrame", "endFrame"}
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

func firstString(entry map[string]any, keys ...string) string {
	for _, key := range keys {
		if text := strings.TrimSpace(stringFrom(entry[key])); text != "" {
			return text
		}
	}
	return ""
}

func floatFrom(value any) float64 {
	switch n := value.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func parseIrisImageBounds(value any) (irisImageBounds, bool) {
	raw, ok := value.(map[string]any)
	if !ok {
		return irisImageBounds{}, false
	}
	bounds := irisImageBounds{
		X:      floatFrom(raw["x"]),
		Y:      floatFrom(raw["y"]),
		Width:  floatFrom(raw["width"]),
		Height: floatFrom(raw["height"]),
	}
	if bounds.X < 0 || bounds.Y < 0 || bounds.Width <= 0 || bounds.Height <= 0 {
		return irisImageBounds{}, false
	}
	if bounds.X > 1 || bounds.Y > 1 || bounds.Width > 1 || bounds.Height > 1 {
		return irisImageBounds{}, false
	}
	if bounds.X+bounds.Width > 1.001 || bounds.Y+bounds.Height > 1.001 {
		return irisImageBounds{}, false
	}
	return bounds, true
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
