package crowdin

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMachineTranslationEnginesService_GetMT(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/mts/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		testURL(t, r, path)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"groupId": 2,
				"name": "Crowdin Translate",
				"type": "crowdin",
				"credentials": {
					"crowdin_nmt": "1",
					"crowdin_nmt_multi_translations": "1"
				},
				"supportedLanguageIds": ["en", "es", "pl"],
				"supportedLanguagePairs": {
					"en": ["de", "fr", "uk"],
					"fr": ["en"],
					"zh-CN": ["en","ja"]
				},
				"enabledLanguageIds": ["uk"],
				"enabledProjectIds": [1],
				"projectIds": [1],
				"isEnabled": true
			}
		}`)
	})

	mt, resp, err := client.MachineTranslationEngines.GetMT(context.Background(), 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.MachineTranslation{
		ID:   2,
		Name: "Crowdin Translate",
		Type: "crowdin",
		Credentials: struct {
			CrowdinNMT                  string `json:"crowdin_nmt"`
			CrowdinNMTMultiTranslations string `json:"crowdin_nmt_multi_translations"`
		}{
			CrowdinNMT:                  "1",
			CrowdinNMTMultiTranslations: "1",
		},
		SupportedLanguageIDs: []string{"en", "es", "pl"},
		SupportedLanguagePairs: map[string][]string{
			"en":    {"de", "fr", "uk"},
			"fr":    {"en"},
			"zh-CN": {"en", "ja"},
		},
		GroupID:            ToPtr(2),
		EnabledLanguageIDs: []string{"uk"},
		EnabledProjectIDs:  []int{1},
		ProjectIDs:         []int{1},
		IsEnabled:          ToPtr(true),
	}
	assert.Equal(t, expected, mt)
}

func TestMachineTranslationEnginesService_GetMT_NotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/mts/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodGet)
		http.Error(w, `{"error": {"code": 404, "message": "MTs Not Found"}}`, http.StatusNotFound)
	})

	mte, resp, err := client.MachineTranslationEngines.GetMT(context.Background(), 1)
	require.Error(t, err)

	var errResponse *model.ErrorResponse
	assert.ErrorAs(t, err, &errResponse)
	assert.Equal(t, "404 MTs Not Found", errResponse.Error())

	assert.Nil(t, mte)
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestMachineTranslationEnginesService_ListMT(t *testing.T) {
	tests := []struct {
		name   string
		opts   *model.MTListOptions
		expect string
	}{
		{
			name:   "nil options",
			opts:   nil,
			expect: "",
		},
		{
			name:   "empty options",
			opts:   &model.MTListOptions{},
			expect: "",
		},
		{
			name: "with groupId=0",
			opts: &model.MTListOptions{
				GroupID: ToPtr(0),
			},
			expect: "?groupId=0",
		},
		{
			name: "with groupId=1",
			opts: &model.MTListOptions{
				GroupID: ToPtr(1),
				ListOptions: model.ListOptions{
					Limit:  25,
					Offset: 10,
				},
			},
			expect: "?groupId=1&limit=25&offset=10",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, mux, teardown := setupClient()
			defer teardown()

			const path = "/api/v2/mts"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodGet)
				testURL(t, r, path+tt.expect)

				fmt.Fprint(w, `{
					"data": [
						{
							"data": {
								"id": 2,
								"name": "Crowdin Translate 2"
							}
						},
						{
							"data": {
								"id": 4,
								"name": "Crowdin Translate 4"
							}
						},
						{
							"data": {
								"id": 6,
								"name": "Crowdin Translate 6"
							}
						}
					],
					"pagination": {
						"offset": 0,
						"limit": 25
					}
				}`)
			})

			mte, resp, err := client.MachineTranslationEngines.ListMT(context.Background(), tt.opts)
			require.NoError(t, err)

			expected := []*model.MachineTranslation{
				{
					ID:   2,
					Name: "Crowdin Translate 2",
				},
				{
					ID:   4,
					Name: "Crowdin Translate 4",
				},
				{
					ID:   6,
					Name: "Crowdin Translate 6",
				},
			}
			assert.Equal(t, expected, mte)
			assert.Len(t, mte, 3)

			expectedPagination := model.Pagination{
				Offset: 0,
				Limit:  25,
			}
			assert.Equal(t, expectedPagination, resp.Pagination)
		})
	}
}

func TestMachineTranslationEnginesService_ListMT_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/mts", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.MachineTranslationEngines.ListMT(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestMachineTranslationEnginesService_AddMT(t *testing.T) {
	t.Skip("Not implemented correctly")

	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/mts"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testJSONBody(t, r, `{
			"name": "string",
			"type": "google",
			"credentials": {
			  	"apiKey": "string"
			},
			"groupId": 0,
			"enabledLanguageIds": ["uk"],
			"enabledProjectIds": [ 22],
			"isEnabled": "true"
		}`)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"groupId": 2,
				"name": "Crowdin Translate",
				"type": "crowdin",
				"credentials": {
					"crowdin_nmt": 1,
					"crowdin_nmt_multi_translations": 1
				},
				"supportedLanguageIds": ["en","es","pl"],
				"supportedLanguagePairs": {
					"en": ["de","fr","uk"],
					"fr": ["en"],
					"zh-CN": ["en","ja"]
				},
				"enabledLanguageIds": ["uk"],
				"enabledProjectIds": [1],
				"projectIds": [1],
				"isEnabled": true
			}
		}`)
	})

	req := &model.MTAddRequest{
		Name: "string",
		Type: "google",
		Credentials: &model.MTECredentials{
			APIKey: "string",
		},
		GroupID:            ToPtr(0),
		EnabledLanguageIDs: []string{"uk"},
		EnabledProjectIDs:  []int{22},
		IsEnabled:          ToPtr(true),
	}
	mte, resp, err := client.MachineTranslationEngines.AddMT(context.Background(), req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.MachineTranslation{
		ID:   2,
		Name: "Crowdin Translate",
		Type: "crowdin",
		Credentials: struct {
			CrowdinNMT                  string `json:"crowdin_nmt"`
			CrowdinNMTMultiTranslations string `json:"crowdin_nmt_multi_translations"`
		}{
			CrowdinNMT:                  "1",
			CrowdinNMTMultiTranslations: "1",
		},
		SupportedLanguageIDs: []string{"en", "es", "pl"},
		SupportedLanguagePairs: map[string][]string{
			"en":    {"de", "fr", "uk"},
			"fr":    {"en"},
			"zh-CN": {"en", "ja"},
		},
		GroupID:            ToPtr(2),
		EnabledLanguageIDs: []string{"uk"},
		EnabledProjectIDs:  []int{1},
		ProjectIDs:         []int{1},
		IsEnabled:          ToPtr(true),
	}
	assert.Equal(t, expected, mte)
}

