package editor_export

import "fmt"

// makeExportRows builds n synthetic segments for tests and benchmarks.
func makeExportRows(n int) []Row {
	rows := make([]Row, n)
	for i := range rows {
		rows[i] = Row{
			Key:          fmt.Sprintf("segment.key.%d", i),
			SourceText:   fmt.Sprintf("Source line %d with \"quotes\" and <markup>.", i),
			TargetText:   fmt.Sprintf("Cible %d — traduction.", i),
			SourceLocale: "en-US",
			TargetLocale: "fr-FR",
			SourcePath:   "locales/messages.json",
		}
	}
	return rows
}
