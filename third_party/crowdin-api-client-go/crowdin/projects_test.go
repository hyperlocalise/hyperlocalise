package crowdin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestProjectsService_Get(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var jsonResp = `{
		"data": {
			"id": 8,
			"type": 0,
			"userId": 6,
			"sourceLanguageId": "en",
			"targetLanguageIds": ["es"],
			"languageAccessPolicy": "moderate",
			"name": "Knowledge Base",
			"cname": "my-custom-domain.crowdin.com",
			"identifier": "1f198a4e907688bc65834a6d5a6000c3",
			"description": "Vault of all terms and their explanation",
			"visibility": "private",
			"logo": "data:image/png;base64,iVBORw0KGg",
			"publicDownloads": true,
			"createdAt": "2023-09-20T11:34:40+00:00",
			"updatedAt": "2023-09-20T11:34:40+00:00",
			"lastActivity": "2023-09-20T11:34:40+00:00",
			"sourceLanguage": {
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
			},
			"targetLanguages": [
				{
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
			],
			"webUrl": "https://crowdin.com/project/some-project",
			"translateDuplicates": 2,
			"tagsDetection": 0,
			"glossaryAccess": false,
			"isMtAllowed": false,
			"taskBasedAccessControl": false,
			"hiddenStringsProofreadersAccess": true,
			"autoSubstitution": true,
			"exportTranslatedOnly": false,
			"skipUntranslatedStrings": false,
			"exportApprovedOnly": false,
			"autoTranslateDialects": true,
			"useGlobalTm": false,
			"showTmSuggestionsDialects": true,
			"tmApprovedSuggestionsOnly": false,
			"isSuspended": false,
			"qaCheckIsActive": true,
			"qaCheckCategories": {
				"empty": true,
				"size": true,
				"tags": true,
				"spaces": true,
				"variables": true,
				"punctuation": true,
				"symbolRegister": true,
				"specialSymbols": true,
				"wrongTranslation": true,
				"spellcheck": true,
				"icu": true,
				"terms": true,
				"duplicate": true,
				"ftl": true,
				"android": true
			},
			"qaChecksIgnorableCategories": {
				"empty": false,
				"size": true,
				"tags": true,
				"spaces": true,
				"variables": true,
				"punctuation": true,
				"symbolRegister": true,
				"specialSymbols": true,
				"wrongTranslation": true,
				"spellcheck": true,
				"icu": false,
				"terms": true,
				"duplicate": false,
				"ftl": false,
				"android": true
			},
			"languageMapping": {
				"uk": {
					"name": "Ukrainian",
					"two_letters_code": "ua",
					"three_letters_code": "ukr",
					"locale": "uk-UA",
					"locale_with_underscore": "uk_UA",
					"android_code": "uk-rUA",
					"osx_code": "ua.lproj",
					"osx_locale": "ua"
				}
			},
			"notificationSettings": {
				"translatorNewStrings": true,
				"managerNewStrings": false,
				"managerLanguageCompleted": false
			},
			"defaultTmId": 1,
			"defaultGlossaryId": 1,
			"assignedTms": {
				"1": {
					"priority": 1
				}
			},
			"assignedGlossaries": [
				2
			],
			"tmPenalties": {
				"autoSubstitution": 1,
				"tmPriority": {
					"priority": 2,
					"penalty": 1
				},
				"multipleTranslations": 1,
				"timeSinceLastUsage": {
					"months": 2,
					"penalty": 1
				},
				"timeSinceLastModified": {
					"months": 2,
					"penalty": 1
				}
			},
			"normalizePlaceholder": false,
			"tmPreTranslate": {
				"enabled": true,
				"autoApproveOption": "all",
				"minimumMatchRatio": "perfect"
			},
			"mtPreTranslate": {
				"enabled": true,
				"mts": [
					{
						"mtId": 1,
						"languageIds": ["uk"]
					}
				]
			},
			"saveMetaInfoInSource": true,
			"skipUntranslatedFiles": false,
			"inContext": true,
			"inContextProcessHiddenStrings": true,
			"inContextPseudoLanguageId": "uk",
			"inContextPseudoLanguage": {
				"id": "uk",
				"name": "Ukrainian",
				"editorCode": "uk",
				"twoLettersCode": "uk",
				"threeLettersCode": "ukr",
				"locale": "uk-UA",
				"androidCode": "uk-rUA",
				"osxCode": "uk.lproj",
				"osxLocale": "uk",
				"pluralCategoryNames": [
					"one",
					"few",
					"many",
					"other"
				],
				"pluralRules": "((n%10==1 && n%100!=11) ? 0 : ((n%10 >= 2 && n%10 <=4 && (n%100 < 12 || n%100 > 14)) ? 1 : ((n%10 == 0 || (n%10 >= 5 && n%10 <=9)) || (n%100 >= 11 && n%100 <= 14)) ? 2 : 3))",
				"pluralExamples": [
					"1, 21, 31, 41, 51, 61, 71, 81...",
					"2-4, 22-24, 32-34, 42-44, 52-54, 62...",
					"0, 5-19, 100, 1000, 10000...",
					"0.0-0.9, 1.1-1.6, 10.0, 100.0..."
				],
				"textDirection": "ltr",
				"dialectOf": null
			},
			"tmContextType": "segmentContext"
		}
	}`

	mux.HandleFunc("/api/v2/projects/8", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v2/projects/8", r.RequestURI)

		fmt.Fprint(w, jsonResp)
	})

	project, _, err := client.Projects.Get(context.Background(), 8)
	require.NoError(t, err)

	expectedProjects := &model.Project{
		ID:                   8,
		Type:                 0,
		UserID:               6,
		SourceLanguageID:     "en",
		TargetLanguageIDs:    []string{"es"},
		LanguageAccessPolicy: "moderate",
		Name:                 "Knowledge Base",
		Cname:                "my-custom-domain.crowdin.com",
		Identifier:           "1f198a4e907688bc65834a6d5a6000c3",
		Description:          "Vault of all terms and their explanation",
		Visibility:           "private",
		Logo:                 "data:image/png;base64,iVBORw0KGg",
		PublicDownloads:      true,
		CreatedAt:            "2023-09-20T11:34:40+00:00",
		UpdatedAt:            "2023-09-20T11:34:40+00:00",
		LastActivity:         "2023-09-20T11:34:40+00:00",
		SourceLanguage: &model.Language{
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
		TargetLanguages: []*model.Language{
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
		},
		WebURL:                          "https://crowdin.com/project/some-project",
		TranslateDuplicates:             2,
		TagsDetection:                   0,
		GlossaryAccess:                  false,
		IsMTAllowed:                     false,
		TaskBasedAccessControl:          false,
		HiddenStringsProofreadersAccess: true,
		AutoSubstitution:                true,
		ExportTranslatedOnly:            false,
		SkipUntranslatedStrings:         false,
		ExportApprovedOnly:              false,
		AutoTranslateDialects:           true,
		UseGlobalTM:                     false,
		ShowTMSuggestionsDialects:       true,
		TmApprovedSuggestionsOnly:       false,
		IsSuspended:                     false,
		QACheckIsActive:                 true,
		QACheckCategories: map[string]bool{
			"empty":            true,
			"size":             true,
			"tags":             true,
			"spaces":           true,
			"variables":        true,
			"punctuation":      true,
			"symbolRegister":   true,
			"specialSymbols":   true,
			"wrongTranslation": true,
			"spellcheck":       true,
			"icu":              true,
			"terms":            true,
			"duplicate":        true,
			"ftl":              true,
			"android":          true,
		},
		QAChecksIgnorableCategories: map[string]bool{
			"empty":            false,
			"size":             true,
			"tags":             true,
			"spaces":           true,
			"variables":        true,
			"punctuation":      true,
			"symbolRegister":   true,
			"specialSymbols":   true,
			"wrongTranslation": true,
			"spellcheck":       true,
			"icu":              false,
			"terms":            true,
			"duplicate":        false,
			"ftl":              false,
			"android":          true,
		},
		LanguageMapping: map[string]model.LanguageMapping{
			"uk": {
				Name:                 "Ukrainian",
				TwoLettersCode:       "ua",
				ThreeLettersCode:     "ukr",
				Locale:               "uk-UA",
				LocaleWithUnderscore: "uk_UA",
				AndroidCode:          "uk-rUA",
				OSXCode:              "ua.lproj",
				OSXLocale:            "ua",
			},
		},
		NotificationSettings: &model.NotificationSettings{
			TranslatorNewStrings:     ToPtr(true),
			ManagerNewStrings:        ToPtr(false),
			ManagerLanguageCompleted: ToPtr(false),
		},
		DefaultTMID:       1,
		DefaultGlossaryID: 1,
		AssignedTMs: map[int]map[string]int{
			1: {
				"priority": 1,
			},
		},
		AssignedGlossaries: []int{2},
		TMPenalties: map[string]interface{}{
			"autoSubstitution": float64(1),
			"tmPriority": map[string]interface{}{
				"priority": float64(2),
				"penalty":  float64(1),
			},
			"multipleTranslations": float64(1),
			"timeSinceLastUsage": map[string]interface{}{
				"months":  float64(2),
				"penalty": float64(1),
			},
			"timeSinceLastModified": map[string]interface{}{
				"months":  float64(2),
				"penalty": float64(1),
			},
		},
		NormalizePlaceholder: false,
		TMPreTranslate: &model.ProjectTMPreTranslate{
			Enabled:           ToPtr(true),
			AutoApproveOption: "all",
			MinimumMatchRatio: "perfect",
		},
		MTPreTranslate: &model.ProjectMTPreTranslate{
			Enabled: ToPtr(true),
			MTs: []model.ProjectMTs{
				{
					MTID:        1,
					LanguageIDs: []string{"uk"},
				},
			},
		},
		SaveMetaInfoInSource:          true,
		SkipUntranslatedFiles:         false,
		InContext:                     true,
		InContextProcessHiddenStrings: true,
		InContextPseudoLanguageID:     "uk",
		InContextPseudoLanguage: &model.Language{
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
			PluralRules:         "((n%10==1 && n%100!=11) ? 0 : ((n%10 >= 2 && n%10 <=4 && (n%100 < 12 || n%100 > 14)) ? 1 : ((n%10 == 0 || (n%10 >= 5 && n%10 <=9)) || (n%100 >= 11 && n%100 <= 14)) ? 2 : 3))",
			PluralExamples:      []string{"1, 21, 31, 41, 51, 61, 71, 81...", "2-4, 22-24, 32-34, 42-44, 52-54, 62...", "0, 5-19, 100, 1000, 10000...", "0.0-0.9, 1.1-1.6, 10.0, 100.0..."},
			TextDirection:       "ltr",
			DialectOf:           "",
		},
		TMContextType: "segmentContext",
	}
	assert.Equal(t, expectedProjects, project)
}

