package model

import (
	"errors"
	"fmt"
)

// Language represents a language in Crowdin.
type Language struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	EditorCode          string   `json:"editorCode"`
	TwoLettersCode      string   `json:"twoLettersCode"`
	ThreeLettersCode    string   `json:"threeLettersCode"`
	Locale              string   `json:"locale"`
	AndroidCode         string   `json:"androidCode"`
	OSXCode             string   `json:"osxCode"`
	OSXLocale           string   `json:"osxLocale"`
	PluralCategoryNames []string `json:"pluralCategoryNames"`
	PluralRules         string   `json:"pluralRules"`
	PluralExamples      []string `json:"pluralExamples"`
	TextDirection       string   `json:"textDirection"`
	DialectOf           string   `json:"dialectOf"`
}

// LanguagesListResponse defines the structure of a response
// when getting a list of languages.
type LanguagesListResponse struct {
	Data       []*LanguagesGetResponse `json:"data"`
	Pagination *Pagination             `json:"pagination"`
}

// LanguagesGetResponse defines the structure of a response
// when getting a single language.
type LanguagesGetResponse struct {
	Data *Language `json:"data"`
}

// AddLanguageRequest defines the structure of a request
// to add a new custom language.
type AddLanguageRequest struct {
	// Language name.
	Name string `json:"name"`
	// Custom language code.
	Code string `json:"code"`
	// Custom language locale code.
	LocaleCode string `json:"localeCode"`
	// Text direction in custom language. Enum: "ltr" "rtl".
	//  "ltr" - left-to-right
	//  "rtl" - right-to-left
	TextDirection string `json:"textDirection"`
	// Array with category names.
	PluralCategoryNames []string `json:"pluralCategoryNames"`
	// Custom language 3 letters code. Format: ISO 6393 code.
	ThreeLettersCode string `json:"threeLettersCode"`
	// Custom language 2 letters code. Format: ISO 6391 code.
	TwoLettersCode string `json:"twoLettersCode"`
	// Use if custom language is a dialect.
	DialectOf string `json:"dialectOf"`
}

// Validate checks if the add request is valid.
// It implements the RequestValidator interface.
func (r *AddLanguageRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.Code == "" {
		return errors.New("code is required")
	}
	if r.LocaleCode == "" {
		return errors.New("localeCode is required")
	}
	if r.ThreeLettersCode == "" {
		return errors.New("threeLettersCode is required")
	}
	if len(r.PluralCategoryNames) == 0 {
		return errors.New("pluralCategoryNames is required")
	}

	const (
		ltr = "ltr"
		rtl = "rtl"
	)
	if r.TextDirection == "" {
		return errors.New("textDirection is required")
	}
	if r.TextDirection != ltr && r.TextDirection != rtl {
		return fmt.Errorf("textDirection must be %q or %q", ltr, rtl)
	}

	return nil
}
