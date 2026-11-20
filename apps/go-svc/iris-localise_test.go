package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type stubIrisText struct {
	reply   string
	request irisChatRequest
}

func (s *stubIrisText) Complete(_ context.Context, req irisChatRequest) (irisChatReply, error) {
	s.request = req
	return irisChatReply{Text: s.reply, Model: req.Model, InputTokens: 10, OutputTokens: 5}, nil
}

const testAsset = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func assetField() map[string]any { return map[string]any{"kind": "asset", "id": testAsset} }

func TestValidateIrisLocaliseModels(t *testing.T) {
	cases := []struct {
		name string
		req  irisGenerateRequest
		err  string
	}{
		{"dub ok", irisGenerateRequest{"model": "elevenlabs-dubbing", "media": assetField(), "targetLanguage": "fr-FR"}, ""},
		{"dub needs media", irisGenerateRequest{"model": "elevenlabs-dubbing", "targetLanguage": "fr"}, "media is required"},
		{"dub needs language", irisGenerateRequest{"model": "elevenlabs-dubbing", "media": assetField()}, "targetLanguage"},
		{"dub rejects bad source", irisGenerateRequest{"model": "elevenlabs-dubbing", "media": assetField(), "targetLanguage": "fr", "sourceLanguage": "english!"}, "sourceLanguage"},
		{"isolator ok", irisGenerateRequest{"model": "elevenlabs-voice-isolator", "media": assetField()}, ""},
		{"isolator needs media", irisGenerateRequest{"model": "elevenlabs-voice-isolator"}, "media is required"},
		{"changer ok", irisGenerateRequest{"model": "elevenlabs-voice-changer", "media": assetField(), "voice": "Roger", "removeBackgroundNoise": true}, ""},
		{"changer needs media", irisGenerateRequest{"model": "elevenlabs-voice-changer", "voice": "Roger"}, "media is required"},
		{"changer needs voice", irisGenerateRequest{"model": "elevenlabs-voice-changer", "media": assetField()}, "voice is required"},
		{"changer noise flag", irisGenerateRequest{"model": "elevenlabs-voice-changer", "media": assetField(), "voice": "Roger", "removeBackgroundNoise": "yes"}, "removeBackgroundNoise"},
		{"dialogue ok", irisGenerateRequest{"model": "elevenlabs-dialogue", "lines": []any{map[string]any{"text": "Hi", "voice": "Roger"}, map[string]any{"text": "Hey", "voice": "Sarah"}}, "languageCode": "en"}, ""},
		{"dialogue needs lines", irisGenerateRequest{"model": "elevenlabs-dialogue"}, "lines is required"},
		{"dialogue line needs voice", irisGenerateRequest{"model": "elevenlabs-dialogue", "lines": []any{map[string]any{"text": "Hi"}}}, "lines[0] needs text and voice"},
		{"dialogue too long", irisGenerateRequest{"model": "elevenlabs-dialogue", "lines": []any{map[string]any{"text": strings.Repeat("a", 2001), "voice": "Roger"}}}, "2000 characters"},
		{"voice design ok", irisGenerateRequest{"model": "elevenlabs-voice-design", "prompt": "A warm narrator"}, ""},
		{"voice design needs prompt", irisGenerateRequest{"model": "elevenlabs-voice-design"}, "prompt is required"},
		{"voice design text length", irisGenerateRequest{"model": "elevenlabs-voice-design", "prompt": "A warm narrator", "text": "short"}, "100 to 1,000"},
		{"voice save disabled", irisGenerateRequest{"model": "elevenlabs-voice-design", "generatedVoiceId": "gen-1", "name": "Narrator"}, "not available yet"},
		{"scribe ok", irisGenerateRequest{"model": "elevenlabs-scribe", "audio": assetField(), "diarize": true, "speakers": float64(2), "keyterms": []any{"Iris"}}, ""},
		{"scribe needs audio", irisGenerateRequest{"model": "elevenlabs-scribe"}, "audio is required"},
		{"scribe diarize flag", irisGenerateRequest{"model": "elevenlabs-scribe", "audio": assetField(), "diarize": "yes"}, "diarize"},
		{"alignment ok", irisGenerateRequest{"model": "elevenlabs-forced-alignment", "audio": assetField(), "text": "Bonjour"}, ""},
		{"alignment needs text", irisGenerateRequest{"model": "elevenlabs-forced-alignment", "audio": assetField()}, "text is required"},
		{"lipsync ok", irisGenerateRequest{"model": "sync-lipsync-2", "video": assetField(), "audio": assetField(), "syncMode": "loop"}, ""},
		{"lipsync needs audio", irisGenerateRequest{"model": "sync-lipsync-2", "video": assetField()}, "audio is required"},
		{"lipsync mode", irisGenerateRequest{"model": "sync-lipsync-2", "video": assetField(), "audio": assetField(), "syncMode": "stretch"}, "syncMode"},
		{"image localise ok", irisGenerateRequest{"model": "image-localise", "image": assetField(), "targetLocale": "ja-JP"}, ""},
		{"image localise locale", irisGenerateRequest{"model": "image-localise", "image": assetField()}, "targetLocale"},
		{"image localise regions", irisGenerateRequest{"model": "image-localise", "image": assetField(), "targetLocale": "ja-JP", "regions": []any{map[string]any{"sourceText": "Sale", "bounds": map[string]any{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1}}}}, ""},
		{"image localise too many regions", irisGenerateRequest{"model": "image-localise", "image": assetField(), "targetLocale": "ja-JP", "regions": tooManyIrisRegions()}, "regions takes at most"},
		{"image text ok", irisGenerateRequest{"model": "image-text", "image": assetField()}, ""},
		{"image text needs image", irisGenerateRequest{"model": "image-text"}, "image is required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateIrisGenerateRequest(tc.req)
			if tc.err == "" {
				require.NoError(t, err)
			} else {
				require.ErrorContains(t, err, tc.err)
			}
		})
	}
}