func TestProjectsService_Get_Enterprise(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	var jsonResp = `{
		"data": {
			"id": 9,
			"groupId": 4,
			"type": 0,
			"userId": 6,
			"sourceLanguageId": "en",
			"targetLanguageIds": ["es"],
			"name": "Knowledge Base",
			"identifier": "1f198a4e907688bc65834a6d5a6000c3",
			"description": "Vault of all terms and their explanation",
			"logo": "data:image/png;base64,iVBORw0KGgo",
			"background": "data:image/png;base64,iVBORw0KGgo",
			"isExternal": false,
			"externalType": "proofread",
			"workflowId": 3,
			"hasCrowdsourcing": false,
			"publicDownloads": true,
			"createdAt": "2023-09-20T11:34:40+00:00",
			"updatedAt": "2023-09-20T11:34:40+00:00",
			"lastActivity": "2023-09-20T11:34:40+00:00",
			"sourceLanguage": {
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
			},
			"targetLanguages": [
				{
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
			],
			"webUrl": "https://example.crowdin.com/u/projects/123",
			"fields": {
				"fieldSlug": "fieldValue"
			},
			"clientOrganizationId": 52760,
			"translateDuplicates": 1,
			"tagsDetection": 0,
			"glossaryAccess": false,
			"isMtAllowed": false,
			"taskBasedAccessControl": false,
			"hiddenStringsProofreadersAccess": true,
			"autoSubstitution": true,
			"showTmSuggestionsDialects": true,
			"tmApprovedSuggestionsOnly": false,
			"exportTranslatedOnly": false,
			"skipUntranslatedStrings": false,
			"exportWithMinApprovalsCount": 0,
			"exportStringsThatPassedWorkflow": true,
			"autoTranslateDialects": true,
			"normalizePlaceholder": false,
			"isSuspended": false,
			"qaCheckIsActive": true,
			"qaApprovalsCount": 1,
			"qaCheckCategories": {
				"empty": true,
				"size": true,
				"tags": true,
				"spaces": true,
				"variables": true,
				"punctuation": true,
				"symbolRegister": true,
				"specialSymbols": true,
				"wrongTranslation": true,
				"spellcheck": true,
				"icu": true,
				"terms": true,
				"duplicate": true,
				"ftl": true,
				"android": true
			},
			"qaChecksIgnorableCategories": {
				"empty": false,
				"size": true,
				"tags": true,
				"spaces": true,
				"variables": true,
				"punctuation": true,
				"symbolRegister": true,
				"specialSymbols": true,
				"wrongTranslation": true,
				"spellcheck": true,
				"icu": false,
				"terms": true,
				"duplicate": false,
				"ftl": false,
				"android": true
			},
			"customQaCheckIds": [
				1
			],
			"languageMapping": {
				"uk": {
				"name": "Ukrainian",
				"two_letters_code": "ua",
				"three_letters_code": "ukr",
				"locale": "uk-UA",
				"locale_with_underscore": "uk_UA",
				"android_code": "uk-rUA",
				"osx_code": "ua.lproj",
				"osx_locale": "ua"
				}
			},
			"delayedWorkflowStart": false,
			"notificationSettings": {
				"translatorNewStrings": true,
				"managerNewStrings": false,
				"managerLanguageCompleted": false
			},
			"defaultTmId": 1,
			"defaultGlossaryId": 1,
			"assignedTms": {
				"1": {
					"priority": 1
				}
			},
			"assignedGlossaries": [
				2
			],
			"tmPenalties": {
				"autoSubstitution": 1,
				"tmPriority": {
					"priority": 2,
					"penalty": 1
				},
				"multipleTranslations": 1,
				"timeSinceLastUsage": {
					"months": 2,
					"penalty": 1
				},
				"timeSinceLastModified": {
					"months": 2,
					"penalty": 1
				}
			},
			"saveMetaInfoInSource": true,
			"skipUntranslatedFiles": false,
			"inContext": true,
			"inContextProcessHiddenStrings": true,
			"inContextPseudoLanguageId": "uk",
			"inContextPseudoLanguage": {
				"id": "uk",
				"name": "Ukrainian",
				"editorCode": "uk",
				"twoLettersCode": "uk",
				"threeLettersCode": "ukr",
				"locale": "uk-UA",
				"androidCode": "uk-rUA",
				"osxCode": "uk.lproj",
				"osxLocale": "uk",
				"pluralCategoryNames": [
					"one",
					"few",
					"many",
					"other"
				],
				"pluralRules": "((n%10==1 && n%100!=11) ? 0 : ((n%10 >= 2 && n%10 <=4 && (n%100 < 12 || n%100 > 14)) ? 1 : ((n%10 == 0 || (n%10 >= 5 && n%10 <=9)) || (n%100 >= 11 && n%100 <= 14)) ? 2 : 3))",
				"pluralExamples": [
					"1, 21, 31, 41, 51, 61, 71, 81...",
					"2-4, 22-24, 32-34, 42-44, 52-54, 62...",
					"0, 5-19, 100, 1000, 10000...",
					"0.0-0.9, 1.1-1.6, 10.0, 100.0..."
				],
				"textDirection": "ltr",
				"dialectOf": null
			},
			"tmContextType": "segmentContext"
		}
	}`

	mux.HandleFunc("/api/v2/projects/8", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v2/projects/8", r.RequestURI)

		fmt.Fprint(w, jsonResp)
	})

	project, _, err := client.Projects.Get(context.Background(), 8)
	require.NoError(t, err)

	expectedProjects := &model.Project{
		ID:                9,
		GroupID:           4,
		Type:              0,
		UserID:            6,
		SourceLanguageID:  "en",
		TargetLanguageIDs: []string{"es"},
		Name:              "Knowledge Base",
		Identifier:        "1f198a4e907688bc65834a6d5a6000c3",
		Description:       "Vault of all terms and their explanation",
		Logo:              "data:image/png;base64,iVBORw0KGgo",
		IsExternal:        false,
		ExternalType:      "proofread",
		WorkflowID:        3,
		HasCrowdsourcing:  false,
		PublicDownloads:   true,
		CreatedAt:         "2023-09-20T11:34:40+00:00",
		UpdatedAt:         "2023-09-20T11:34:40+00:00",
		LastActivity:      "2023-09-20T11:34:40+00:00",
		SourceLanguage: &model.Language{
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
		TargetLanguages: []*model.Language{
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
		},
		WebURL:                          "https://example.crowdin.com/u/projects/123",
		Fields:                          map[string]any{"fieldSlug": "fieldValue"},
		ClientOrganizationID:            52760,
		TranslateDuplicates:             1,
		TagsDetection:                   0,
		GlossaryAccess:                  false,
		IsMTAllowed:                     false,
		TaskBasedAccessControl:          false,
		HiddenStringsProofreadersAccess: true,
		AutoSubstitution:                true,
		ShowTMSuggestionsDialects:       true,
		TmApprovedSuggestionsOnly:       false,
		ExportTranslatedOnly:            false,
		SkipUntranslatedStrings:         false,
		ExportWithMinApprovalsCount:     0,
		ExportStringsThatPassedWorkflow: true,
		AutoTranslateDialects:           true,
		NormalizePlaceholder:            false,
		IsSuspended:                     false,
		QACheckIsActive:                 true,
		QAApprovalsCount:                1,
		QACheckCategories: map[string]bool{
			"empty":            true,
			"size":             true,
			"tags":             true,
			"spaces":           true,
			"variables":        true,
			"punctuation":      true,
			"symbolRegister":   true,
			"specialSymbols":   true,
			"wrongTranslation": true,
			"spellcheck":       true,
			"icu":              true,
			"terms":            true,
			"duplicate":        true,
			"ftl":              true,
			"android":          true,
		},
		QAChecksIgnorableCategories: map[string]bool{
			"empty":            false,
			"size":             true,
			"tags":             true,
			"spaces":           true,
			"variables":        true,
			"punctuation":      true,
			"symbolRegister":   true,
			"specialSymbols":   true,
			"wrongTranslation": true,
			"spellcheck":       true,
			"icu":              false,
			"terms":            true,
			"duplicate":        false,
			"ftl":              false,
			"android":          true,
		},
		CustomQACheckIDs: []int{1},
		LanguageMapping: map[string]model.LanguageMapping{
			"uk": {
				Name:                 "Ukrainian",
				TwoLettersCode:       "ua",
				ThreeLettersCode:     "ukr",
				Locale:               "uk-UA",
				LocaleWithUnderscore: "uk_UA",
				AndroidCode:          "uk-rUA",
				OSXCode:              "ua.lproj",
				OSXLocale:            "ua",
			},
		},
		DelayedWorkflowStart: false,
		NotificationSettings: &model.NotificationSettings{
			TranslatorNewStrings:     ToPtr(true),
			ManagerNewStrings:        ToPtr(false),
			ManagerLanguageCompleted: ToPtr(false),
		},
		DefaultTMID:       1,
		DefaultGlossaryID: 1,
		AssignedTMs: map[int]map[string]int{
			1: {
				"priority": 1,
			},
		},
		AssignedGlossaries: []int{2},
		TMPenalties: map[string]interface{}{
			"autoSubstitution": float64(1),
			"tmPriority": map[string]interface{}{
				"priority": float64(2),
				"penalty":  float64(1),
			},
			"multipleTranslations": float64(1),
			"timeSinceLastUsage": map[string]interface{}{
				"months":  float64(2),
				"penalty": float64(1),
			},
			"timeSinceLastModified": map[string]interface{}{
				"months":  float64(2),
				"penalty": float64(1),
			},
		},
		SaveMetaInfoInSource:          true,
		SkipUntranslatedFiles:         false,
		InContext:                     true,
		InContextProcessHiddenStrings: true,
		InContextPseudoLanguageID:     "uk",
		InContextPseudoLanguage: &model.Language{
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
			PluralRules:         "((n%10==1 && n%100!=11) ? 0 : ((n%10 >= 2 && n%10 <=4 && (n%100 < 12 || n%100 > 14)) ? 1 : ((n%10 == 0 || (n%10 >= 5 && n%10 <=9)) || (n%100 >= 11 && n%100 <= 14)) ? 2 : 3))",
			PluralExamples:      []string{"1, 21, 31, 41, 51, 61, 71, 81...", "2-4, 22-24, 32-34, 42-44, 52-54, 62...", "0, 5-19, 100, 1000, 10000...", "0.0-0.9, 1.1-1.6, 10.0, 100.0..."},
			TextDirection:       "ltr",
			DialectOf:           "",
		},
		TMContextType: "segmentContext",
	}
	assert.Equal(t, expectedProjects, project)
}

