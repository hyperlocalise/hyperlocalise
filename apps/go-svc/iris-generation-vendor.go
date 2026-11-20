package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"math"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/internal/elevenlabs"
	"github.com/hyperlocalise/hyperlocalise/internal/fal"
)

type irisMediaFetcher func(context.Context, string) ([]byte, string, error)

type irisCompositeProvider struct {
	// Only assign a non-nil gateway/openai; a nil *irisGatewayProvider stored in
	// an interface would pass != nil and panic on use.
	gateway    irisGenerationProvider
	openai     irisGenerationProvider
	elevenlabs *elevenlabs.Client
	fal        *fal.Client
	fetch      irisMediaFetcher
}

func newIrisGenerationProvider() irisGenerationProvider {
	provider := &irisCompositeProvider{
		fetch: fetchHTTPS,
	}
	if gateway := newIrisGatewayProvider(); gateway != nil {
		provider.gateway = gateway
	}
	if openai := newIrisOpenAIProvider(); openai != nil {
		provider.openai = openai
	}
	if key := strings.TrimSpace(os.Getenv("ELEVENLABS_API_KEY")); key != "" {
		if client, err := elevenlabs.NewClient(elevenlabs.Config{
			APIKey:  key,
			BaseURL: strings.TrimSpace(os.Getenv("ELEVENLABS_BASE_URL")),
		}); err == nil {
			provider.elevenlabs = client
		}
	}
	if key := strings.TrimSpace(os.Getenv("FAL_KEY")); key != "" {
		if client, err := fal.NewClient(fal.Config{
			APIKey:       key,
			QueueBaseURL: strings.TrimSpace(os.Getenv("FAL_QUEUE_URL")),
			PollInterval: 750 * time.Millisecond,
		}); err == nil {
			provider.fal = client
		}
	}
	return provider
}

func (p *irisCompositeProvider) Generate(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	switch req.Model.Provider {
	case irisProviderElevenLabs:
		if p.elevenlabs != nil {
			return generateElevenLabs(ctx, p.elevenlabs, req)
		}
	case irisProviderFal:
		if p.fal != nil {
			return generateFal(ctx, p.fal, p.fetcher(), req)
		}
	}
	// AI Gateway keeps the full catalog. OPENAI_API_KEY only covers openai/*
	// models — never send google/xai/… ids to api.openai.com.
	if p.gateway != nil {
		return p.gateway.Generate(ctx, req)
	}
	if p.openai != nil && irisModelUsesOpenAI(req.Model) {
		return p.openai.Generate(ctx, req)
	}
	if p.openai != nil {
		return nil, fmt.Errorf("model %q requires AI_GATEWAY_API_KEY (OPENAI_API_KEY only supports OpenAI models)", req.Model.ID)
	}
	return nil, fmt.Errorf("generation provider is not configured (set AI_GATEWAY_API_KEY, OPENAI_API_KEY, ELEVENLABS_API_KEY, or FAL_KEY)")
}

func irisModelUsesOpenAI(model irisModelInfo) bool {
	if model.ID == "image-localise" || model.ID == "image-edit" {
		// GPT Image, on AI Gateway or on OpenAI when only OPENAI_API_KEY is configured.
		return true
	}
	return strings.HasPrefix(strings.TrimSpace(model.GatewayID), "openai/")
}

func (p *irisCompositeProvider) fetcher() irisMediaFetcher {
	if p.fetch != nil {
		return p.fetch
	}
	return fetchHTTPS
}

