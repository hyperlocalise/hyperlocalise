package model

import (
	"errors"
	"fmt"
	"net/url"
)

// MachineTranslation represents a machine translation engine (MTE).
type MachineTranslation struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Credentials struct {
		CrowdinNMT                  string `json:"crowdin_nmt"`
		CrowdinNMTMultiTranslations string `json:"crowdin_nmt_multi_translations"`
	} `json:"credentials"`
	SupportedLanguageIDs   []string            `json:"supportedLanguageIds"`
	SupportedLanguagePairs map[string][]string `json:"supportedLanguagePairs"`

	GroupID            *int     `json:"groupId,omitempty"`
	EnabledLanguageIDs []string `json:"enabledLanguageIds,omitempty"`
	EnabledProjectIDs  []int    `json:"enabledProjectIds,omitempty"`
	ProjectIDs         []int    `json:"projectIds,omitempty"`
	IsEnabled          *bool    `json:"isEnabled,omitempty"`
}

// MachineTranslationsResponse defines the structure of
// a response to get a machine translation engine.
type MachineTranslationsResponse struct {
	Data *MachineTranslation `json:"data"`
}

// MachineTranslationsListResponse defines the structure of
// a response to list machine translation engines.
type MachineTranslationsListResponse struct {
	Data []*MachineTranslationsResponse `json:"data"`
}

// MTListOptions specifies the optional parameters
// to the MachineTranslationEnginesService.List method.
type MTListOptions struct {
	// Group Identifier.
	// Note: Set `0` to see MTs of root group.
	GroupID *int `json:"groupId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the list options.
// It implements the crowdin.ListOptionsProvider interface.
func (o *MTListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.GroupID != nil {
		v.Add("groupId", fmt.Sprintf("%d", *o.GroupID))
	}

	return v, len(v) > 0
}

// MTAddRequest defines the structure of a request
// to add a machine translation engine.
type MTAddRequest struct {
	// Machine Translation engine name.
	Name string `json:"name"`
	// MT engine type.
	// Enum: google, google_automl, microsoft, deepl,
	//       amazon, modernmt, custom_mt.
	Type string `json:"type"`
	// MT engine credentials.
	Credentials *MTECredentials `json:"credentials"`
	// Group Identifier that defines the group to which the MT is added.
	// If `0`, the MT will be available for all projects and groups
	// in your workspace.
	// Default: 0.
	GroupID *int `json:"groupId,omitempty"`
	// List of language IDs.
	EnabledLanguageIDs []string `json:"enabledLanguageIds,omitempty"`
	// List of project IDs.
	EnabledProjectIDs []int `json:"enabledProjectIds,omitempty"`
	// Defines whether to enable the MT engine.
	// Default: true.
	IsEnabled *bool `json:"isEnabled,omitempty"`
}

// MTECredentials represents the credentials for a machine translation engine.
// The structure of the credentials field depends on the type of the MT engine.
// The following are the possible fields for each type of MT engine:
//
// Google Translate:
//
//	APIKey (string): Your Google Translate API key.
//
// Google AutoML Translate:
//
//	Credentials (string): Your Google Translate credentials as a
//	                      JSON (base64 encoded) file.
//
// Microsoft Translate:
//
//	APIKey (string): Your Microsoft Translate API key.
//	Model (string): Custom model (optional).
//
// DeepL Pro:
//
//	APIKey (string): Your DeepL Pro API key.
//	IsSystemCredentials (bool): This option will enable the paid service
//	                            DeepL via Crowdin. Default: false.
//
// Amazon Translate:
//
//	AccessKey (string): Your Amazon Translate access key.
//	SecretKey (string): Your Amazon Translate secret key.
//
// ModernMT Translate:
//
//	APIKey (string): Your ModernMT Translate API key.
//
// Custom MT Translate:
//
//	URL (string): Your custom MT engine URL.
type MTECredentials struct {
	APIKey              string `json:"apiKey,omitempty"`
	Credentials         string `json:"credentials,omitempty"`
	Model               string `json:"model,omitempty"`
	IsSystemCredentials *bool  `json:"isSystemCredentials,omitempty"`
	Endpoint            string `json:"endpoint,omitempty"`
	AccessKey           string `json:"accessKey,omitempty"`
	SecretKey           string `json:"secretKey,omitempty"`
	URL                 string `json:"url,omitempty"`
}

// Validate checks if the add request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *MTAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Type == "" {
		return errors.New("type is required")
	}
	if r.Credentials == nil {
		return errors.New("credentials are required")
	}

	return nil
}

// LanguageRecognitionProvider represents a provider for language
// recognition services. It is one of the following values: crowdin, engine.
type LanguageRecognitionProvider string

const (
	// LanguageRecognitionProviderCrowdin represents the crowdin language recognition provider.
	LanguageRecognitionProviderCrowdin LanguageRecognitionProvider = "crowdin"
	// LanguageRecognitionProviderEngine represents the engine language recognition provider.
	LanguageRecognitionProviderEngine LanguageRecognitionProvider = "engine"
)

// TranslateRequest defines the structure of a request to translate strings.
type TranslateRequest struct {
	// Source Language Identifier.
	SourceLanguageID string `json:"sourceLanguageId,omitempty"`
	// Target Language Identifier.
	TargetLanguageID string `json:"targetLanguageId"`
	// Select a provider for language recognition.
	// Enum: crowdin, engine.
	// Note: Is required if the source language is not selected.
	LanguageRecognitionProvider LanguageRecognitionProvider `json:"languageRecognitionProvider,omitempty"`
	// Strings that should be translated.
	// Note: You can translate up to 100 strings at a time.
	Strings []string `json:"strings"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *TranslateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	if r.TargetLanguageID == "" {
		return errors.New("target language ID is required")
	}

	if r.LanguageRecognitionProvider == "" && r.SourceLanguageID == "" {
		return errors.New("source language ID or language recognition provider is required")
	}

	if r.LanguageRecognitionProvider != "" {
		switch r.LanguageRecognitionProvider {
		case LanguageRecognitionProviderCrowdin, LanguageRecognitionProviderEngine: // valid
		default:
			return errors.New("invalid language recognition provider")
		}
	}

	return nil
}

// MTTranslation represents a translation using a machine
// translation engine.
type MTTranslation struct {
	SourceLanguageID string   `json:"sourceLanguageId"`
	TargetLanguageID string   `json:"targetLanguageId"`
	Strings          []string `json:"strings"`
	Translations     []string `json:"translations"`
}

// MTTranslationResponse defines the structure of a response
// to get a translation using a MTE.
type MTTranslationResponse struct {
	Data *MTTranslation `json:"data"`
}