func TestProjectsService_List(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v2/projects", r.RequestURI)

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 1,
						"fields": {
							"key_1": "value",
							"key_2": 2,
							"key_3": true,
							"key_4": ["en", "uk"]
						}
					}
				},
				{
					"data": {
						"id": 2,
						"fields": []
					}
				},
				{
					"data": {
						"id": 3,
						"fields": {}
					}
				},
				{
					"data": {
						"id": 4,
						"fields": null
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`)
	})

	projects, resp, err := client.Projects.List(context.Background(), nil)
	require.NoError(t, err)

	expectedProjects := []*model.Project{
		{ID: 1, Fields: map[string]any{
			"key_1": "value",
			"key_2": float64(2),
			"key_3": true,
			"key_4": []any{"en", "uk"},
		}},
		{ID: 2, Fields: []any{}},
		{ID: 3, Fields: map[string]any{}},
		{ID: 4, Fields: nil},
	}
	assert.Len(t, projects, 4)
	assert.Equal(t, expectedProjects, projects)

	expectedPagination := model.Pagination{Offset: 10, Limit: 25}
	assert.NotNil(t, resp)
	assert.Equal(t, expectedPagination, resp.Pagination)
}

func TestProjectsService_List_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Projects.List(context.Background(), nil)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestProjectsService_List_CheckQueryParams(t *testing.T) {
	const url = "/api/v2/projects"
	cases := []struct {
		name   string
		opt    *model.ProjectsListOptions
		expect string
	}{
		{
			name:   "Without options",
			opt:    nil,
			expect: url,
		},
		{
			name: "Order by",
			opt: &model.ProjectsListOptions{
				OrderBy: "createdAt desc,name,id",
			},
			expect: url + "?orderBy=createdAt+desc%2Cname%2Cid",
		},
		{
			name: "User ID",
			opt: &model.ProjectsListOptions{
				UserID: 1,
			},
			expect: url + "?userId=1",
		},
		{
			name: "Has manager access",
			opt: &model.ProjectsListOptions{
				HasManagerAccess: ToPtr(1),
			},
			expect: url + "?hasManagerAccess=1",
		},
		{
			name: "Not accepted value",
			opt: &model.ProjectsListOptions{
				HasManagerAccess: ToPtr(100),
			},
			expect: url,
		},
		{
			name: "Type",
			opt: &model.ProjectsListOptions{
				Type: ToPtr(1),
			},
			expect: url + "?type=1",
		},
		{
			name: "Not accepted type",
			opt: &model.ProjectsListOptions{
				Type: ToPtr(100),
			},
			expect: url,
		},
		{
			name: "List with limit and offset",
			opt: &model.ProjectsListOptions{
				ListOptions: model.ListOptions{Limit: 10, Offset: 20},
			},
			expect: url + "?limit=10&offset=20",
		},
		{
			name: "All query params",
			opt: &model.ProjectsListOptions{
				OrderBy:          "createdAt desc,name,id",
				UserID:           1,
				HasManagerAccess: ToPtr(0),
				ListOptions:      model.ListOptions{Limit: 10, Offset: 20},
			},
			expect: url + "?hasManagerAccess=0&limit=10&offset=20&orderBy=createdAt+desc%2Cname%2Cid&userId=1",
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			client, mux, teardown := setupClient()
			defer teardown()

			mux.HandleFunc("/api/v2/projects", func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodGet, r.Method)
				assert.Equal(t, tt.expect, r.RequestURI)

				fmt.Fprint(w, `{
					"data": []
				}`)
			})

			_, _, err := client.Projects.List(context.Background(), tt.opt)
			require.NoError(t, err)
		})
	}
}

func TestProjectsService_Add(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectReq := &model.ProjectsAddRequest{
		Name:                            "Knowledge Base",
		SourceLanguageID:                "en",
		Identifier:                      "1f198a4e907688bc65834a6d5a6000c3",
		TargetLanguageIDs:               []string{"es"},
		Visibility:                      "private",
		LangAccessPolicy:                "moderate",
		Cname:                           "my-custom-domain.crowdin.com",
		Description:                     "Articles and tutorials",
		TagsDetection:                   ToPtr(2),
		IsMTAllowed:                     ToPtr(false),
		TaskBasedAccessControl:          ToPtr(false),
		AutoSubstitution:                ToPtr(false),
		AutoTranslateDialects:           ToPtr(true),
		PublicDownloads:                 ToPtr(false),
		HiddenStringsProofreadersAccess: ToPtr(false),
		UseGlobalTM:                     ToPtr(false),
		ShowTMSuggestionsDialects:       ToPtr(true),
		TmApprovedSuggestionsOnly:       ToPtr(false),
		SkipUntranslatedStrings:         ToPtr(false),
		ExportApprovedOnly:              ToPtr(false),
		QACheckIsActive:                 ToPtr(false),
		QACheckCategories: map[string]bool{
			"empty":            true,
			"size":             true,
			"tags":             true,
			"spaces":           true,
			"variables":        true,
			"punctuation":      true,
			"symbolRegister":   true,
			"specialSymbols":   true,
			"wrongTranslation": true,
			"spellcheck":       true,
			"icu":              true,
			"terms":            true,
			"duplicate":        true,
			"ftl":              true,
			"android":          true,
		},
		QAChecksIgnorableCategories: map[string]bool{
			"empty":            true,
			"size":             true,
			"tags":             true,
			"spaces":           true,
			"variables":        true,
			"punctuation":      true,
			"symbolRegister":   true,
			"specialSymbols":   true,
			"wrongTranslation": true,
			"spellcheck":       true,
			"icu":              true,
			"terms":            true,
			"duplicate":        true,
			"ftl":              true,
			"android":          true,
		},
		LanguageMapping: map[string]model.LanguageMapping{
			"uk": {
				Name:                 "Ukrainian",
				TwoLettersCode:       "ua",
				ThreeLettersCode:     "ukr",
				Locale:               "uk-UA",
				LocaleWithUnderscore: "uk_UA",
				AndroidCode:          "uk-rUA",
				OSXCode:              "ua.lproj",
				OSXLocale:            "ua",
			},
		},
		GlossaryAccess:       ToPtr(false),
		NormalizePlaceholder: ToPtr(false),
		NotificationSettings: &model.NotificationSettings{
			TranslatorNewStrings:     ToPtr(false),
			ManagerNewStrings:        ToPtr(true),
			ManagerLanguageCompleted: ToPtr(true),
		},
		TMPreTranslate: &model.ProjectTMPreTranslate{
			Enabled:           ToPtr(true),
			AutoApproveOption: "all",
			MinimumMatchRatio: "perfect",
		},
		MTPreTranslate: &model.ProjectMTPreTranslate{
			Enabled: ToPtr(true),
			MTs: []model.ProjectMTs{
				{
					MTID:        1,
					LanguageIDs: []string{"uk"},
				},
			},
		},
		AiPreTranslate: &model.ProjectAiPreTranslate{
			Enabled: ToPtr(true),
			AiPrompts: []model.ProjectAiPrompt{
				{
					AiPromptID:  1,
					LanguageIDs: []string{"uk"},
				},
			},
		},
		AssistActionAiPromptID:        1,
		DefaultTMID:                   1,
		DefaultGlossaryID:             1,
		SaveMetaInfoInSource:          ToPtr(true),
		Type:                          ToPtr(0),
		SkipUntranslatedFiles:         ToPtr(false),
		InContext:                     ToPtr(true),
		InContextProcessHiddenStrings: ToPtr(true),
		InContextPseudoLanguageID:     "de",
		TMContextType:                 "segmentContext",
		Fields: map[string]any{
			"key_1": "value_1",
			"key_2": 2,
			"key_3": true,
			"key_4": []string{"en", "es"},
		},
	}

	mux.HandleFunc("/api/v2/projects", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v2/projects", r.RequestURI)

		expectedReqBody := `{
			"name": "Knowledge Base",
			"identifier": "1f198a4e907688bc65834a6d5a6000c3",
			"sourceLanguageId": "en",
			"targetLanguageIds": [
			  "es"
			],
			"visibility": "private",
			"languageAccessPolicy": "moderate",
			"cname": "my-custom-domain.crowdin.com",
			"description": "Articles and tutorials",
			"tagsDetection": 2,
			"isMtAllowed": false,
			"taskBasedAccessControl": false,
			"autoSubstitution": false,
			"autoTranslateDialects": true,
			"publicDownloads": false,
			"hiddenStringsProofreadersAccess": false,
			"useGlobalTm": false,
			"showTmSuggestionsDialects": true,
			"tmApprovedSuggestionsOnly": false,
			"skipUntranslatedStrings": false,
			"exportApprovedOnly": false,
			"qaCheckIsActive": false,
			"qaCheckCategories": {
			  "android": true,
			  "duplicate": true,
			  "empty": true,
			  "ftl": true,
			  "icu": true,
			  "punctuation": true,
			  "size": true,
			  "spaces": true,
			  "specialSymbols": true,
			  "spellcheck": true,
			  "symbolRegister": true,
			  "tags": true,
			  "terms": true,
			  "variables": true,
			  "wrongTranslation": true
			},
			"qaChecksIgnorableCategories": {
			  "android": true,
			  "duplicate": true,
			  "empty": true,
			  "ftl": true,
			  "icu": true,
			  "punctuation": true,
			  "size": true,
			  "spaces": true,
			  "specialSymbols": true,
			  "spellcheck": true,
			  "symbolRegister": true,
			  "tags": true,
			  "terms": true,
			  "variables": true,
			  "wrongTranslation": true
			},
			"languageMapping": {
			  "uk": {
				"android_code": "uk-rUA",
				"locale": "uk-UA",
				"locale_with_underscore": "uk_UA",
				"name": "Ukrainian",
				"osx_code": "ua.lproj",
				"osx_locale": "ua",
				"three_letters_code": "ukr",
				"two_letters_code": "ua"
			  }
			},
			"glossaryAccess": false,
			"normalizePlaceholder": false,
			"notificationSettings": {
			  "translatorNewStrings": false,
			  "managerNewStrings": true,
			  "managerLanguageCompleted": true
			},
			"tmContextType": "segmentContext",
			"tmPreTranslate": {
			  "enabled": true,
			  "autoApproveOption": "all",
			  "minimumMatchRatio": "perfect"
			},
			"mtPreTranslate": {
			  "enabled": true,
			  "mts": [
				{
				  "mtId": 1,
				  "languageIds": [
					"uk"
				  ]
				}
			  ]
			},
			"aiPreTranslate": {
			  "enabled": true,
			  "aiPrompts": [
			    {
				  "aiPromptId": 1,
				  "languageIds": [
				    "uk"
				  ]
			    } 
			  ]
			},
			"assistActionAiPromptId": 1,
			"defaultTmId": 1,
			"defaultGlossaryId": 1,
			"saveMetaInfoInSource": true,
			"type": 0,
			"skipUntranslatedFiles": false,
			"inContext": true,
			"inContextProcessHiddenStrings": true,
			"inContextPseudoLanguageId": "de",
			"fields": {
			  "key_1": "value_1",
			  "key_2": 2,
			  "key_3": true,
			  "key_4": ["en", "es"]
			}
		}`
		testJSONBody(t, r, expectedReqBody)

		err := json.NewEncoder(w).Encode(&model.ProjectsGetResponse{
			Data: &model.Project{
				ID:                          9,
				Name:                        projectReq.Name,
				Identifier:                  projectReq.Identifier,
				SourceLanguageID:            projectReq.SourceLanguageID,
				TargetLanguageIDs:           projectReq.TargetLanguageIDs,
				Description:                 projectReq.Description,
				TagsDetection:               *projectReq.TagsDetection,
				QACheckIsActive:             *projectReq.QACheckIsActive,
				QACheckCategories:           projectReq.QACheckCategories,
				QAChecksIgnorableCategories: projectReq.QAChecksIgnorableCategories,
				LanguageMapping:             projectReq.LanguageMapping,
				NotificationSettings:        projectReq.NotificationSettings,
				DefaultTMID:                 projectReq.DefaultTMID,
				DefaultGlossaryID:           projectReq.DefaultGlossaryID,
			},
		})
		require.NoError(t, err)
	})

	project, resp, err := client.Projects.Add(context.Background(), projectReq)
	require.NoError(t, err)

	require.NotNil(t, project)
	assert.Equal(t, 9, project.ID)
	assert.Equal(t, projectReq.Name, project.Name)
	assert.Equal(t, projectReq.Identifier, project.Identifier)
	assert.Equal(t, projectReq.SourceLanguageID, project.SourceLanguageID)
	assert.Equal(t, projectReq.TargetLanguageIDs, project.TargetLanguageIDs)
	assert.Equal(t, projectReq.Description, project.Description)
	assert.Equal(t, *projectReq.TagsDetection, project.TagsDetection)
	assert.Equal(t, *projectReq.QACheckIsActive, project.QACheckIsActive)
	assert.Equal(t, projectReq.QACheckCategories, project.QACheckCategories)
	assert.Equal(t, projectReq.QAChecksIgnorableCategories, project.QAChecksIgnorableCategories)
	assert.Equal(t, projectReq.LanguageMapping, project.LanguageMapping)
	assert.Equal(t, projectReq.NotificationSettings, project.NotificationSettings)
	assert.Equal(t, projectReq.DefaultTMID, project.DefaultTMID)
	assert.Equal(t, projectReq.DefaultGlossaryID, project.DefaultGlossaryID)

	assert.NotNil(t, resp)
}

func TestProjectsService_Add_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v2/projects", r.RequestURI)

		expectedReqBody := `{
			"name": "Knowledge Base",
			"sourceLanguageId": "en"
		}`
		testJSONBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{}`)
	})

	_, _, err := client.Projects.Add(context.Background(), &model.ProjectsAddRequest{
		Name:             "Knowledge Base",
		SourceLanguageID: "en",
	})
	require.NoError(t, err)
}

