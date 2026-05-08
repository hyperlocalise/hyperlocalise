package model

import "net/url"

// Dictionary represents a storage of words.
type Dictionary struct {
	LanguageID string   `json:"languageId"`
	Words      []string `json:"words"`
}

// DictionaryResponse defines the structure of the response
// when getting a dictionary.
type DictionaryResponse struct {
	Data *Dictionary `json:"data"`
}

// DictionariesListResponse defines the structure of the response
// when getting a list of dictionaries.
type DictionariesListResponse struct {
	Data []*DictionaryResponse `json:"data"`
}

// DictionariesListOptions specifies the optional parameters to the
// DictionariesService.List method.
type DictionariesListOptions struct {
	// Filter progress by language identifiers.
	LanguageIDs []string `json:"languageIds,omitempty"`
}

// Values returns the url.Values representation of the DictionariesListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *DictionariesListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v := url.Values{}
	if len(o.LanguageIDs) > 0 {
		v.Add("languageIds", JoinSlice(o.LanguageIDs))
	}

	return v, len(v) > 0
}
