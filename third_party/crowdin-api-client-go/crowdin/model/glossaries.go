package model

import (
	"errors"
	"fmt"
	"net/url"
)

type (
	// Concept represents a concept in a glossary.
	Concept struct {
		ID               int                        `json:"id"`
		UserID           int                        `json:"userId"`
		GlossaryID       int                        `json:"glossaryId"`
		Subject          string                     `json:"subject"`
		Definition       string                     `json:"definition"`
		Translatable     bool                       `json:"translatable"`
		Note             string                     `json:"note"`
		URL              string                     `json:"url"`    // Base URL.
		Figure           string                     `json:"figure"` // Figure URL.
		LanguagesDetails []*ConceptLanguagesDetails `json:"languagesDetails"`
		CreatedAt        string                     `json:"createdAt"`
		UpdatedAt        string                     `json:"updatedAt"`
	}

	// ConceptLanguagesDetails represents the language details of a concept.
	ConceptLanguagesDetails struct {
		LanguageID string `json:"languageId"`
		UserID     int    `json:"userId"`
		Definition string `json:"definition"`
		Note       string `json:"note"`
		CreatedAt  string `json:"createdAt"`
		UpdatedAt  string `json:"updatedAt"`
	}
)

// ConceptResponse defines the structure of a response when
// getting a concept.
type ConceptResponse struct {
	Data *Concept `json:"data"`
}

// ConceptsListResponse defines the structure of a response when
// getting a list of concepts.
type ConceptsListResponse struct {
	Data []*ConceptResponse `json:"data"`
}

// ConceptsListOptions specifies the optional parameters to the
// GlossariesService.ListConcepts method.
type ConceptsListOptions struct {
	// Sort concepts by specified field.
	// Enum: id, subject, definition, note, createdAt, updatedAt. Default: id.
	// Example: orderBy=createdAt desc,subject,definition
	OrderBy string `json:"orderBy,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the ConceptsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ConceptsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}

	return v, len(v) > 0
}

type (
	// ConceptUpdateRequest defines the structure of a request to
	// update a concept.
	ConceptUpdateRequest struct {
		// Concept subject.
		Subject string `json:"subject,omitempty"`
		// Concept definition.
		Definition string `json:"definition,omitempty"`
		// Default: true.
		Translatable *bool `json:"translatable,omitempty"`
		// Any kind of note, such as a usage note, explanation, or instruction.
		Note string `json:"note,omitempty"`
		// Base URL.
		URL string `json:"url,omitempty"`
		// Used for an external cross-reference, such as a URL, or to point to
		// an external graphic file.
		Figure string `json:"figure,omitempty"`
		// Concept languages details.
		LanguagesDetails []*LanguagesDetails `json:"languagesDetails,omitempty"`
	}

	LanguagesDetails struct {
		// Language Identifier.
		LanguageID string `json:"languageId,omitempty"`
		// Concept definition.
		Definition string `json:"definition,omitempty"`
		// Any kind of note, such as a usage note, explanation, or instruction.
		Note string `json:"note,omitempty"`
	}
)

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ConceptUpdateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return nil
}

// Glossary represents a Crowdin glossary.
type Glossary struct {
	ID                int      `json:"id"`
	Name              string   `json:"name"`
	GroupID           int      `json:"groupId"`
	UserID            int      `json:"userId"`
	Terms             int      `json:"terms"`
	LanguageID        string   `json:"languageId"`
	LanguageIDs       []string `json:"languageIds"`
	DefaultProjectIDs []int    `json:"defaultProjectIds"`
	ProjectIDs        []int    `json:"projectIds"`
	WebURL            string   `json:"webUrl"`
	CreatedAt         string   `json:"createdAt"`
}

// GlossaryResponse defines the structure of a response when
// getting a glossary.
type GlossaryResponse struct {
	Data *Glossary `json:"data"`
}

// GlossariesListResponse defines the structure of a response when
// getting a list of glossaries.
type GlossariesListResponse struct {
	Data []*GlossaryResponse `json:"data"`
}

// GlossariesListOptions specifies the optional parameters to the
// GlossariesService.List method.
type GlossariesListOptions struct {
	// Sort glossaries by specified field.
	// Enum: id, name, groupId, userId, createdAt. Default: id.
	// Example: orderBy=createdAt desc,name
	OrderBy string `json:"orderBy,omitempty"`
	// Group Identifier.
	// Note: Set 0 to see glossaries of root group.
	GroupID *int `json:"groupId,omitempty"`
	// List glossaries of specific user.
	UserID int `json:"userId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the GlossariesListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *GlossariesListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.GroupID != nil {
		v.Add("groupId", fmt.Sprintf("%d", *o.GroupID))
	}
	if o.UserID != 0 {
		v.Add("userId", fmt.Sprintf("%d", o.UserID))
	}

	return v, len(v) > 0
}