func TestProjectsService_Edit(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	projectID := 8

	mux.HandleFunc(fmt.Sprintf("/api/v2/projects/%d", projectID), func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPatch, r.Method)
		assert.Equal(t, fmt.Sprintf("/api/v2/projects/%d", projectID), r.RequestURI)

		req := `[{"op":"replace","path":"/name","value":"New Name"}]` + "\n"
		testBody(t, r, req)

		fmt.Fprint(w, `{
			"data": {
				"id": 8,
				"name": "New Name",
				"defaultTmId": 2,
				"defaultGlossaryId": 2
			}
		}`)
	})

	updateReq := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/name",
			Value: "New Name",
		},
	}
	project, resp, err := client.Projects.Edit(context.Background(), projectID, updateReq)
	require.NoError(t, err)

	expectedProject := &model.Project{
		ID:                8,
		Name:              "New Name",
		DefaultTMID:       2,
		DefaultGlossaryID: 2,
	}
	assert.Equal(t, expectedProject, project)
	assert.NotNil(t, resp)
}

func TestProjectsService_Delete(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/8", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/api/v2/projects/8", r.RequestURI)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Projects.Delete(context.Background(), 8)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestProjectsService_DownloadFileFormatSettingsCustomSegmentation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/8/file-format-settings/10/custom-segmentations", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/api/v2/projects/8/file-format-settings/10/custom-segmentations", r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
			  	"url": "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment%3B20filename%3D%22APP.xliff",
			  	"expireIn": "2023-09-20T10:31:21+00:00"
			}
		}`)
	})

	downloadLink, resp, err := client.Projects.DownloadFileFormatSettingsCustomSegmentation(context.Background(), 8, 10)
	require.NoError(t, err)

	expectedDownloadLink := &model.DownloadLink{
		URL:      "https://production-enterprise-importer.downloads.crowdin.com/992000002/2/14.xliff?response-content-disposition=attachment%3B20filename%3D%22APP.xliff",
		ExpireIn: "2023-09-20T10:31:21+00:00",
	}
	assert.Equal(t, expectedDownloadLink, downloadLink)
	assert.NotNil(t, resp)
}

func TestProjectsService_ResetFileFormatSettingsCustomSegmentation(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/8/file-format-settings/10/custom-segmentations", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/api/v2/projects/8/file-format-settings/10/custom-segmentations", r.RequestURI)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Projects.ResetFileFormatSettingsCustomSegmentation(context.Background(), 8, 10)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestProjectsService_ListFileFormatSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/file-format-settings"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": [
				{
					"data": {
						"id": 44,
						"name": "Android XML",
						"format": "android",
						"extensions": [ "xml" ],
						"settings": {
							"exportPattern": null,
							"escapeQuotes": 1,
							"escapeSpecialCharacters": 1
						},
						"createdAt": "2023-09-19T15:10:43+00:00",
						"updatedAt": "2023-09-19T15:10:46+00:00"
					}
				}
			],
			"pagination": {
				"offset": 0,
				"limit": 25
			}
		}`)
	})

	settings, resp, err := client.Projects.ListFileFormatSettings(context.Background(), 8)
	require.NoError(t, err)

	expectedSettings := []*model.ProjectsFileFormatSettings{
		{
			ID:         44,
			Name:       "Android XML",
			Format:     "android",
			Extensions: []string{"xml"},
			Settings: map[string]any{
				"exportPattern":           nil,
				"escapeQuotes":            float64(1),
				"escapeSpecialCharacters": float64(1),
			},
			CreatedAt: "2023-09-19T15:10:43+00:00",
			UpdatedAt: "2023-09-19T15:10:46+00:00",
		},
	}
	assert.Equal(t, expectedSettings, settings)

	expectedPagination := model.Pagination{Offset: 0, Limit: 25}
	require.NotNil(t, resp)
	assert.Equal(t, expectedPagination, resp.Pagination)
}