func generateElevenLabs(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) ([]irisProviderOutput, error) {
	var (
		audio elevenlabs.Audio
		err   error
	)
	switch req.Model.ID {
	case "elevenlabs-dubbing":
		return generateDub(ctx, client, req)
	case "elevenlabs-voice-isolator", "elevenlabs-voice-changer":
		return generateVoiceTool(ctx, client, req)
	case "elevenlabs-voice-design":
		return generateVoiceDesign(ctx, client, req)
	case "elevenlabs-scribe", "elevenlabs-forced-alignment":
		return generateElevenLabsTranscript(ctx, client, req)
	case "elevenlabs-dialogue":
		lines := req.Fields.dialogueLines()
		dialogue := make([]elevenlabs.DialogueLine, 0, len(lines))
		for _, line := range lines {
			dialogue = append(dialogue, elevenlabs.DialogueLine{Text: line.Text, Voice: line.Voice})
		}
		audio, err = client.CreateDialogue(ctx, elevenlabs.DialogueRequest{
			Lines:          dialogue,
			ModelID:        req.Model.NativeID,
			LanguageCode:   req.Language,
			Pronunciations: irisPronunciationLocators(ctx, client, req),
		})
	case "elevenlabs-music":
		audio, err = client.ComposeMusic(ctx, elevenlabs.MusicRequest{
			Prompt:          req.Prompt,
			ModelID:         req.Model.NativeID,
			DurationSeconds: req.Duration,
		})
	case "elevenlabs-sfx":
		audio, err = client.CreateSoundEffect(ctx, elevenlabs.SoundEffectRequest{
			Text:            req.Prompt,
			ModelID:         req.Model.NativeID,
			DurationSeconds: req.Duration,
		})
	default:
		audio, err = client.CreateSpeech(ctx, elevenlabs.SpeechRequest{
			Text:           req.Prompt,
			Voice:          req.Voice,
			ModelID:        req.Model.NativeID,
			LanguageCode:   req.Language,
			Pronunciations: irisPronunciationLocators(ctx, client, req),
		})
	}
	if err != nil {
		return nil, err
	}
	ext := "mp3"
	if strings.Contains(audio.ContentType, "wav") {
		ext = "wav"
	}
	return []irisProviderOutput{{
		Bytes:       audio.Bytes,
		Filename:    "speech." + ext,
		ContentType: defaultType(audio.ContentType, "audio/mpeg"),
	}}, nil
}

func generateFal(ctx context.Context, client *fal.Client, fetch irisMediaFetcher, req irisProviderRequest) ([]irisProviderOutput, error) {
	endpoint := falEndpoint(req)
	if strings.TrimSpace(endpoint) == "" {
		return nil, fmt.Errorf("fal endpoint is not configured for %s", req.Model.ID)
	}
	result, err := client.Run(ctx, endpoint, falInput(req))
	if err != nil {
		return nil, err
	}
	urls := fal.MediaURLs(result)
	if len(urls) == 0 {
		return nil, fmt.Errorf("fal returned no media")
	}
	stem, ext, contentType := falOutputMeta(req.Model)
	out := make([]irisProviderOutput, 0, len(urls))
	for i, mediaURL := range urls {
		raw, fetchedType, err := fetch(ctx, mediaURL)
		if err != nil {
			return nil, err
		}
		name := falFilename(mediaURL, stem, ext, i, len(urls))
		out = append(out, irisProviderOutput{
			Bytes:       raw,
			Filename:    name,
			ContentType: defaultType(fetchedType, contentType),
		})
	}
	return out, nil
}

func falInput(req irisProviderRequest) map[string]any {
	endpoint := falEndpoint(req)
	if req.Model.FalReferencesID != "" && endpoint == req.Model.FalReferencesID {
		return falReferencesInput(req, endpoint)
	}
	input := map[string]any{}
	if prompt := strings.TrimSpace(req.Prompt); prompt != "" {
		input["prompt"] = prompt
	}
	if duration, ok := falDuration(endpoint, req.Duration); ok {
		input["duration"] = duration
	}
	if aspect := strings.TrimSpace(req.AspectRatio); aspect != "" {
		input["aspect_ratio"] = aspect
	}
	if size := falImageSize(req.Resolution, req.AspectRatio); size != "" && req.Model.Kind == irisKindImage {
		input["image_size"] = size
	}
	if req.Count > 1 {
		input["num_images"] = req.Count
	}
	if start, ok := firstInput(req.Inputs, "start"); ok {
		input["image_url"] = irisDataURI(start, "image/png")
	}
	if end, ok := firstInput(req.Inputs, "end"); ok {
		input["end_image_url"] = irisDataURI(end, "image/png")
	}
	images := inputsByRole(req.Inputs, "image")
	if len(images) == 1 {
		if _, hasStart := input["image_url"]; !hasStart {
			input["image_url"] = irisDataURI(images[0], "image/png")
		}
	} else if len(images) > 1 {
		urls := make([]string, 0, len(images))
		for _, image := range images {
			urls = append(urls, irisDataURI(image, "image/png"))
		}
		if _, hasStart := input["image_url"]; !hasStart {
			input["image_url"] = urls[0]
		}
		input["image_urls"] = urls
	}
	if video, ok := firstInput(req.Inputs, "video"); ok {
		input["video_url"] = irisDataURI(video, "video/mp4")
	}
	if audio, ok := firstInput(req.Inputs, "audio", "media"); ok {
		input["audio_url"] = irisDataURI(audio, "audio/wav")
	}
	if mode := req.Fields.stringField("syncMode"); mode != "" && req.Model.ID == "sync-lipsync-2" {
		input["sync_mode"] = mode
	}
	return input
}