func TestMachineTranslationEnginesService_AddMT_WithRequiredParams(t *testing.T) {
	tests := []struct {
		name         string
		req          *model.MTAddRequest
		expectedBody string
	}{
		{
			name: "Google Translate",
			req: &model.MTAddRequest{
				Name: "Google Translate",
				Type: "google",
				Credentials: &model.MTECredentials{
					APIKey: "api_key",
				},
			},
			expectedBody: `{"name":"Google Translate","type":"google","credentials":{"apiKey":"api_key"}}` + "\n",
		},
		{
			name: "Google AutoML Translate",
			req: &model.MTAddRequest{
				Name: "Google AutoML Translate",
				Type: "google_automl",
				Credentials: &model.MTECredentials{
					Credentials: "base64_credentials",
				},
			},
			expectedBody: `{"name":"Google AutoML Translate","type":"google_automl","credentials":{"credentials":"base64_credentials"}}` + "\n",
		},
		{
			name: "Microsoft Translate",
			req: &model.MTAddRequest{
				Name: "Microsoft Translate",
				Type: "microsoft",
				Credentials: &model.MTECredentials{
					APIKey: "api_key",
					Model:  "model",
				},
			},
			expectedBody: `{"name":"Microsoft Translate","type":"microsoft","credentials":{"apiKey":"api_key","model":"model"}}` + "\n",
		},
		{
			name: "DeepL Pro",
			req: &model.MTAddRequest{
				Name: "DeepL Pro",
				Type: "deepl",
				Credentials: &model.MTECredentials{
					APIKey:              "api_key",
					IsSystemCredentials: ToPtr(false),
				},
			},
			expectedBody: `{"name":"DeepL Pro","type":"deepl","credentials":{"apiKey":"api_key","isSystemCredentials":false}}` + "\n",
		},
		{
			name: "Amazon Translate",
			req: &model.MTAddRequest{
				Name: "Amazon Translate",
				Type: "amazon",
				Credentials: &model.MTECredentials{
					AccessKey: "access_key",
					SecretKey: "secret_key",
				},
			},
			expectedBody: `{"name":"Amazon Translate","type":"amazon","credentials":{"accessKey":"access_key","secretKey":"secret_key"}}` + "\n",
		},
		{
			name: "ModernMT Translate",
			req: &model.MTAddRequest{
				Name: "ModernMT Translate",
				Type: "modernmt",
				Credentials: &model.MTECredentials{
					APIKey: "api_key",
				},
			},
			expectedBody: `{"name":"ModernMT Translate","type":"modernmt","credentials":{"apiKey":"api_key"}}` + "\n",
		},
		{
			name: "Custom MT Translate",
			req: &model.MTAddRequest{
				Name: "Custom MT Translate",
				Type: "custom_mt",
				Credentials: &model.MTECredentials{
					URL: "https://example.com/custom",
				},
			},
			expectedBody: `{"name":"Custom MT Translate","type":"custom_mt","credentials":{"url":"https://example.com/custom"}}` + "\n",
		},
	}

	for _, tt := range tests {
		client, mux, teardown := setupClient()
		defer teardown()

		t.Run(tt.name, func(t *testing.T) {
			const path = "/api/v2/mts"
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testBody(t, r, tt.expectedBody)

				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.MachineTranslationEngines.AddMT(context.Background(), tt.req)
			require.NoError(t, err)
		})
	}
}

