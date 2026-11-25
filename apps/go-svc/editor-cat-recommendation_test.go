package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/stretchr/testify/require"
)

func requireCatRecommendationCharged(t *testing.T, meter *stubIrisMeter, organizationID, projectID, userID string) {
	t.Helper()
	require.Len(t, meter.tokenTracks, 1)
	track := meter.tokenTracks[0]
	require.Equal(t, organizationID, track.CustomerID)
	require.Equal(t, autumn.AITokens, track.FeatureID)
	require.Equal(t, defaultIrisTranslateModel, track.ModelID)
	require.Equal(t, 10, track.InputTokens)
	require.Equal(t, 5, track.OutputTokens)
	require.Equal(t, "content_editor_ai_suggestion", track.Properties["feature"])
	require.Equal(t, userID, track.Properties["user_id"])
	require.Equal(t, projectID, track.Properties["project_id"])
}

func editorCatRecommendationRequestBody() string {
	return `{"sourcePath":"locales/en.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":"Hello"}`
}

func TestEditorCatRecommendation(t *testing.T) {
	t.Run("recommends with preloaded concordance", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		text := &stubIrisText{reply: `{"suggestion":"Bonjour","reasoning":"Courte salutation."}`}
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{text: text, meter: meter, pool: api.pool}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"),
			`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":"Hello","glossaryTerms":[{"sourceTerm":"Hello","targetTerm":"Bonjour","targetLocale":"fr-FR"}],"translationMemoryMatches":[]}`)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Recommendation struct {
				AISuggestion string `json:"aiSuggestion"`
				AIReasoning  string `json:"aiReasoning"`
			} `json:"recommendation"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, "Bonjour", body.Recommendation.AISuggestion)
		require.Equal(t, "Courte salutation.", body.Recommendation.AIReasoning)
		require.True(t, text.request.JSON)
		require.Contains(t, text.request.System, "CAT tool")
		require.Contains(t, text.request.System, "Hello => Bonjour (fr-FR)")
		require.Contains(t, text.request.User, "String key: hello")
		requireCatRecommendationCharged(t, meter, scope.OrganizationID, scope.ProjectID, scope.UserID)

		var source, operationKey, actor string
		var quantity int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            select source, operation_key, actor_user_id::text, quantity
              from usage_events
             where organization_id = $1 and source = 'content_editor_ai_suggestion'
             order by created_at desc
             limit 1`, scope.OrganizationID).Scan(&source, &operationKey, &actor, &quantity))
		require.Equal(t, "content_editor_ai_suggestion", source)
		require.Contains(t, operationKey, "editor-cat-recommendation:")
		require.Equal(t, scope.UserID, actor)
		require.Equal(t, 15, quantity)
	})

	t.Run("assembles concordance when none is preloaded", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		text := &stubIrisText{reply: `{"suggestion":"Bonjour","reasoning":"ok"}`}
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{text: text, meter: meter}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.NotContains(t, text.request.System, "Glossary terms:")
		requireCatRecommendationCharged(t, meter, scope.OrganizationID, scope.ProjectID, scope.UserID)
	})

	t.Run("rejects an invalid payload", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: meter}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"),
			`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":""}`)
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "invalid_project_payload")
		require.Empty(t, meter.tokenTracks)

		rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"),
			`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":"Hello","maxLength":0}`)
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "invalid_project_payload")
		require.Empty(t, meter.tokenTracks)
	})

	t.Run("forbids roles that cannot edit", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: &stubIrisMeter{features: true, tokens: true}}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusForbidden, rec.Code)
	})

	t.Run("requires AI features and credit", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: &stubIrisMeter{features: false, tokens: true}}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "ai_features_required")

		api.ai = &irisGenerationAPI{text: &stubIrisText{}, meter: &stubIrisMeter{features: true, tokens: false}}
		rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusPaymentRequired, rec.Code)
		require.Contains(t, rec.Body.String(), "ai_credit_exhausted")
	})

	t.Run("fails closed when the model is not configured", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.ai = &irisGenerationAPI{text: nil, meter: &stubIrisMeter{features: true, tokens: true}}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		require.Contains(t, rec.Body.String(), "provider_unavailable")
	})

	t.Run("maps model failures to ai_recommendation_failed", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{text: &stubIrisText{reply: "not json"}, meter: meter}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "ai_recommendation_failed")
		require.Empty(t, meter.tokenTracks)

		api.ai = &irisGenerationAPI{text: &stubIrisText{reply: `{"suggestion":"  ","reasoning":"ok"}`}, meter: meter}
		rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"), editorCatRecommendationRequestBody())
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "ai_recommendation_failed")
		require.Empty(t, meter.tokenTracks)
	})

	t.Run("enforces maxLength like the web route", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{text: &stubIrisText{reply: `{"suggestion":"Bonjour le monde","reasoning":"ok"}`}, meter: meter}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/recommendation"),
			`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":"Hello","maxLength":5}`)
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "ai_recommendation_failed")
		require.Empty(t, meter.tokenTracks)
	})
}