// GlossaryAddRequest defines the structure of a request to add a glossary.
type GlossaryAddRequest struct {
	// Glossary name.
	Name string `json:"name"`
	// Glossary Language Identifier.
	LanguageID string `json:"languageId"`
	// Group Identifier - defines group to which Glossary is added.
	// If `0` – Glossary will be available for all projects and groups
	// in your workspace. Default: 0.
	GroupID *int `json:"groupId,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *GlossaryAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}

	return nil
}

// GlossaryExport represents a glossary export status.
type GlossaryExport struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		Format       string   `json:"format"`
		ExportFields []string `json:"exportFields"`
	} `json:"attributes"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt"`
}

// GlossaryExportResponse defines the structure of a response when
// exporting a glossary or getting the status of an export.
type GlossaryExportResponse struct {
	Data *GlossaryExport `json:"data"`
}

// GlossaryExportRequest defines the structure of a request
// to export a glossary.
type GlossaryExportRequest struct {
	// Export format.
	// Enum: tbx, tbx_v3, csv, xlsx. Default: tbx.
	Format string `json:"format,omitempty"`
	// Array fields for export.
	// Default: ["term","description","partOfSpeech"]
	// Enum: term, description, partOfSpeech, type, status, gender, note, url,
	// conceptDefinition, conceptSubject, conceptNote, conceptUrl, conceptFigure.
	ExportFields []string `json:"exportFields,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *GlossaryExportRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return nil
}

// GlossaryImport represents a glossary import status.
type GlossaryImport struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		StorageID               int            `json:"storageId"`
		Scheme                  map[string]int `json:"scheme"`
		FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
	} `json:"attributes"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt"`
}

// GlossaryImportResponse defines the structure of a response when
// importing a glossary or getting the status of an import.
type GlossaryImportResponse struct {
	Data *GlossaryImport `json:"data"`
}

// GlossaryImportRequest defines the structure of a request
// to import a glossary.
type GlossaryImportRequest struct {
	// Storage Identifier. Supported file formats: TBX, CSV, XLS/XLSX
	StorageID int `json:"storageId"`
	// Defines data columns mapping. Acceptable value is combination of
	// following constants:
	// term_{%language_code%} – column with terms
	// description_{%language_code%} – column with terms description
	// partOfSpeech_{%language_code%} – column with terms part of speech
	// status_{%language_code%} – column with terms status
	// type_{%language_code%} – column with terms type
	// gender_{%language_code%} – column with terms
	// url_{%language_code%} – column with terms url
	// note_{%language_code%} – column with terms note
	// where %language_code% – placeholder for your language code
	// conceptDefinition – column with concepts definition
	// conceptSubject – column with concepts subject
	// conceptNote – column with concepts note
	// conceptUrl – column with concepts url
	// conceptFigure – column with concepts figure
	// Note: Used for upload of CSV or XLS/XLSX files only.
	Scheme map[string]int `json:"scheme"`
	// Defines whether file includes first row header that should not be imported.
	// Default: false.
	// Note: Used for upload of CSV or XLS/XLSX files only.
	FirstLineContainsHeader *bool `json:"firstLineContainsHeader"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *GlossaryImportRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StorageID <= 0 {
		return errors.New("storageId is required")
	}

	return nil
}

type (
	// ConcordanceSearch represents the concordance search result.
	ConcordanceSearch struct {
		Glossary    *ConcordanceSearchGlossary `json:"glossary"`
		Concept     *ConcordanceSearchConcept  `json:"concept"`
		SourceTerms []*Term                    `json:"sourceTerms"`
		TargetTerms []*Term                    `json:"targetTerms"`
	}

	// ConcordanceSearchGlossary represents the glossary details in
	// a concordance search.
	ConcordanceSearchGlossary struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}

	// ConcordanceSearchConcept represents the concept details in
	// a concordance search.
	ConcordanceSearchConcept struct {
		ID           int    `json:"id"`
		Subject      string `json:"subject"`
		Definition   string `json:"definition"`
		Translatable bool   `json:"translatable"`
		Note         string `json:"note"`
		URL          string `json:"url"`
		Figure       string `json:"figure"`
	}
)

// GlossaryConcordanceSearchResponse defines the structure of a response when
// searching for concordance in glossaries.
type GlossaryConcordanceSearchResponse struct {
	Data []struct {
		Data *ConcordanceSearch `json:"data"`
	} `json:"data"`
}

// GlossaryConcordanceSearchRequest defines the structure of a request
// to search for concordance in glossaries.
type GlossaryConcordanceSearchRequest struct {
	// Source Language Identifier.
	SourceLanguageID string `json:"sourceLanguageId"`
	// Target Language Identifier.
	TargetLanguageID string `json:"targetLanguageId"`
	// Expressions to search.
	Expressions []string `json:"expressions"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *GlossaryConcordanceSearchRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.SourceLanguageID == "" {
		return errors.New("sourceLanguageId is required")
	}
	if r.TargetLanguageID == "" {
		return errors.New("targetLanguageId is required")
	}
	if len(r.Expressions) == 0 {
		return errors.New("expressions cannot be empty")
	}

	return nil
}