func TestMachineTranslationEnginesService_EditMT(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/mts/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPatch)
		testURL(t, r, path)
		testBody(t, r, `[{"op":"replace","path":"/name","value":"Crowdin Translate 2"}]`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"name": "Crowdin Translate 2"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "Crowdin Translate 2",
		},
	}
	mte, _, err := client.MachineTranslationEngines.EditMT(context.Background(), 1, req)
	require.NoError(t, err)

	expected := &model.MachineTranslation{
		ID:   2,
		Name: "Crowdin Translate 2",
	}
	assert.Equal(t, expected, mte)
}

func TestMachineTranslationEnginesService_DeleteMT(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/mts/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodDelete)
		testURL(t, r, path)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.MachineTranslationEngines.DeleteMT(context.Background(), 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)
}

func TestMachineTranslationEnginesService_Translate(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	const path = "/api/v2/mts/1/translations"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, http.MethodPost)
		testURL(t, r, path)
		testBody(t, r, `{"sourceLanguageId":"en","targetLanguageId":"de","languageRecognitionProvider":"crowdin","strings":["Welcome!","Save as...","View","About..."]}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"sourceLanguageId": "en",
				"targetLanguageId": "de",
				"strings": [
					"Welcome!",
					"Save as...",
					"View",
					"About..."
				],
				"translations": [
					"Herzlich willkommen!",
					"Speichern als...",
					"Aussicht",
					"Etwa..."
				]
			}
		}`)
	})

	req := &model.TranslateRequest{
		LanguageRecognitionProvider: model.LanguageRecognitionProviderCrowdin,
		TargetLanguageID:            "de",
		SourceLanguageID:            "en",
		Strings:                     []string{"Welcome!", "Save as...", "View", "About..."},
	}
	translate, resp, err := client.MachineTranslationEngines.Translate(context.Background(), 1, req)
	require.NoError(t, err)
	assert.NotNil(t, resp)

	expected := &model.MTTranslation{
		SourceLanguageID: "en",
		TargetLanguageID: "de",
		Strings:          []string{"Welcome!", "Save as...", "View", "About..."},
		Translations:     []string{"Herzlich willkommen!", "Speichern als...", "Aussicht", "Etwa..."},
	}
	assert.Equal(t, expected, translate)
}
