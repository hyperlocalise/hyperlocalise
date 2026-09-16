package editor_export

// Row is one CAT filtered-export segment.
type Row struct {
	Key          string `json:"key"`
	SourceText   string `json:"sourceText"`
	TargetText   string `json:"targetText"`
	SourceLocale string `json:"sourceLocale"`
	TargetLocale string `json:"targetLocale"`
	SourcePath   string `json:"sourcePath,omitempty"`
}