func TestIsIrisLocale(t *testing.T) {
	for _, ok := range []string{"fr", "fr-FR", "pt_BR", "zh-Hans-CN", "es-419"} {
		require.True(t, isIrisLocale(ok), ok)
	}
	for _, bad := range []string{"", "f", "french language", "fr--FR", "12-FR", "fr-F"} {
		require.False(t, isIrisLocale(bad), bad)
	}
}

func tooManyIrisRegions() []any {
	regions := make([]any, irisMaxImageTranslations+1)
	for i := range regions {
		regions[i] = map[string]any{
			"sourceText": "Sale",
			"bounds":     map[string]any{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1},
		}
	}
	return regions
}

func TestIrisTranslationsField(t *testing.T) {
	req := irisGenerateRequest{"translations": []any{
		map[string]any{"source": "Sale", "target": "Soldes"},
		map[string]any{"source": " ", "target": "x"},
		"junk",
	}}
	require.Equal(t, []irisTranslationPair{{Source: "Sale", Target: "Soldes"}}, req.translations())
}

func TestIrisRegionsField(t *testing.T) {
	req := irisGenerateRequest{"regions": []any{
		map[string]any{
			"id":              "layer-1",
			"sourceText":      "50% OFF",
			"replacementText": "−50 %",
			"instructions":    "Keep the numerals",
			"bounds":          map[string]any{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.1},
		},
		map[string]any{"source": "Shop now", "target": "Acheter", "bounds": map[string]any{"x": 0.4, "y": 0.8, "width": 0.2, "height": 0.05}},
		map[string]any{"sourceText": "no box"},
		"junk",
	}}
	require.Equal(t, []irisImageLocaliseRegion{
		{ID: "layer-1", SourceText: "50% OFF", Bounds: irisImageBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1}, ReplacementText: "−50 %", Instructions: "Keep the numerals"},
		{SourceText: "Shop now", Bounds: irisImageBounds{X: 0.4, Y: 0.8, Width: 0.2, Height: 0.05}, ReplacementText: "Acheter"},
	}, req.regions())
}