func TestProjectsService_ListFileFormatSettings_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/8/file-format-settings", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Projects.ListFileFormatSettings(context.Background(), 8)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestProjectsService_GetFileFormatSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/file-format-settings/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"id": 44,
				"name": "Android XML",
				"format": "android",
				"extensions": [
					"xml"
				],
				"settings": {
					"exportPattern": null,
					"escapeQuotes": 1,
					"escapeSpecialCharacters": 1
				},
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	fileFormatSettings, resp, err := client.Projects.GetFileFormatSettings(context.Background(), 8, 1)
	require.NoError(t, err)
	require.NotNil(t, resp)

	expectedFileFormatSettings := &model.ProjectsFileFormatSettings{
		ID:         44,
		Name:       "Android XML",
		Format:     "android",
		Extensions: []string{"xml"},
		Settings: map[string]any{
			"exportPattern":           nil,
			"escapeQuotes":            float64(1),
			"escapeSpecialCharacters": float64(1),
		},
		CreatedAt: "2023-09-19T15:10:43+00:00",
		UpdatedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expectedFileFormatSettings, fileFormatSettings)
}

func TestProjectsService_AddFileFormatSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/file-format-settings"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, path, r.RequestURI)

		testBody(t, r, `{"format":"android","settings":{"exportPattern":"pattern","escapeQuotes":1,"escapeSpecialCharacters":1}}`+"\n")

		fmt.Fprint(w, `{
			"data": {
				"id": 44,
				"name": "Android XML",
				"format": "android",
				"extensions": [
					"xml"
				],
				"settings": {
					"exportPattern": "pattern",
					"escapeQuotes": 1,
					"escapeSpecialCharacters": 1
				},
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	req := &model.ProjectsAddFileFormatSettingsRequest{
		Format: "android",
		Settings: &model.PropertyFileFormatSettings{
			ExportPattern:           ToPtr("pattern"),
			EscapeQuotes:            ToPtr(1),
			EscapeSpecialCharacters: ToPtr(1),
		},
	}
	fileFormatSettings, resp, err := client.Projects.AddFileFormatSettings(context.Background(), 8, req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	expectedFileFormatSettings := &model.ProjectsFileFormatSettings{
		ID:         44,
		Name:       "Android XML",
		Format:     "android",
		Extensions: []string{"xml"},
		Settings: map[string]any{
			"exportPattern":           "pattern",
			"escapeQuotes":            float64(1),
			"escapeSpecialCharacters": float64(1),
		},
		CreatedAt: "2023-09-19T15:10:43+00:00",
		UpdatedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expectedFileFormatSettings, fileFormatSettings)
}

func TestProjectsService_AddFileFormatSettings_WithBodyParams(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name            string
		req             *model.ProjectsAddFileFormatSettingsRequest
		expectedReqBody string
	}{
		{
			name: "Property file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.PropertyFileFormatSettings{
					ExportPattern:           nil,
					EscapeQuotes:            ToPtr(0),
					EscapeSpecialCharacters: ToPtr(1),
				},
			},
			expectedReqBody: `{"format":"android","settings":{"escapeQuotes":0,"escapeSpecialCharacters":1}}` + "\n",
		},
		{
			name: "XML file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.XMLFileFormatSettings{
					TranslateContent:     ToPtr(false),
					TranslateAttributes:  ToPtr(true),
					TranslatableElements: []string{"/path/to/node", "//node"},
					ExportPattern:        nil,
					SRXStorageID:         ToPtr(1),
					ContentSegmentation:  ToPtr(false),
				},
			},
			expectedReqBody: `{"format":"android","settings":{"translateContent":false,"translateAttributes":true,"translatableElements":["/path/to/node","//node"],"contentSegmentation":false,"srxStorageId":1}}` + "\n",
		},
		{
			name: "Common file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.WebXMLFileFormatSettings{
					CommonFileFormatSettings: model.CommonFileFormatSettings{
						ContentSegmentation: ToPtr(true),
						SRXStorageID:        ToPtr(1),
						ExportPattern:       ToPtr("pattern"),
					},
				},
			},
			expectedReqBody: `{"format":"android","settings":{"contentSegmentation":true,"srxStorageId":1,"exportPattern":"pattern"}}` + "\n",
		},
		{
			name: "String Catalog file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.StringCatalogFileFormatSettings{
					ImportKeyAsSource: ToPtr(false),
					ExportPattern:     ToPtr(""),
				},
			},
			expectedReqBody: `{"format":"android","settings":{"importKeyAsSource":false,"exportPattern":""}}` + "\n",
		},
		{
			name: "MediaWiki file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.MediaWikiFileFormatSettings{
					SRXStorageID:  ToPtr(1),
					ExportPattern: ToPtr("pattern"),
				},
			},
			expectedReqBody: `{"format":"android","settings":{"srxStorageId":1,"exportPattern":"pattern"}}` + "\n",
		},
		{
			name: "TXT file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.TXTFileFormatSettings{
					SRXStorageID:  nil,
					ExportPattern: nil,
				},
			},
			expectedReqBody: `{"format":"android","settings":{}}` + "\n",
		},
		{
			name: "JavaScript file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format: "android",
				Settings: &model.JavaScriptFileFormatSettings{
					ExportPattern: ToPtr("pattern"),
					ExportQuotes:  ToPtr("double"),
				},
			},
			expectedReqBody: `{"format":"android","settings":{"exportPattern":"pattern","exportQuotes":"double"}}` + "\n",
		},
		{
			name: "Other file format settings",
			req: &model.ProjectsAddFileFormatSettingsRequest{
				Format:   "android",
				Settings: &model.OtherFileFormatSettings{},
			},
			expectedReqBody: `{"format":"android","settings":{}}` + "\n",
		},
	}

	for idx, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/file-format-settings", idx)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				testBody(t, r, tt.expectedReqBody)
				fmt.Fprint(w, `{}`)
			})

			_, _, err := client.Projects.AddFileFormatSettings(context.Background(), idx, tt.req)
			require.NoError(t, err)
		})
	}
}

func TestProjectsService_EditFileFormatSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	req := []*model.UpdateRequest{
		{
			Op:    "replace",
			Path:  "/format",
			Value: "android",
		},
	}

	path := "/api/v2/projects/8/file-format-settings/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPatch, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `[{"op":"replace","path":"/format","value":"android"}]` + "\n"
		testBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 44,
				"name": "Android XML",
				"format": "android",
				"extensions": [
					"xml"
				],
				"settings": {
					"exportPattern": null,
					"escapeQuotes": 1,
					"escapeSpecialCharacters": 1
				},
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	fileFormatSettings, resp, err := client.Projects.EditFileFormatSettings(context.Background(), 8, 1, req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	expectedFileFormatSettings := &model.ProjectsFileFormatSettings{
		ID:         44,
		Name:       "Android XML",
		Format:     "android",
		Extensions: []string{"xml"},
		Settings: map[string]any{
			"exportPattern":           nil,
			"escapeQuotes":            float64(1),
			"escapeSpecialCharacters": float64(1),
		},
		CreatedAt: "2023-09-19T15:10:43+00:00",
		UpdatedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expectedFileFormatSettings, fileFormatSettings)
}

func TestProjectsService_DeleteFileFormatSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/file-format-settings/10"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, path, r.RequestURI)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Projects.DeleteFileFormatSettings(context.Background(), 8, 10)
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}

func TestProjectsService_ListStringsExporterSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/strings-exporter-settings"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		resp := `{
			"data": [
				{
					"data": {
						"id": 2,
						"format": "android",
						"settings": {
							"convertPlaceholders": false
						},
						"createdAt": "2023-09-19T15:10:43+00:00",
						"updatedAt": "2023-09-19T15:10:46+00:00"
					}
				}
			],
			"pagination": {
				"offset": 10,
				"limit": 25
			}
		}`

		fmt.Fprint(w, resp)
	})

	settings, resp, err := client.Projects.ListStringsExporterSettings(context.Background(), 8)
	require.NoError(t, err)

	expectedSettings := []*model.ProjectsStringsExporterSettings{
		{
			ID:     2,
			Format: "android",
			Settings: model.StringsExporterSettings{
				ConvertPlaceholders: ToPtr(false),
			},
			CreatedAt: "2023-09-19T15:10:43+00:00",
			UpdatedAt: "2023-09-19T15:10:46+00:00",
		},
	}
	assert.Equal(t, expectedSettings, settings)

	expectedPagination := model.Pagination{Offset: 10, Limit: 25}
	require.NotNil(t, resp)
	assert.Equal(t, expectedPagination, resp.Pagination)
}

func TestProjectsService_ListStringsExporterSettings_invalidJSON(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/8/strings-exporter-settings", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `invalid json`)
	})

	res, _, err := client.Projects.ListStringsExporterSettings(context.Background(), 8)
	require.Error(t, err)
	assert.Nil(t, res)
}

func TestProjectsService_GetStringsExporterSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/strings-exporter-settings/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, path, r.RequestURI)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"format": "android",
				"settings": {
					"convertPlaceholders": false
				},
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	settings, resp, err := client.Projects.GetStringsExporterSettings(context.Background(), 8, 1)
	require.NoError(t, err)
	require.NotNil(t, resp)

	expectedSettings := &model.ProjectsStringsExporterSettings{
		ID:     2,
		Format: "android",
		Settings: model.StringsExporterSettings{
			ConvertPlaceholders: ToPtr(false),
		},
		CreatedAt: "2023-09-19T15:10:43+00:00",
		UpdatedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expectedSettings, settings)
	assert.Nil(t, expectedSettings.Settings.LanguagePairMapping)
}

func TestProjectsService_AddStringsExporterSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/strings-exporter-settings"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `{"format":"macosx","settings":{"convertPlaceholders":false}}` + "\n"
		testBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"format": "macosx",
				"settings": {
					"convertPlaceholders": false
				},
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	req := &model.ProjectsStringsExporterSettingsRequest{
		Format: "macosx",
		Settings: model.StringsExporterSettings{
			ConvertPlaceholders: ToPtr(false),
		},
	}
	settings, resp, err := client.Projects.AddStringsExporterSettings(context.Background(), 8, req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	expectedSettings := &model.ProjectsStringsExporterSettings{
		ID:     2,
		Format: "macosx",
		Settings: model.StringsExporterSettings{
			ConvertPlaceholders: ToPtr(false),
		},
		CreatedAt: "2023-09-19T15:10:43+00:00",
		UpdatedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expectedSettings, settings)
	assert.Nil(t, expectedSettings.Settings.LanguagePairMapping)
}

func TestProjectsService_AddStringsExporterSettings_WithRequiredFields(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	cases := []struct {
		name            string
		req             *model.ProjectsStringsExporterSettingsRequest
		expectedReqBody string
	}{
		{
			name: "With convert placeholders settings (macosx)",
			req: &model.ProjectsStringsExporterSettingsRequest{
				Format: "macosx",
				Settings: model.StringsExporterSettings{
					ConvertPlaceholders: ToPtr(false),
				},
			},
			expectedReqBody: `{"format":"macosx","settings":{"convertPlaceholders":false}}` + "\n",
		},
		{
			name: "With convert placeholders settings (android)",
			req: &model.ProjectsStringsExporterSettingsRequest{
				Format: "android",
				Settings: model.StringsExporterSettings{
					ConvertPlaceholders: ToPtr(false),
				},
			},
			expectedReqBody: `{"format":"android","settings":{"convertPlaceholders":false}}` + "\n",
		},
		{
			name: "With language pair mapping settings",
			req: &model.ProjectsStringsExporterSettingsRequest{
				Format: "xliff",
				Settings: model.StringsExporterSettings{
					LanguagePairMapping: map[string]string{
						"uk": "es",
						"de": "en",
					},
				},
			},
			expectedReqBody: `{"format":"xliff","settings":{"languagePairMapping":{"de":"en","uk":"es"}}}` + "\n",
		},
	}

	for idx, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			path := fmt.Sprintf("/api/v2/projects/%d/strings-exporter-settings", idx)
			mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodPost, r.Method)
				assert.Equal(t, path, r.RequestURI)

				testBody(t, r, tt.expectedReqBody)

				fmt.Fprint(w, `{"data": {"id": 2}}`)
			})

			settings, _, err := client.Projects.AddStringsExporterSettings(context.Background(), idx, tt.req)
			require.NoError(t, err, "Test case %d", idx)
			assert.NotNil(t, settings, "Test case %d", idx)
		})
	}
}

func TestProjectsService_EditStringsExporterSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	path := "/api/v2/projects/8/strings-exporter-settings/1"
	mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPatch, r.Method)
		assert.Equal(t, path, r.RequestURI)

		expectedReqBody := `{
			"format": "xliff",
			"settings": {
				"languagePairMapping": {
					"uk": "es",
					"de": "en"
				}
			}
		}`
		testJSONBody(t, r, expectedReqBody)

		fmt.Fprint(w, `{
			"data": {
				"id": 2,
				"format": "xliff",
				"settings": {
					"languagePairMapping": {
						"uk": "es",
						"de": "en"
					}
				},
				"createdAt": "2023-09-19T15:10:43+00:00",
				"updatedAt": "2023-09-19T15:10:46+00:00"
			}
		}`)
	})

	req := &model.ProjectsStringsExporterSettingsRequest{
		Format: "xliff",
		Settings: model.StringsExporterSettings{
			LanguagePairMapping: map[string]string{
				"uk": "es",
				"de": "en",
			},
		},
	}
	settings, resp, err := client.Projects.EditStringsExporterSettings(context.Background(), 8, 1, req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	expectedSettings := &model.ProjectsStringsExporterSettings{
		ID:     2,
		Format: "xliff",
		Settings: model.StringsExporterSettings{
			LanguagePairMapping: map[string]string{
				"uk": "es",
				"de": "en",
			},
		},
		CreatedAt: "2023-09-19T15:10:43+00:00",
		UpdatedAt: "2023-09-19T15:10:46+00:00",
	}
	assert.Equal(t, expectedSettings, settings)
	assert.Nil(t, expectedSettings.Settings.ConvertPlaceholders)
}

func TestProjectsService_DeleteStringsExporterSettings(t *testing.T) {
	client, mux, teardown := setupClient()
	defer teardown()

	mux.HandleFunc("/api/v2/projects/8/strings-exporter-settings/1", func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodDelete, r.Method)
		assert.Equal(t, "/api/v2/projects/8/strings-exporter-settings/1", r.RequestURI)

		w.WriteHeader(http.StatusNoContent)
	})

	resp, err := client.Projects.DeleteStringsExporterSettings(context.Background(), 8, 1)
	require.NoError(t, err)
	assert.NotNil(t, resp)
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
}
