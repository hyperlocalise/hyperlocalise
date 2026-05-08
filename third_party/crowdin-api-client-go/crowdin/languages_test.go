package crowdin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLanguageService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, "/api/v2/languages")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": "es",
						"name": "Spanish",
						"editorCode": "es",
						"twoLettersCode": "es",
						"threeLettersCode": "spa",
						"locale": "es-ES",
						"androidCode": "es-rES",
						"osxCode": "es.lproj",
						"osxLocale": "es",
						"pluralCategoryNames": ["one"],
						"pluralRules": "(n != 1)",
						"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
						"textDirection": "ltr",
						"dialectOf": "es"
					}
				},
				{
					"data": {
						"id": "uk",
						"name": "Ukrainian",
						"editorCode": "uk",
						"twoLettersCode": "uk",
						"threeLettersCode": "ukr",
						"locale": "uk-UA",
						"androidCode": "uk-rUA",
						"osxCode": "uk.lproj",
						"osxLocale": "uk",
						"pluralCategoryNames": ["one", "few", "many", "other"],
						"pluralRules": "(n != 1)",
						"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
						"textDirection": "ltr",
						"dialectOf": "uk"
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 2
			}
		}`)
	})

	languages, _, err := client.Languages.List(context.Background(), nil)
	if err != nil {
		t.Errorf("Languages.List returned error: %v", err)
	}

	want := []*model.Language{
		{
			ID:                  "es",
			Name:                "Spanish",
			EditorCode:          "es",
			TwoLettersCode:      "es",
			ThreeLettersCode:    "spa",
			Locale:              "es-ES",
			AndroidCode:         "es-rES",
			OSXCode:             "es.lproj",
			OSXLocale:           "es",
			PluralCategoryNames: []string{"one"},
			PluralRules:         "(n != 1)",
			PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
			TextDirection:       "ltr",
			DialectOf:           "es",
		},
		{
			ID:                  "uk",
			Name:                "Ukrainian",
			EditorCode:          "uk",
			TwoLettersCode:      "uk",
			ThreeLettersCode:    "ukr",
			Locale:              "uk-UA",
			AndroidCode:         "uk-rUA",
			OSXCode:             "uk.lproj",
			OSXLocale:           "uk",
			PluralCategoryNames: []string{"one", "few", "many", "other"},
			PluralRules:         "(n != 1)",
			PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
			TextDirection:       "ltr",
			DialectOf:           "uk",
		},
	}
	if !reflect.DeepEqual(languages, want) {
		t.Errorf("Languages.List returned %+v, want %+v", languages, want)
	}
}

func TestLanguageService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Languages.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestLanguagesService_ListWithQueryParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, "/api/v2/languages?limit=1&offset=300")

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": "uk",
						"name": "Ukrainian",
						"editorCode": "uk",
						"twoLettersCode": "uk",
						"threeLettersCode": "ukr",
						"locale": "uk-UA",
						"androidCode": "uk-rUA",
						"osxCode": "uk.lproj",
						"osxLocale": "uk",
						"pluralCategoryNames": ["one", "few", "many", "other"],
						"pluralRules": "(n != 1)",
						"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
						"textDirection": "ltr",
						"dialectOf": "uk"
					}
				}
			],
			"pagination": {
				"offset": 1,
				"limit": 300
			}
		}`)
	})

	languages, resp, err := client.Languages.List(context.Background(), &model.ListOptions{Limit: 1, Offset: 300})
	if err != nil {
		t.Errorf("Languages.List returned error: %v", err)
	}

	want := []*model.Language{
		{
			ID:                  "uk",
			Name:                "Ukrainian",
			EditorCode:          "uk",
			TwoLettersCode:      "uk",
			ThreeLettersCode:    "ukr",
			Locale:              "uk-UA",
			AndroidCode:         "uk-rUA",
			OSXCode:             "uk.lproj",
			OSXLocale:           "uk",
			PluralCategoryNames: []string{"one", "few", "many", "other"},
			PluralRules:         "(n != 1)",
			PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
			TextDirection:       "ltr",
			DialectOf:           "uk",
		},
	}
	if !reflect.DeepEqual(languages, want) {
		t.Errorf("Languages.List returned %+v, want %+v", languages, want)
	}

	expectedPagination := model.Pagination{Offset: 1, Limit: 300}
	if !reflect.DeepEqual(resp.Pagination, expectedPagination) {
		t.Errorf("Languages.List returned %+v, want %+v", resp.Pagination, expectedPagination)
	}
}

