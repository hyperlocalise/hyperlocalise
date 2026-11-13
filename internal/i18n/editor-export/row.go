package editor_export

// Row is one CAT filtered-export segment.
type Row struct {
	Key          string `json:"key"`
	SourceText   string `json:"sourceText"`
	TargetText   string `json:"targetText"`
	SourceLocale string `json:"sourceLocale"`
	TargetLocale string `json:"targetLocale"`
	SourcePath   string `json:"sourcePath,omitempty"`
	// Origin says whether a machine or a person wrote TargetText ("machine",
	// "machine_post_edited", "human", "unknown"). XLIFF marks machine text; other formats ignore it.
	Origin string `json:"origin,omitempty"`
}
