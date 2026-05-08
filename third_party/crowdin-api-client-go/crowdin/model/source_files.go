package model

import (
	"errors"
	"fmt"
	"net/url"
)

// Directory represents a project directory.
type Directory struct {
	ID            int    `json:"id"`
	ProjectID     int    `json:"projectId"`
	BranchID      *int   `json:"branchId,omitempty"`
	DirectoryID   *int   `json:"directoryId,omitempty"`
	Name          string `json:"name"`
	Title         string `json:"title"`
	ExportPattern string `json:"exportPattern"`
	Path          string `json:"path"`
	Priority      string `json:"priority"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// DirectoryGetResponse describes a response with a single directory.
type DirectoryGetResponse struct {
	Data *Directory `json:"data"`
}

// DirectoryListResponse describes a response with a list of directories.
type DirectoryListResponse struct {
	Data []*DirectoryGetResponse `json:"data"`
}

// DirectoryListOptions specifies the optional parameters to the
// SourceFilesService.ListDirectories method.
type DirectoryListOptions struct {
	// OrderBy is used to sort directories.
	// Enum: id, name, title, createdAt, updatedAt, exportPattern, priority.
	// Default: id.
	// Example: orderBy=createdAt desc,name,priority.
	OrderBy string `json:"orderBy,omitempty"`
	// BranchID is the ID of the branch to filter directories by.
	// Note: Can't be used with `directoryID` in the same request.
	// To list the directories from all the nested levels within the branch,
	// ensure to use the `recursion` parameter with the `branchID` parameter.
	BranchID int `json:"branchId,omitempty"`
	// DirectoryID is the ID of the directory to filter directories by.
	// Note: Can't be used with `branchID` in the same request.
	// To list the directories from all the nested levels within the directory,
	// ensure to use the `recursion` parameter with the `directoryID` parameter.
	DirectoryID int `json:"directoryId,omitempty"`
	// Filter directories by name.
	Filter string `json:"filter,omitempty"`
	// Recursion is used to list directories recursively.
	// Note: Works only when `directoryID` or `branchID` parameter is specified.
	Recursion any `json:"recursion,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of DirectoryListOptions.
func (o *DirectoryListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.BranchID > 0 {
		v.Add("branchId", fmt.Sprintf("%d", o.BranchID))
	}
	if o.DirectoryID > 0 {
		v.Add("directoryId", fmt.Sprintf("%d", o.DirectoryID))
	}
	if o.Filter != "" {
		v.Add("filter", o.Filter)
	}
	if recursion, ok := o.Recursion.(string); ok {
		v.Add("recursion", recursion)
	}

	return v, len(v) > 0
}

// DirectoryAddRequest defines the structure of a request
// to create a new directory.
type DirectoryAddRequest struct {
	// Directory name.
	// Note: Can't contain \ / : * ? " < > | symbols.
	Name string `json:"name"`
	// Branch identifier.
	// Note: Can't be used with `directoryId` in same request.
	BranchID int `json:"branchId,omitempty"`
	// Parent Directory Identifier.
	// Note: Can't be used with `branchId` in same request.
	DirectoryID int `json:"directoryId,omitempty"`
	// Title is used to provide more details for translators.
	// It is available in UI only.
	Title string `json:"title,omitempty"`
	// Directory export pattern. Defines directory name and path in resulting
	// translations bundle.
	// Note: Can't contain : * ? " < > | symbols.
	ExportPattern string `json:"exportPattern,omitempty"`
	// Defines priority level for each branch.
	// Enum: low, normal, high. Default: normal.
	Priority string `json:"priority,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *DirectoryAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.BranchID != 0 && r.DirectoryID != 0 {
		return errors.New("branchId and directoryId cannot be used in the same request")
	}
	return nil
}

// File represents a project file.
type File struct {
	ID          int     `json:"id"`
	ProjectID   int     `json:"projectId"`
	BranchID    *int    `json:"branchId,omitempty"`
	DirectoryID *int    `json:"directoryId,omitempty"`
	Name        string  `json:"name"`
	Title       *string `json:"title,omitempty"`
	Context     *string `json:"context,omitempty"`
	Type        string  `json:"type"`
	Path        string  `json:"path"`
	Status      string  `json:"status"`
	Fields      any     `json:"fields,omitempty"`

	RevisionID             int            `json:"revisionId"`
	Priority               string         `json:"priority"`
	ImportOptions          map[string]any `json:"importOptions,omitempty"`
	ExportOptions          map[string]any `json:"exportOptions,omitempty"`
	ExcludeTargetLanguages []string       `json:"excludedTargetLanguages,omitempty"`
	ParserVersion          *int           `json:"parserVersion,omitempty"`
	CreatedAt              string         `json:"createdAt,omitempty"`
	UpdatedAt              string         `json:"updatedAt,omitempty"`
}

// FileGetResponse describes a response with a single file.
type FileGetResponse struct {
	Data *File `json:"data"`
}

// FileListResponse describes a response with a list of files.
type FileListResponse struct {
	Data []*FileGetResponse `json:"data"`
}

// FileListOptions specifies the optional parameters to the
// SourceFilesService.ListFiles method.
type FileListOptions struct {
	// OrderBy is used to sort files.
	// Enum: id, name, title, status, exportPattern, priority, createdAt, updatedAt.
	// Default: id.
	// Example: orderBy=createdAt desc,name,priority.
	OrderBy string `json:"orderBy,omitempty"`
	// BranchID is the ID of the branch to filter files by.
	// Note: Can't be used with `directoryId` in the same request.
	// To list the files from all the nested levels within the branch,
	// ensure to use the `recursion` parameter with the `branchId` parameter.
	BranchID int `json:"branchId,omitempty"`
	// DirectoryID is the ID of the directory to filter files by.
	// Note: Can't be used with `branchId` in the same request.
	// To list the files from all the nested levels within the directory,
	// ensure to use the `recursion` parameter with the `directoryId` parameter.
	DirectoryID int `json:"directoryId,omitempty"`
	// Filter files by name.
	Filter string `json:"filter,omitempty"`
	// Recursion is used to list files recursively.
	// Note: Works only when `directoryID` or `branchID` parameter is specified.
	Recursion any `json:"recursion,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of FileListOptions.
func (o *FileListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.BranchID > 0 {
		v.Add("branchId", fmt.Sprintf("%d", o.BranchID))
	}
	if o.DirectoryID > 0 {
		v.Add("directoryId", fmt.Sprintf("%d", o.DirectoryID))
	}
	if o.Filter != "" {
		v.Add("filter", o.Filter)
	}
	if recursion, ok := o.Recursion.(string); ok {
		v.Add("recursion", recursion)
	}

	return v, len(v) > 0
}

// FileAddRequest defines the structure of a request to create a new file.
type FileAddRequest struct {
	// Storage Identifier.
	StorageID int `json:"storageId"`
	// File name.
	// Note: Can't contain \ / : * ? " < > | symbols. ZIP files are not allowed.
	Name string `json:"name"`
	// Branch Identifier — defines branch to which file will be added.
	// Note: Can't be used with directoryId in same request.
	BranchID int `json:"branchId,omitempty"`
	// Directory Identifier — defines directory to which file will be added.
	// Note: Can't be used with branchId in same request.
	DirectoryID int `json:"directoryId,omitempty"`
	// Title is used to provide more details for translators.
	// It is available in UI only.
	Title string `json:"title,omitempty"`
	// Context is used to provide context about whole file.
	Context string `json:"context,omitempty"`
	// Type of the file. Default: auto.
	// Enum: auto, android, macosx, resx, properties, gettext, yaml, php, json,
	//       xml, ini, rc, resw, resjson, qtts, joomla, chrome, dtd, dklang,
	//       flex, nsh, wxl, xliff, xliff_two, html, haml, txt, csv, md, mdx_v1,
	//       mdx_v2, flsnp, fm_html, fm_md, mediawiki, docx, xlsx, sbv, properties_play,
	//       properties_xml, maxthon, go_json, dita, idml, mif, stringsdict, plist, vtt,
	//       vdf, srt, stf, toml, contentful_rt, svg, js, coffee, ts, i18next_json, xaml,
	//       arb, adoc, fbt, webxml, nestjs_i18n.
	Type string `json:"type,omitempty"`
	// Using latest parser version by default.
	// Note: Must be used together with type.
	ParserVersion int `json:"parserVersion,omitempty"`
	// File import options.
	ImportOptions FileImportOptions `json:"importOptions,omitempty"`
	// File export options.
	ExportOptions FileExportOptions `json:"exportOptions,omitempty"`
	// Set Target Languages the file should not be translated into.
	// Do not use this option if the file should be available for all project languages.
	ExcludedTargetLanguages []string `json:"excludedTargetLanguages,omitempty"`
	// Attach labels to strings.
	AttachLabelIDs []int `json:"attachLabelIds,omitempty"`
	// Fields.
	Fields map[string]any `json:"fields,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *FileAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StorageID == 0 {
		return errors.New("storageId is required")
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.BranchID > 0 && r.DirectoryID > 0 {
		return errors.New("branchId and directoryId cannot be used in the same request")
	}

	return nil
}

type (
	FileImportOptions interface{ ValidateFileImportOptions() error }

	// SpreadsheetsFileImportOptions implements the FileImportOptions interface.
	SpreadsheetFileImportOptions struct {
		// Defines whether the file includes a first-row header that should not be imported.
		// Default: false.
		FirstLineContainsHeader *bool `json:"firstLineContainsHeader,omitempty"`
		// Defines whether hidden sheets that should be imported. Default: true.
		ImportHiddenSheets *bool `json:"importHiddenSheets,omitempty"`
		// Defines whether to import translations from the file. Default: false.
		ImportTranslations *bool `json:"importTranslations,omitempty"`
		// Defines data columns mapping. The column numbering starts at 0.
		// Acceptable values are: none, identifier, sourcePhrase, sourceOrTranslation,
		// translation, context, maxLength, labels and specified languages (ex. "en", "uk").
		Scheme map[string]int `json:"scheme,omitempty"`

		// Important: ContentSegmentation option disables the possibility to upload existing translations
		// for Spreadsheet files when enabled.
		CommonFileImportOptions
	}

	// XMLFileImportOptions implements the FileImportOptions interface.
	XMLFileImportOptions struct {
		// Defines whether to translate texts placed inside the tags. Default: true.
		TranslateContent *bool `json:"translateContent,omitempty"`
		// Defines whether to translate tags attributes. Default: true.
		TranslateAttributes *bool `json:"translateAttributes,omitempty"`
		// This is an array of strings, where each item is the XPaths to DOM element that should be imported.
		TranslatableElements []string `json:"translatableElements,omitempty"`

		// Important: ContentSegmentation option disables the possibility to upload existing translations
		// for XML files when enabled.
		CommonFileImportOptions
	}

	// DOCXFileImportOptions implements the FileImportOptions interface.
	DOCXFileImportOptions struct {
		// When checked, strips additional formatting tags related to text spacing. Default: false
		// Note: Works only for files with the following extensions: *.docx, *.dotx, *.docm,
		//       *.dotm, *.xlsx, *.xltx, *.xlsm, *.xltm, *.pptx, *.potx, *.ppsx, *.pptm, *.potm, *.ppsm.
		CleanTagsAggressively *bool `json:"cleanTagsAggressively,omitempty"`
		// When checked, exposes hidden text for translation. Default: false
		// Note: Works only for files with the following extensions: *.docx, *.dotx, *.docm, *.dotm.
		TranslateHiddenText *bool `json:"translateHiddenText,omitempty"`
		// When checked, exposes hidden hyperlinks for translation. Default: false
		// Note: Works only for files with the following extensions: *.docx, *.dotx, *.docm, *.dotm,
		//       *.pptx, *.potx, *.ppsx, *.pptm, *.potm, *.ppsm.
		TranslateHyperlinkURLs *bool `json:"translateHyperlinkUrls,omitempty"`
		// When checked, exposes hidden rows and columns for translation. Default: false
		// Note: Works only for files with the following extensions: *.xlsx, *.xltx, *.xlsm, *.xltm.
		TranslateHiddenRowsAndColumns *bool `json:"translateHiddenRowsAndColumns,omitempty"`
		// When checked, expose slide notes for translation. Default: true
		// Note: Works only for files with the following extensions: *.pptx, *.potx, *.ppsx, *.pptm, *.potm, *.ppsm.
		ImportNotes *bool `json:"importNotes,omitempty"`
		// When checked, exposes hidden slides for translation. Default: false
		// Note: Works only for files with the following extensions: *.pptx, *.potx, *.ppsx, *.pptm, *.potm, *.ppsm.
		ImportHiddenSlides *bool `json:"importHiddenSlides,omitempty"`

		// Important: ContentSegmentation option disables the possibility to upload existing translations
		// for XML files when enabled.
		CommonFileImportOptions
	}

	// HTMLFileImportOptions implements the FileImportOptions interface.
	HTMLFileImportOptions struct {
		// Specify CSS selectors for elements that should not be imported.
		ExcludedElements []string `json:"excludedElements,omitempty"`

		CommonFileImportOptions
	}

	// HTMLWithFrontMatterFileImportOptions implements the FileImportOptions interface.
	HTMLWithFrontMatterFileImportOptions struct {
		// Specify CSS selectors for elements that should not be imported.
		ExcludedElements []string `json:"excludedElements,omitempty"`
		// Specify elements that should not be imported.
		ExcludedFrontMatterElements []string `json:"excludedFrontMatterElements,omitempty"`

		CommonFileImportOptions
	}

	// MDXV1FileImportOptions implements the FileImportOptions interface.
	MDXV1FileImportOptions struct {
		// Specify elements that should not be imported
		ExcludedFrontMatterElements []string `json:"excludedFrontMatterElements,omitempty"`
		// Defines whether to import code blocks. Default: false.
		ExcludeCodeBlocks *bool `json:"excludeCodeBlocks,omitempty"`

		CommonFileImportOptions
	}

	// MDXV2FileImportOptions implements the FileImportOptions interface.
	MDXV2FileImportOptions struct {
		// Specify elements that should not be imported
		ExcludedFrontMatterElements []string `json:"excludedFrontMatterElements,omitempty"`
		// Defines whether to import code blocks. Default: false.
		ExcludeCodeBlocks *bool `json:"excludeCodeBlocks,omitempty"`

		CommonFileImportOptions
	}

	// StringCatalogFileImportOptions implements the FileImportOptions interface.
	StringCatalogFileImportOptions struct {
		// Determines whether to import the key as source string if it does not exist.
		// Default: false.
		ImportKeyAsSource *bool `json:"importKeyAsSource,omitempty"`
	}

	// AdocFileImportOptions implements the FileImportOptions interface.
	AdocFileImportOptions struct {
		// Skip Include Directives. Default: false.
		ExcludeIncludeDirectives *bool `json:"excludeIncludeDirectives,omitempty"`
	}

	// OtherFileImportOptions implements the FileImportOptions interface.
	OtherFileImportOptions struct {
		// Only for xml, md, flsnp, docx, mif, idml, dita, android8 files.
		//
		// Note: When Content segmentation is enabled, the translation upload is handled by an
		// experimental machine learning technology. To achieve the best results, we recommend
		// uploading translation files with the same or as close as possible file structure
		// as in source files.
		CommonFileImportOptions
	}

	// CommonFileImportOptions implements the FileImportOptions interface.
	CommonFileImportOptions struct {
		// Defines whether to split long texts into smaller text segments. Default: true.
		ContentSegmentation *bool `json:"contentSegmentation,omitempty"`
		// Storage identifier of the SRX segmentation rules file. Default: null.
		SRXStorageID *int `json:"srxStorageId,omitempty"`
	}
)

func (o *CommonFileImportOptions) ValidateFileImportOptions() error        { return nil }
func (o *AdocFileImportOptions) ValidateFileImportOptions() error          { return nil }
func (o *StringCatalogFileImportOptions) ValidateFileImportOptions() error { return nil }

type (
	FileExportOptions interface{ ValidateFileExportOptions() error }

	// SpreadsheetsFileExportOptions implements the FileExportOptions interface.
	GeneralFileExportOptions struct {
		// File export pattern. Defines file name and path in resulting translations bundle.
		// Note: Can't contain : * ? " < > | symbols.
		ExportPattern string `json:"exportPattern,omitempty"`
	}

	// PropertiesFileExportOptions implements the FileExportOptions interface.
	PropertyFileExportOptions struct {
		// File export pattern. Defines file name and path in resulting translations bundle.
		// Note: Can't contain : * ? " < > | symbols.
		ExportPattern string `json:"exportPattern,omitempty"`
		// Values available:
		// 0 - Do not escape single quote.
		// 1 - Escape single quote by another single quote.
		// 2 - Escape single quote by a backslash.
		// 3 - Escape single quote by another single quote only in strings containing variables ({0}).
		EscapeQuotes *int `json:"escapeQuotes,omitempty"`
		// Defines whether any special characters (=, :, ! and #) should be escaped by
		// backslash in exported translations. You can add escape_special_characters per-file option.
		// Acceptable values are: 0, 1. Default is 0.
		// 0 - Do not escape special characters.
		// 1 - Escape special characters by a backslash.
		EscapeSpecialCharacters *int `json:"escapeSpecialCharacters,omitempty"`
	}

	// JavaScriptFileExportOptions implements the FileExportOptions interface.
	JavaScriptFileExportOptions struct {
		// File export pattern. Defines file name and path in resulting translations bundle.
		// Note: Can't contain : * ? " < > | symbols.
		ExportPattern string `json:"exportPattern,omitempty"`
		// Acceptable values are: `single`, `double`. Default is `single`.
		// `single` - Output will be enclosed in single quotes.
		// `double` - Output will be enclosed in double quotes.
		ExportQuotes string `json:"exportQuotes,omitempty"`
	}
)

func (o *GeneralFileExportOptions) ValidateFileExportOptions() error    { return nil }
func (o *PropertyFileExportOptions) ValidateFileExportOptions() error   { return nil }
func (o *JavaScriptFileExportOptions) ValidateFileExportOptions() error { return nil }

// FileUpdateRestoreRequest defines the structure of a request
// to update or restore a file.
type FileUpdateRestoreRequest struct {
	// Revision Identifier.
	RevisionID int `json:"revisionId,omitempty"`
	// Storage Identifier.
	StorageID int `json:"storageId,omitempty"`
	// File name.
	// Note: Can't contain \ / : * ? " < > | symbols.
	Name string `json:"name,omitempty"`
	// Update Option defines whether to keep existing translations and
	// approvals for updated strings. Default: `clear_translations_and_approvals`.
	// Enum: `clear_translations_and_approvals`, `keep_translations`, `keep_translations_and_approvals`.
	UpdateOption string `json:"updateOption,omitempty"`
	// File import options.
	ImportOptions FileImportOptions `json:"importOptions,omitempty"`
	// File export options.
	ExportOptions FileExportOptions `json:"exportOptions,omitempty"`
	// Attach labels to updated strings.
	AttachLabelIDs []int `json:"attachLabelIds,omitempty"`
	// Detach labels from updated strings.
	DetachLabelIDs []int `json:"detachLabelIds,omitempty"`
	// Enable to replace context, that have been modified in Crowdin.
	// Default: false.
	ReplaceModifiedContext *bool `json:"replaceModifiedContext,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *FileUpdateRestoreRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.RevisionID == 0 && r.StorageID == 0 {
		return errors.New("one of revisionId or storageId is required")
	}
	if r.RevisionID != 0 && r.StorageID != 0 {
		return errors.New("use only one of revisionId or storageId")
	}
	return nil
}

type (
	// FileRevision represents a file revision.
	FileRevision struct {
		ID                int  `json:"id"`
		ProjectID         int  `json:"projectId"`
		FileID            int  `json:"fileId"`
		RestoreToRevision *int `json:"restoreToRevision,omitempty"`
		Info              struct {
			Added   RevisionInfo `json:"added"`
			Deleted RevisionInfo `json:"deleted"`
			Updated RevisionInfo `json:"updated"`
		} `json:"info"`
		Date string `json:"date"`
	}

	// RevisionInfo contains the number of strings and words
	// in a file revision.
	RevisionInfo struct {
		Strings int `json:"strings"`
		Words   int `json:"words"`
	}
)

// FileRevisionResponse describes a response with
// a single file revision.
type FileRevisionResponse struct {
	Data *FileRevision `json:"data"`
}

// FileRevisionListResponse describes a response with
// a list of file revisions.
type FileRevisionListResponse struct {
	Data []*FileRevisionResponse `json:"data"`
}

// ReviewedBuild represents a reviewed source file build.
type ReviewedBuild struct {
	ID         int    `json:"id"`
	ProjectID  int    `json:"projectId"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		BranchID         *int   `json:"branchId,omitempty"`
		TargetLanguageID string `json:"targetLanguageId"`
	} `json:"attributes"`
}

// ReviewedBuildResponse describes a response with a single reviewed build.
type ReviewedBuildResponse struct {
	Data *ReviewedBuild `json:"data"`
}

// ReviewedBuildListResponse describes a response with a list of reviewed builds.
type ReviewedBuildListResponse struct {
	Data []*ReviewedBuildResponse `json:"data"`
}

// ReviewedBuildListOptions specifies the optional parameters to the
// SourceFilesService.ListReviewedBuilds method.
type ReviewedBuildListOptions struct {
	// BranchID is the ID of the branch to filter reviewed builds by.
	BranchID int `json:"branchId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of ReviewedBuildListOptions.
func (o *ReviewedBuildListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.BranchID > 0 {
		v.Add("branchId", fmt.Sprintf("%d", o.BranchID))
	}

	return v, len(v) > 0
}

// ReviewedBuildRequest defines the structure of a request to create a new reviewed build.
type ReviewedBuildRequest struct {
	// Branch Identifier.
	BranchID int `json:"branchId,omitempty"`
}

// Validate checks if the reviewed build request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ReviewedBuildRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	return nil
}