// Term represents a term in a glossary.
type Term struct {
	ID           int    `json:"id"`
	UserID       int    `json:"userId"`
	GlossaryID   int    `json:"glossaryId"`
	LanguageID   string `json:"languageId"`
	Text         string `json:"text"`
	Description  string `json:"description"`
	PartOfSpeech string `json:"partOfSpeech"`
	Status       string `json:"status"`
	Type         string `json:"type"`
	Gender       string `json:"gender"`
	Note         string `json:"note"`
	URL          string `json:"url"`
	ConceptID    int    `json:"conceptId"`
	Lemma        string `json:"lemma"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// TermResponse defines the structure of a response when
// getting a term.
type TermResponse struct {
	Data *Term `json:"data"`
}

// TermsListResponse defines the structure of a response when
// getting a list of terms.
type TermsListResponse struct {
	Data []*TermResponse `json:"data"`
}

// TermsListOptions specifies the optional parameters to the
// GlossariesService.ListTerms method.
type TermsListOptions struct {
	// Sort terms by specified field.
	// Enum: id, text, description, partOfSpeech, status, type, gender,
	// note, lemma, createdAt, updatedAt. Default: id.
	// Example: orderBy=createdAt desc,text
	OrderBy string `json:"orderBy,omitempty"`
	// Project Member Identifier.
	UserID int `json:"userId,omitempty"`
	// Term Language Identifier.
	LanguageID string `json:"languageId,omitempty"`
	// Filter terms by `conceptId`.
	// Note: Use for terms that have translations.
	ConceptID int `json:"conceptId,omitempty"`
	// Filter strings by CroQL
	// Note: Can be used only with orderBy, offset and limit in same request.
	CroQL string `json:"croql,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the TermsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *TermsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.UserID != 0 {
		v.Add("userId", fmt.Sprintf("%d", o.UserID))
	}
	if o.LanguageID != "" {
		v.Add("languageId", o.LanguageID)
	}
	if o.ConceptID != 0 {
		v.Add("conceptId", fmt.Sprintf("%d", o.ConceptID))
	}
	if o.CroQL != "" {
		v.Add("croql", o.CroQL)
	}

	return v, len(v) > 0
}

// TermAddRequest defines the structure of a request to add a term.
type TermAddRequest struct {
	// Term Language Identifier.
	LanguageID string `json:"languageId"`
	// Term.
	Text string `json:"text"`
	// Term description.
	Description string `json:"description,omitempty"`
	// Term part of speech.
	// Enum: adjective, adposition, adverb, auxiliary, coordinating conjunction,
	// determiner, interjection, noun, numeral, particle, pronoun, proper noun,
	// subordinating conjunction, verb, other.
	PartOfSpeech string `json:"partOfSpeech,omitempty"`
	// Term status.
	// Enum: preferred, admitted, not recommended, obsolete.
	Status string `json:"status,omitempty"`
	// Term type.
	// Enum: full form, acronym, abbreviation, short form, phrase, variant.
	Type string `json:"type,omitempty"`
	// Gender.
	// Enum: masculine, feminine, neuter, other.
	Gender string `json:"gender,omitempty"`
	// Any kind of note, such as a usage note, explanation, or instruction.
	Note string `json:"note,omitempty"`
	// Base URL.
	URL string `json:"url,omitempty"`
	// Defines whether to add translation to the existing term.
	ConceptID int `json:"conceptId,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *TermAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if r.Text == "" {
		return errors.New("text is required")
	}

	return nil
}

// ClearGlossaryOptions specifies the optional parameters to the
// GlossariesService.ClearGlossary method.
type ClearGlossaryOptions struct {
	// Language Identifier.
	LanguageID string `json:"languageId,omitempty"`
	// Defines whether to delete specific term along with its translations.
	ConceptID int `json:"conceptId,omitempty"`
}

// Values returns the url.Values representation of the ClearGlossaryOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ClearGlossaryOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v := url.Values{}

	if o.LanguageID != "" {
		v.Add("languageId", o.LanguageID)
	}
	if o.ConceptID != 0 {
		v.Add("conceptId", fmt.Sprintf("%d", o.ConceptID))
	}

	return v, len(v) > 0
}