// falReferencesInput is a reference-to-video request: every image a
// reference in `image_urls`, in the order the prompt names them (@Image1…),
// and the frames, where the endpoint takes them, under their own names.
func falReferencesInput(req irisProviderRequest, endpoint string) map[string]any {
	input := map[string]any{}
	if prompt := strings.TrimSpace(req.Prompt); prompt != "" {
		input["prompt"] = prompt
	}
	if duration, ok := falDuration(endpoint, req.Duration); ok {
		input["duration"] = duration
	}
	if aspect := strings.TrimSpace(req.AspectRatio); aspect != "" {
		input["aspect_ratio"] = aspect
	}
	images := inputsByRole(req.Inputs, "image")
	urls := make([]string, 0, len(images))
	for _, image := range images {
		urls = append(urls, irisDataURI(image, "image/png"))
	}
	input["image_urls"] = urls
	if !req.Model.ReferencesReplaceFrames {
		if start, ok := firstInput(req.Inputs, "start"); ok {
			input["start_image_url"] = irisDataURI(start, "image/png")
		}
		if end, ok := firstInput(req.Inputs, "end"); ok {
			input["end_image_url"] = irisDataURI(end, "image/png")
		}
	}
	return input
}

func falEndpoint(req irisProviderRequest) string {
	if req.Model.FalVideoID != "" {
		if _, ok := firstInput(req.Inputs, "video"); ok {
			return req.Model.FalVideoID
		}
	}
	if req.Model.FalReferencesID != "" {
		if _, ok := firstInput(req.Inputs, "image"); ok {
			return req.Model.FalReferencesID
		}
	}
	if req.Model.FalRefID != "" {
		if _, ok := firstInput(req.Inputs, "image", "start", "end"); ok {
			return req.Model.FalRefID
		}
	}
	return req.Model.NativeID
}

func falDuration(endpoint string, duration float64) (any, bool) {
	if duration <= 0 {
		return nil, false
	}
	seconds := int(math.Round(duration))
	if seconds < 1 {
		seconds = 1
	}
	switch {
	case strings.Contains(endpoint, "kling-video"), strings.Contains(endpoint, "seedance"):
		return strconv.Itoa(seconds), true
	default:
		return seconds, true
	}
}

func irisDataURI(input irisProviderInput, fallback string) string {
	return "data:" + defaultType(input.ContentType, fallback) + ";base64," + base64.StdEncoding.EncodeToString(input.Bytes)
}

func falImageSize(resolution, aspect string) string {
	switch strings.TrimSpace(aspect) {
	case "16:9":
		return "landscape_16_9"
	case "9:16":
		return "portrait_16_9"
	default:
		if resolution == "4K" || resolution == "2K" {
			return "square_hd"
		}
		if resolution == "" && aspect == "" {
			return ""
		}
		return "square"
	}
}

func falOutputMeta(model irisModelInfo) (stem, ext, contentType string) {
	if model.ID == "sync-lipsync-2" {
		return "lipsync", "mp4", "video/mp4"
	}
	switch model.Kind {
	case irisKindVideo:
		return "video", "mp4", "video/mp4"
	case irisKindVoice, irisKindAudio:
		return "audio", "mp3", "audio/mpeg"
	default:
		return "image", "png", "image/png"
	}
}

func falFilename(rawURL, stem, ext string, index, total int) string {
	if parsed, err := url.Parse(rawURL); err == nil {
		if name := path.Base(parsed.Path); name != "" && name != "/" && name != "." {
			return name
		}
	}
	if total == 1 {
		return stem + "." + ext
	}
	return fmt.Sprintf("%s-%d.%s", stem, index+1, ext)
}