func TestRecommendTranslationZero(t *testing.T) {
	native := editorCatProject{ID: "p", Source: "native"}
	translator := editorCatActor{organizationID: "org", role: "translator"}

	t.Run("provider projects stay on Hono", func(t *testing.T) {
		api := &editorCatAPI{}
		_, _, err := api.recommendTranslation(catReq(http.MethodPost, "/", editorCatRecommendationRequestBody()), translator, editorCatProject{ID: "p", Source: "crowdin"})
		require.EqualError(t, err, "provider_cat_deferred")
	})

	t.Run("forbids readers without edit rights", func(t *testing.T) {
		api := &editorCatAPI{}
		_, _, err := api.recommendTranslation(catReq(http.MethodPost, "/", editorCatRecommendationRequestBody()), editorCatActor{organizationID: "org", role: "member"}, native)
		require.EqualError(t, err, "forbidden")
	})

	t.Run("rejects bad payloads before touching AI", func(t *testing.T) {
		api := &editorCatAPI{}
		_, _, err := api.recommendTranslation(catReq(http.MethodPost, "/", `{"sourcePath":"a.json"}`), translator, native)
		require.EqualError(t, err, "invalid_project_payload")

		_, _, err = api.recommendTranslation(catReq(http.MethodPost, "/", `{"sourcePath":"a.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":"Hello","maxLength":-1}`), translator, native)
		require.EqualError(t, err, "invalid_project_payload")
	})

	t.Run("grounds the prompt in project concordance", func(t *testing.T) {
		api := &editorCatAPI{pool: &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{"Checkout", "Selling shoes"}},
			{op: opQuery, table: [][]any{{"g1", "Checkout", "Commander", false}}},
			{op: opQuery, table: [][]any{{"e1", "m1", "Checkout", "Commander", 95, "Product"}}},
		}}}
		text := &stubIrisText{reply: `{"suggestion":"Commander","reasoning":"Terme du glossaire."}`}
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{text: text, meter: meter}
		body, status, err := api.recommendTranslation(catReq(http.MethodPost, "/", editorCatRecommendationRequestBody()), translator, native)
		require.NoError(t, err)
		require.Equal(t, 200, status)
		got := body.(map[string]any)["recommendation"].(editorCatRecommendationResult)
		require.Equal(t, "Commander", got.AISuggestion)
		require.Contains(t, text.request.System, "Project name:\nCheckout")
		require.Contains(t, text.request.System, "Project translation context:\nSelling shoes")
		require.Contains(t, text.request.System, "Checkout => Commander (fr-FR)")
		require.Contains(t, text.request.System, "Approved translation: Commander")
		requireCatRecommendationCharged(t, meter, "org", "p", "")
	})

	t.Run("prefers preloaded concordance over the database", func(t *testing.T) {
		// Only the project row is scripted: any concordance query fails the test.
		api := &editorCatAPI{pool: &scriptPool{steps: []dbStep{
			{op: opQueryRow, scan: []any{"Checkout", ""}},
		}}}
		text := &stubIrisText{reply: `{"suggestion":"Commander","reasoning":"ok"}`}
		api.ai = &irisGenerationAPI{text: text}
		req := catReq(http.MethodPost, "/", `{"sourcePath":"a.json","targetLocale":"fr-FR","sourceLocale":"en-US","key":"hello","sourceText":"Hello","glossaryTerms":[{"sourceTerm":"Hello","targetTerm":"Bonjour","targetLocale":"fr-FR"}],"translationMemoryMatches":[]}`)
		body, status, err := api.recommendTranslation(req, translator, native)
		require.NoError(t, err)
		require.Equal(t, 200, status)
		got := body.(map[string]any)["recommendation"].(editorCatRecommendationResult)
		require.Equal(t, "Commander", got.AISuggestion)
		require.Contains(t, text.request.System, "Hello => Bonjour (fr-FR)")
	})
}
