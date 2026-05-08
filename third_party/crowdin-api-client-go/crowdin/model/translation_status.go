package model

import "net/url"

// TranslationProgress defines the structure of a translations status progress.
type TranslationProgress struct {
	Words               map[string]int `json:"words"`
	Phrases             map[string]int `json:"phrases"`
	TranslationProgress int            `json:"translationProgress"`
	ApprovalProgress    int            `json:"approvalProgress"`
	LanguageID          *string        `json:"languageId,omitempty"`
	BranchID            *int           `json:"branchId,omitempty"`
	FileID              *int           `json:"fileId,omitempty"`
	Language            *Language      `json:"language,omitempty"`
	Etag                *string        `json:"etag,omitempty"`
}

// TranslationStatusProgressResponse defines the structure of a response when getting
// a translation status progress (for a branch, directory, file, language or project).
type TranslationProgressResponse struct {
	Data []struct {
		Data *TranslationProgress `json:"data"`
	} `json:"data"`
}

// ProjectProgressListOptions specifies the optional parameters to the
// TranslationStatusService.GetProjectProgress method.
type ProjectProgressListOptions struct {
	// Filter progress by Language Identifier.
	LanguageIDs []string `json:"languageIds,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of ProjectProgressListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ProjectProgressListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if len(o.LanguageIDs) > 0 {
		v.Add("languageIds", JoinSlice(o.LanguageIDs))
	}

	return v, len(v) > 0
}

// QACheck represents a QA check issue.
type QACheck struct {
	StringID              int    `json:"stringId"`
	LanguageID            string `json:"languageId"`
	Category              string `json:"category"`
	CategoryDescription   string `json:"categoryDescription"`
	Validation            string `json:"validation"`
	ValidationDescription string `json:"validationDescription"`
	PluralID              int    `json:"pluralId"`
	Text                  string `json:"text"`
}

// QAChecksResponse defines the structure of a response
// when getting a list of QA check issues.
type QAChecksResponse struct {
	Data []struct {
		Data *QACheck `json:"data"`
	} `json:"data"`
}

// QACheckListOptions specifies the optional parameters to the
// TranslationStatusService.ListQAChecks method.
type QACheckListOptions struct {
	// Defines category of QA check issue. It can be one category or a list of comma-separated ones.
	// Example: category=variables,tags
	// Enum: empty, variables, tags, punctuation, symbol_register, spaces, size, special_symbols,
	//       wrong_translation, spellcheck, icu
	Category []string `json:"category,omitempty"`
	// Defines the QA check issue validation type. It can be one validation type or a list
	// of comma-separated ones. Example: validation=capitalize_check,punctuation_check
	// Enum: empty_string_check, empty_suggestion_check, max_length_check, tags_check,
	//       mismatch_ids_check, cdata_check, specials_symbols_check, leading_newlines_check,
	//       trailing_newlines_check, leading_spaces_check, trailing_spaces_check, multiple_spaces_check,
	//       custom_blocked_variables_check, highest_priority_custom_variables_check,
	//       highest_priority_variables_check, c_variables_check, python_variables_check,
	//       rails_variables_check, java_variables_check, dot_net_variables_check, twig_variables_check,
	//       php_variables_check, freemarker_variables_check, lowest_priority_variable_check,
	//       lowest_priority_custom_variables_check, punctuation_check, spaces_before_punctuation_check,
	//       spaces_after_punctuation_check, non_breaking_spaces_check, capitalize_check,
	//       multiple_uppercase_check, parentheses_check, entities_check, escaped_quotes_check,
	//       wrong_translation_issue_check, spellcheck, icu_check
	Validation []string `json:"validation,omitempty"`
	// Filter progress by Language Identifier.
	LanguageIDs []string `json:"languageIds,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of QACheckListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *QACheckListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if len(o.Category) > 0 {
		v.Add("category", JoinSlice(o.Category))
	}
	if len(o.Validation) > 0 {
		v.Add("validation", JoinSlice(o.Validation))
	}
	if len(o.LanguageIDs) > 0 {
		v.Add("languageIds", JoinSlice(o.LanguageIDs))
	}

	return v, len(v) > 0
}