func generateDub(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) ([]irisProviderOutput, error) {
	media, ok := firstInput(req.Inputs, "media", "video", "audio")
	if !ok {
		return nil, fmt.Errorf("media input is required")
	}
	dub, err := client.CreateDub(ctx, elevenlabs.DubRequest{
		Media:          media.Bytes,
		ContentType:    media.ContentType,
		TargetLanguage: req.Fields.stringField("targetLanguage"),
		SourceLanguage: req.Fields.stringField("sourceLanguage"),
		Speakers:       req.Fields.intField("speakers"),
	})
	if err != nil {
		return nil, err
	}
	ext := "mp3"
	if strings.HasPrefix(dub.ContentType, "video/") {
		ext = "mp4"
	}
	language := elevenlabs.DubbingLanguage(req.Fields.stringField("targetLanguage"))
	return []irisProviderOutput{{
		Bytes:       dub.Bytes,
		Filename:    "dub-" + language + "." + ext,
		ContentType: dub.ContentType,
	}}, nil
}

// generateVoiceTool isolates the speech of the media, or re-voices it.
func generateVoiceTool(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) ([]irisProviderOutput, error) {
	media, ok := firstInput(req.Inputs, "media", "video", "audio")
	if !ok {
		return nil, fmt.Errorf("media input is required")
	}
	var (
		audio elevenlabs.Audio
		stem  string
		err   error
	)
	if req.Model.ID == "elevenlabs-voice-isolator" {
		stem = "voice"
		audio, err = client.IsolateVoice(ctx, elevenlabs.IsolationRequest{
			Media:       media.Bytes,
			ContentType: media.ContentType,
		})
	} else {
		stem = "revoiced"
		audio, err = client.ChangeVoice(ctx, elevenlabs.VoiceChangeRequest{
			Media:                 media.Bytes,
			ContentType:           media.ContentType,
			Voice:                 req.Voice,
			ModelID:               req.Model.NativeID,
			RemoveBackgroundNoise: req.Fields.boolField("removeBackgroundNoise"),
		})
	}
	if err != nil {
		return nil, err
	}
	ext := "mp3"
	if strings.Contains(audio.ContentType, "wav") {
		ext = "wav"
	}
	return []irisProviderOutput{{
		Bytes:       audio.Bytes,
		Filename:    stem + "." + ext,
		ContentType: defaultType(audio.ContentType, "audio/mpeg"),
	}}, nil
}

// irisPronunciationLocators turns the job's glossary pronunciations into a
// dictionary the speech uses. A dictionary ElevenLabs will not make leaves
// the speech as it would have been without one.
func irisPronunciationLocators(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) []elevenlabs.PronunciationLocator {
	if len(req.Pronunciations) == 0 {
		return nil
	}
	rules := make([]elevenlabs.PronunciationRule, 0, len(req.Pronunciations))
	for _, rule := range req.Pronunciations {
		rules = append(rules, elevenlabs.PronunciationRule{Term: rule.Term, Alias: rule.Alias, CaseSensitive: rule.CaseSensitive})
	}
	locator, ok, err := client.PronunciationDictionary(ctx, rules)
	if err != nil {
		slog.WarnContext(ctx, "iris_generation_pronunciation_dictionary_failed", "model", req.Model.ID, "rules", len(rules), "error", err)
		return nil
	}
	if !ok {
		return nil
	}
	return []elevenlabs.PronunciationLocator{locator}
}

// generateVoiceDesign makes previews of a described voice, or keeps one
// preview as a voice. Previews come back as audio files and voices.json,
// which names each preview's generatedVoiceId; keeping one returns
// voice.json with the voiceId speech and dialogue take.
func generateVoiceDesign(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) ([]irisProviderOutput, error) {
	if generated := req.Fields.stringField("generatedVoiceId"); generated != "" {
		name := req.Fields.stringField("name")
		voiceID, err := client.SaveVoice(ctx, elevenlabs.SaveVoiceRequest{
			GeneratedVoiceID: generated,
			Name:             name,
			Description:      req.Prompt,
			Labels:           map[string]string{"source": "hyperlocalise-iris"},
		})
		if err != nil {
			return nil, err
		}
		return []irisProviderOutput{{
			Bytes:       mustJSON(map[string]string{"voiceId": voiceID, "name": name}),
			Filename:    "voice.json",
			ContentType: "application/json",
		}}, nil
	}
	previews, text, err := client.DesignVoice(ctx, elevenlabs.VoiceDesignRequest{
		Description: req.Prompt,
		Text:        req.Fields.stringField("text"),
		ModelID:     req.Model.NativeID,
	})
	if err != nil {
		return nil, err
	}
	outputs := make([]irisProviderOutput, 0, len(previews)+1)
	index := make([]map[string]any, 0, len(previews))
	for i, preview := range previews {
		filename := fmt.Sprintf("voice-preview-%d.mp3", i+1)
		outputs = append(outputs, irisProviderOutput{
			Bytes:       preview.Audio.Bytes,
			Filename:    filename,
			ContentType: defaultType(preview.Audio.ContentType, "audio/mpeg"),
		})
		index = append(index, map[string]any{
			"file":             filename,
			"generatedVoiceId": preview.GeneratedVoiceID,
			"durationSeconds":  preview.DurationSeconds,
			"language":         preview.Language,
		})
	}
	outputs = append(outputs, irisProviderOutput{
		Bytes:       mustJSON(map[string]any{"text": text, "previews": index}),
		Filename:    "voices.json",
		ContentType: "application/json",
	})
	return outputs, nil
}