func TestParseIrisImageBounds(t *testing.T) {
	ok := func(t *testing.T, value any, want irisImageBounds) {
		t.Helper()
		got, parsed := parseIrisImageBounds(value)
		require.True(t, parsed)
		require.Equal(t, want, got)
	}
	reject := func(t *testing.T, value any) {
		t.Helper()
		_, parsed := parseIrisImageBounds(value)
		require.False(t, parsed)
	}

	ok(t, map[string]any{"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}, irisImageBounds{Width: 1, Height: 1})
	ok(t, map[string]any{"x": json.Number("0.25"), "y": 0, "width": 0.5, "height": json.Number("0.751")}, irisImageBounds{X: 0.25, Width: 0.5, Height: 0.751})
	ok(t, map[string]any{"x": 0, "y": 0, "width": 1, "height": 1}, irisImageBounds{Width: 1, Height: 1})

	reject(t, "not a box")
	reject(t, map[string]any{"x": -0.1, "y": 0, "width": 0.2, "height": 0.2})
	reject(t, map[string]any{"x": 0, "y": 0, "width": 0, "height": 0.2})
	reject(t, map[string]any{"x": 0, "y": 0, "width": 1.1, "height": 0.2})
	reject(t, map[string]any{"x": 0.6, "y": 0, "width": 0.5, "height": 0.2})
	reject(t, map[string]any{"x": 0, "y": 0.9, "width": 0.2, "height": 0.2})
}

func TestIrisRegionsDropInvalidBounds(t *testing.T) {
	req := irisGenerateRequest{
		"model":        "image-localise",
		"image":        assetField(),
		"targetLocale": "ja-JP",
		"regions": []any{
			map[string]any{"sourceText": "Sale", "bounds": map[string]any{"x": -1, "y": 0, "width": 0.2, "height": 0.2}},
			map[string]any{"sourceText": "Shop", "bounds": map[string]any{"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}},
			map[string]any{"sourceText": "Overflow", "bounds": map[string]any{"x": 0.8, "y": 0.8, "width": 0.4, "height": 0.4}},
		},
	}
	require.Equal(t, []irisImageLocaliseRegion{
		{SourceText: "Shop", Bounds: irisImageBounds{X: 0.1, Y: 0.1, Width: 0.2, Height: 0.2}},
	}, req.regions())
	_, err := validateIrisGenerateRequest(req)
	require.NoError(t, err)
}

func TestIrisImageLocalisePrompt(t *testing.T) {
	prompt := irisImageLocalisePrompt("fr-FR", []irisTranslationPair{{Source: "Shop now", Target: "Acheter"}}, nil, "Keep the price in euros.")
	require.Contains(t, prompt, "fr-FR")
	require.Contains(t, prompt, `"Shop now" → "Acheter"`)
	require.Contains(t, prompt, "Keep the price in euros.")
	require.Contains(t, prompt, "leave logos and brand names untranslated")
}

func TestIrisImageLocalisePromptUsesRegions(t *testing.T) {
	prompt := irisImageLocalisePrompt("ja-JP", []irisTranslationPair{{Source: "Sale", Target: "セール"}}, []irisImageLocaliseRegion{{
		ID:              "r1",
		SourceText:      "50% OFF",
		Bounds:          irisImageBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1},
		ReplacementText: "50%オフ",
		Instructions:    "Keep the brand mark in English",
	}}, "Keep the logo.")
	require.Contains(t, prompt, "reviewed text regions")
	require.Contains(t, prompt, "50% OFF")
	require.Contains(t, prompt, "50%オフ")
	require.Contains(t, prompt, "Keep the brand mark in English")
	require.NotContains(t, prompt, `"Sale" → "セール"`)
	require.Contains(t, prompt, "Keep the logo.")
}

func TestParseIrisImageTextAssignsIdsAndBounds(t *testing.T) {
	parsed, err := parseIrisImageText(`{"language":"en","texts":[{"text":"50% OFF","role":"headline","bounds":{"x":0.1,"y":0.2,"width":0.3,"height":0.1}},{"text":"Shop now","role":"cta"}]}`)
	require.NoError(t, err)
	require.Equal(t, "en", parsed.Language)
	require.Len(t, parsed.Texts, 2)
	require.NotEmpty(t, parsed.Texts[0].ID)
	require.Equal(t, "50% OFF", parsed.Texts[0].Text)
	require.Equal(t, &irisImageBounds{X: 0.1, Y: 0.2, Width: 0.3, Height: 0.1}, parsed.Texts[0].Bounds)
	require.Len(t, parsed.Regions, 1)
	require.Equal(t, parsed.Texts[0].ID, parsed.Regions[0].ID)
	require.Nil(t, parsed.Texts[1].Bounds)
}

func TestSamePlaceholders(t *testing.T) {
	require.True(t, samePlaceholders("Hi {name}", "Salut {name}"))
	require.True(t, samePlaceholders("{count, plural, one {# day} other {# days}}", "{count, plural, one {# jour} other {# jours}}"))
	require.False(t, samePlaceholders("Hi {name}", "Salut"))
	require.True(t, samePlaceholders("No args", "Pas d'arguments"))
}

func TestContainsTerm(t *testing.T) {
	require.True(t, containsTerm("Start the art show", "art", false))
	require.False(t, containsTerm("Start the show", "art", false))
	require.True(t, containsTerm("Hyperlocalise Pro", "hyperlocalise", false))
	require.False(t, containsTerm("Hyperlocalise Pro", "hyperlocalise", true))
	require.True(t, containsTerm("東京の夜", "東京", false))
}

func TestNewIrisTextModelPrefersGatewayThenOpenAI(t *testing.T) {
	t.Setenv("AI_GATEWAY_API_KEY", "")
	t.Setenv("AI_GATEWAY_BASE_URL", "")
	t.Setenv("OPENAI_API_KEY", "")
	require.Nil(t, newIrisTextModel())

	t.Setenv("OPENAI_API_KEY", "sk-test")
	openai := newIrisTextModel()
	require.NotNil(t, openai)
	provider, ok := openai.(*irisGatewayProvider)
	require.True(t, ok)
	require.Equal(t, defaultIrisOpenAIBaseURL, provider.baseURL)
	require.Equal(t, "sk-test", provider.apiKey)
	require.Equal(t, defaultIrisOpenAITranslateModel, irisTranslateModelID(openai))

	t.Setenv("AI_GATEWAY_API_KEY", "gw-test")
	gateway := newIrisTextModel()
	require.NotNil(t, gateway)
	provider, ok = gateway.(*irisGatewayProvider)
	require.True(t, ok)
	require.Equal(t, defaultIrisGatewayBaseURL, provider.baseURL)
	require.Equal(t, "gw-test", provider.apiKey)
	require.Equal(t, defaultIrisTranslateModel, irisTranslateModelID(gateway))
}

func TestTranslateWithModelKeepsOnlySafeTranslations(t *testing.T) {
	text := &stubIrisText{reply: "```json\n" + `{"translations":{"title":"Nuits néon","greet":"Bonjour","cta":""}}` + "\n```"}
	api := &irisGenerationAPI{text: text}
	out, usage, err := api.translateWithModel(context.Background(), "en-US", "fr-FR",
		[]irisLocaliseMessage{{ID: "title", Text: "Neon nights", Description: "Video title"}, {ID: "greet", Text: "Hello {name}"}, {ID: "cta", Text: "Watch"}},
		[]irisGlossaryHit{{Term: "Neon", Translation: ptr("Néon"), Glossary: "Brand"}}, "Under 20 characters.")
	require.NoError(t, err)
	require.Equal(t, []irisTranslatedMessage{{ID: "title", Text: "Nuits néon", Origin: "model"}}, out)
	require.Equal(t, 10, usage.InputTokens)
	require.True(t, text.request.JSON)
	require.Equal(t, defaultIrisTranslateModel, text.request.Model)

	var prompt irisTranslatePrompt
	require.NoError(t, json.Unmarshal([]byte(text.request.User), &prompt))
	require.Equal(t, "fr-FR", prompt.TargetLocale)
	require.Equal(t, "Under 20 characters.", prompt.Guidance)
	require.Len(t, prompt.Glossary, 1)
}

func TestMergeIrisTranslationsKeepsRequestOrder(t *testing.T) {
	messages := []irisLocaliseMessage{
		{ID: "a", Text: "Hello"},
		{ID: "b", Text: "Shop now"},
		{ID: "c", Text: "Goodbye"},
		{ID: "d", Text: "Missing"},
	}
	memory := []irisMemoryMatch{
		{Source: "Hello", Target: "Bonjour", Approved: true},
		{Source: "Goodbye", Target: "Au revoir", Approved: true},
		{Source: "Shop now", Target: "Achetez", Approved: false},
	}
	model := []irisTranslatedMessage{{ID: "b", Text: "Acheter maintenant", Origin: "model"}}
	require.Equal(t, []irisTranslatedMessage{
		{ID: "a", Text: "Bonjour", Origin: "memory"},
		{ID: "b", Text: "Acheter maintenant", Origin: "model"},
		{ID: "c", Text: "Au revoir", Origin: "memory"},
	}, mergeIrisTranslations(messages, memory, model))
	require.Equal(t, []irisLocaliseMessage{{ID: "b", Text: "Shop now"}, {ID: "d", Text: "Missing"}}, pendingIrisTranslations(messages, memory))
}

func TestParseIrisTranslationsRejectsProse(t *testing.T) {
	_, err := parseIrisTranslations("Sure! Here you go.")
	require.Error(t, err)
	_, err = parseIrisTranslations(`{"other":{}}`)
	require.Error(t, err)
}

func TestIrisLocalisePairs(t *testing.T) {
	source, target, err := irisLocalePair("en_US", "fr-FR")
	require.NoError(t, err)
	require.Equal(t, "en-US", source)
	require.Equal(t, "fr-FR", target)
	_, _, err = irisLocalePair("en-US", "EN-us")
	require.Error(t, err)
	require.Error(t, validateIrisMessages([]irisLocaliseMessage{{ID: "a", Text: "x"}, {ID: "a", Text: "y"}}))
	require.Error(t, validateIrisTexts(nil))
}

func TestIrisGlossaryHitsExcludesArchivedGlossaries(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &irisGenerationAPI{pool: scope.Pool}
	irisScope := irisOrgScope{OrganizationID: scope.OrganizationID, UserID: scope.UserID, Role: "admin"}

	activeID := scope.MustGlossary(t, "", "Active Brand", "en-US")
	archivedID := scope.MustGlossary(t, "", "Archived Brand", "en-US")
	_, err := scope.Pool.Exec(t.Context(), `update glossaries set status='archived' where id=$1`, archivedID)
	require.NoError(t, err)

	activeConcept := mustGlossaryConcept(t, scope, activeID, "PublicTerm", "", "")
	mustGlossaryTerm(t, scope, activeID, activeConcept, "en-US", "PublicTerm")
	mustGlossaryTerm(t, scope, activeID, activeConcept, "fr-FR", "TermePublic")

	archivedConcept := mustGlossaryConcept(t, scope, archivedID, "SecretTerm", "", "")
	mustGlossaryTerm(t, scope, archivedID, archivedConcept, "en-US", "SecretTerm")
	mustGlossaryTerm(t, scope, archivedID, archivedConcept, "fr-FR", "TermeSecret")

	hits, err := api.glossaryHits(t.Context(), irisScope, "en-US", "fr-FR", []string{"PublicTerm SecretTerm"})
	require.NoError(t, err)
	require.Equal(t, []irisGlossaryHit{{
		Term:        "PublicTerm",
		Translation: ptr("TermePublic"),
		Glossary:    "Active Brand",
	}}, hits)

	onlyArchived, err := api.glossaryHits(t.Context(), irisScope, "en-US", "fr-FR", []string{"SecretTerm"})
	require.NoError(t, err)
	require.Empty(t, onlyArchived)
}

func TestIrisLocaliseEndpointsValidateBeforeTouchingData(t *testing.T) {
	api := newIrisGenerationFixture(t, &stubIrisProvider{})

	rec := irisRequest(api, http.MethodPost, irisTestPath+"/localise/lookup", map[string]any{"sourceLocale": "en-US", "targetLocale": "en-US", "texts": []string{"hi"}})
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/localise/lookup", map[string]any{"sourceLocale": "en-US", "targetLocale": "fr-FR", "texts": []string{"hi"}})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/localise/translate", map[string]any{"sourceLocale": "en-US", "targetLocale": "fr-FR", "messages": []any{}})
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/localise/memory", map[string]any{"sourceLocale": "en-US", "targetLocale": "fr-FR", "entries": []any{map[string]string{"source": "a", "target": "b"}}})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

func TestFalLipsyncInputAndOutput(t *testing.T) {
	model, ok := irisModelByID("sync-lipsync-2")
	require.True(t, ok)
	req := irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "video", Bytes: []byte("v"), ContentType: "video/mp4"}, {Role: "audio", Bytes: []byte("a"), ContentType: "audio/mpeg"}},
		Fields: irisGenerateRequest{"syncMode": "bounce"},
	}
	input := falInput(req)
	require.True(t, strings.HasPrefix(input["video_url"].(string), "data:video/mp4;base64,"))
	require.True(t, strings.HasPrefix(input["audio_url"].(string), "data:audio/mpeg;base64,"))
	require.Equal(t, "bounce", input["sync_mode"])
	require.Equal(t, "fal-ai/sync-lipsync/v2", falEndpoint(req))
	stem, ext, contentType := falOutputMeta(model)
	require.Equal(t, []string{"lipsync", "mp4", "video/mp4"}, []string{stem, ext, contentType})
}