func TestLanguagesService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages/uk", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testURL(t, r, "/api/v2/languages/uk")

		fmt.Fprint(w, `{
			"data": {
				"id": "uk",
				"name": "Ukrainian",
				"editorCode": "uk",
				"twoLettersCode": "uk",
				"threeLettersCode": "ukr",
				"locale": "uk-UA",
				"androidCode": "uk-rUA",
				"osxCode": "uk.lproj",
				"osxLocale": "uk",
				"pluralCategoryNames": ["one", "few", "many", "other"],
				"pluralRules": "(n != 1)",
				"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
				"textDirection": "ltr",
				"dialectOf": "uk"
			}
		}`)
	})

	language, _, err := client.Languages.Get(context.Background(), "uk")
	if err != nil {
		t.Errorf("Languages.Get returned error: %v", err)
	}

	want := &model.Language{
		ID:                  "uk",
		Name:                "Ukrainian",
		EditorCode:          "uk",
		TwoLettersCode:      "uk",
		ThreeLettersCode:    "ukr",
		Locale:              "uk-UA",
		AndroidCode:         "uk-rUA",
		OSXCode:             "uk.lproj",
		OSXLocale:           "uk",
		PluralCategoryNames: []string{"one", "few", "many", "other"},
		PluralRules:         "(n != 1)",
		PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
		TextDirection:       "ltr",
		DialectOf:           "uk",
	}
	if !reflect.DeepEqual(language, want) {
		t.Errorf("Languages.Get returned %+v, want %+v", language, want)
	}
}

func TestLanguagesService_GetByLanguageIDNotFound(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages/xx", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	language, resp, err := client.Languages.Get(context.Background(), "uk")
	if err == nil {
		t.Errorf("Languages.Get expected an error, got nil")
	}
	if language != nil {
		t.Errorf("Languages.Get expected nil, got %+v", language)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("Languages.Get expected status code %d, got %d", http.StatusNotFound, resp.StatusCode)
	}
}

func TestLanguageService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	addRequest := &model.AddLanguageRequest{
		Name:                "CustomLanguage",
		Code:                "custom",
		LocaleCode:          "custom-Uk",
		TextDirection:       "ltr",
		PluralCategoryNames: []string{"one", "other"},
		ThreeLettersCode:    "cus",
		TwoLettersCode:      "cu",
		DialectOf:           "uk",
	}

	want := &model.Language{
		ID:                  "custom",
		Name:                "CustomLanguage",
		EditorCode:          "custom",
		TwoLettersCode:      "cu",
		ThreeLettersCode:    "cus",
		Locale:              "custom-Uk",
		AndroidCode:         "custom-rUK",
		OSXCode:             "custom.lproj",
		OSXLocale:           "custom",
		PluralCategoryNames: []string{"one", "other"},
		PluralRules:         "(n != 1)",
		PluralExamples:      []string{"0, 2-999; 1.2, 2.07..."},
		TextDirection:       "ltr",
		DialectOf:           "uk",
	}

	mux.HandleFunc("/api/v2/languages", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "POST")
		testURL(t, r, "/api/v2/languages")
		var b = `{"name":"CustomLanguage","code":"custom","localeCode":"custom-Uk","textDirection":"ltr","pluralCategoryNames":["one","other"],"threeLettersCode":"cus","twoLettersCode":"cu","dialectOf":"uk"}`
		testBody(t, r, b+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": "custom",
				"name": "CustomLanguage",
				"editorCode": "custom",
				"twoLettersCode": "cu",
				"threeLettersCode": "cus",
				"locale": "custom-Uk",
				"androidCode": "custom-rUK",
				"osxCode": "custom.lproj",
				"osxLocale": "custom",
				"pluralCategoryNames": ["one", "other"],
				"pluralRules": "(n != 1)",
				"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
				"textDirection": "ltr",
				"dialectOf": "uk"
			}
		}`)
	})

	language, _, err := client.Languages.Add(context.Background(), addRequest)
	if err != nil {
		t.Errorf("Languages.Add returned error: %v", err)
	}

	if !reflect.DeepEqual(language, want) {
		t.Errorf("Languages.Add returned %+v, want %+v", language, want)
	}
}

func TestLanguagesService_AddWithEmptyRequest(t *testing.T) {
	client, _, teardown := setupClient()
	defer teardown()

	_, _, err := client.Languages.Add(context.Background(), nil)
	if !errors.Is(err, model.ErrNilRequest) {
		t.Errorf("Languages.Add expected error: %v, got: %v", model.ErrNilRequest, err)
	}
}

func TestLanguagesService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages/custom", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "PATCH")
		testURL(t, r, "/api/v2/languages/custom")

		fmt.Fprint(w, `{
			"data": {
				"id": "custom",
				"name": "TestLanguage",
				"editorCode": "custom",
				"twoLettersCode": "cu",
				"threeLettersCode": "cus",
				"locale": "custom-Uk",
				"androidCode": "custom-rUK",
				"osxCode": "custom.lproj",
				"osxLocale": "custom",
				"pluralCategoryNames": ["one", "other"],
				"pluralRules": "(n != 1)",
				"pluralExamples": ["0, 2-999; 1.2, 2.07..."],
				"textDirection": "ltr",
				"dialectOf": "uk"
			}
		}`)
	})

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "TestLanguage",
		},
	}
	language, _, err := client.Languages.Edit(context.Background(), "custom", req)
	if err != nil {
		t.Errorf("Languages.Edit returned error: %v", err)
	}
	if language.Name != "TestLanguage" {
		t.Errorf("Languages.Edit returned %+v, want %+v", language.Name, "TestLanguage")
	}
}

func TestLanguagesService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/languages/uk", func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "DELETE")
		testURL(t, r, "/api/v2/languages/uk")
		w.WriteHeader(http.StatusNoContent)
	})

	_, err := client.Languages.Delete(context.Background(), "uk")
	if err != nil {
		t.Errorf("Languages.Delete returned error: %v", err)
	}
}