// generateElevenLabsTranscript transcribes the audio with Scribe, or times
// a known script against it, as the segment array the other transcription
// models return.
func generateElevenLabsTranscript(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) ([]irisProviderOutput, error) {
	audio, ok := firstInput(req.Inputs, "audio", "media")
	if !ok {
		return nil, fmt.Errorf("audio input is required")
	}
	var (
		transcript elevenlabs.Transcript
		err        error
	)
	if req.Model.ID == "elevenlabs-forced-alignment" {
		transcript, err = client.Align(ctx, elevenlabs.AlignmentRequest{
			Media:       audio.Bytes,
			ContentType: irisAudioMediaType(audio),
			Text:        req.Fields.stringField("text"),
		})
	} else {
		transcript, err = client.Transcribe(ctx, elevenlabs.TranscriptionRequest{
			Media:        audio.Bytes,
			ContentType:  irisAudioMediaType(audio),
			ModelID:      req.Model.NativeID,
			LanguageCode: req.Language,
			Diarize:      req.Fields.boolField("diarize"),
			Speakers:     req.Fields.intField("speakers"),
			Keyterms:     append(req.Fields.stringList("keyterms"), req.Keyterms...),
		})
	}
	if err != nil {
		return nil, err
	}
	return []irisProviderOutput{{Bytes: mustJSON(irisTranscriptSegments(transcript)), Filename: "transcript.json", ContentType: "application/json"}}, nil
}

// irisTranscriptGap is the pause, in seconds, that starts a new segment.
const irisTranscriptGap = 1.0

// irisTranscriptSegments splits timed words into segments where the speaker
// changes, the speech pauses, or a sentence ends — the cues captions show.
func irisTranscriptSegments(transcript elevenlabs.Transcript) []map[string]any {
	segments := []map[string]any{}
	var words []map[string]any
	var texts []string
	speaker := ""
	flush := func() {
		if len(words) == 0 {
			return
		}
		segment := map[string]any{"text": irisJoinWords(texts), "words": words}
		if speaker != "" {
			segment["speaker"] = speaker
		}
		segments = append(segments, segment)
		words, texts = nil, nil
	}
	var lastEnd float64
	for i, word := range transcript.Words {
		if i > 0 && (word.Speaker != speaker || word.Start-lastEnd > irisTranscriptGap) {
			flush()
		}
		speaker = word.Speaker
		timed := map[string]any{"text": word.Text, "start": word.Start, "end": word.End}
		if word.Speaker != "" {
			timed["speaker"] = word.Speaker
		}
		words = append(words, timed)
		texts = append(texts, word.Text)
		lastEnd = word.End
		if last, _ := utf8.DecodeLastRuneInString(word.Text); strings.ContainsRune(".?!。？！", last) {
			flush()
		}
	}
	flush()
	if len(segments) == 0 {
		return []map[string]any{{"text": transcript.Text, "words": []any{}}}
	}
	return segments
}

// irisJoinWords puts spaces between words, except where the script does not
// separate them (Japanese, Chinese, Thai).
func irisJoinWords(words []string) string {
	var b strings.Builder
	for i, word := range words {
		if i > 0 {
			prev, _ := utf8.DecodeLastRuneInString(words[i-1])
			next, _ := utf8.DecodeRuneInString(word)
			if !unspacedScript(prev) && !unspacedScript(next) {
				b.WriteByte(' ')
			}
		}
		b.WriteString(word)
	}
	return b.String()
}