func TestGatewayCompleteAndImageText(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		require.Equal(t, "Bearer key", r.Header.Get("Authorization"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"language\":\"en\",\"texts\":[{\"text\":\"50% OFF\",\"role\":\"headline\",\"bounds\":{\"x\":0.1,\"y\":0.2,\"width\":0.3,\"height\":0.1}}]}"}}],"usage":{"prompt_tokens":120,"completion_tokens":30}}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{baseURL: server.URL, apiKey: "key", httpClient: server.Client()}
	model, _ := irisModelByID("image-text")
	outputs, err := provider.Generate(context.Background(), irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("png"), ContentType: "image/png"}},
	})
	require.NoError(t, err)
	require.Len(t, outputs, 1)
	require.Equal(t, "text.json", outputs[0].Filename)
	require.Contains(t, string(outputs[0].Bytes), "50% OFF")
	require.Contains(t, string(outputs[0].Bytes), `"regions"`)
	require.Contains(t, string(outputs[0].Bytes), `"width":0.3`)
	require.Equal(t, map[string]any{"type": "json_object"}, payload["response_format"])
	require.Equal(t, 0.3, payload["temperature"])
	messages := payload["messages"].([]any)
	user := messages[1].(map[string]any)["content"].([]any)
	require.Equal(t, "image_url", user[1].(map[string]any)["type"])
}

func TestCompleteOmitsTemperatureForDirectOpenAI(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"translations\":{}}"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{
		baseURL: defaultIrisOpenAIBaseURL,
		apiKey:  "sk",
		httpClient: &http.Client{Transport: rewriteHostRoundTripper{
			host: server.URL,
			next: http.DefaultTransport,
		}},
	}
	_, err := provider.Complete(context.Background(), irisChatRequest{
		Model:  defaultIrisOpenAITranslateModel,
		System: "sys",
		User:   "{}",
		JSON:   true,
	})
	require.NoError(t, err)
	_, hasTemperature := payload["temperature"]
	require.False(t, hasTemperature)
	require.Equal(t, defaultIrisOpenAITranslateModel, payload["model"])
}

type rewriteHostRoundTripper struct {
	host string
	next http.RoundTripper
}

func (r rewriteHostRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	u, err := url.Parse(r.host)
	if err != nil {
		return nil, err
	}
	clone := req.Clone(req.Context())
	clone.URL.Scheme = u.Scheme
	clone.URL.Host = u.Host
	clone.Host = u.Host
	clone.RequestURI = ""
	return r.next.RoundTrip(clone)
}
