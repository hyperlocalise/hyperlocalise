// Package sourcetext decides which strings may have their source text edited in the platform.
//
// A string outside any file always may. A string in a file may only when the file is a key-value
// format the platform can write the edited text back into, and the file came from people or a
// repository rather than from an integration whose service owns the source text. Keep the
// extensions in step with apps/hyperlocalise-web/src/lib/projects/files/source-text-editable-paths.ts;
// the upload surfaces live only here, where edits are allowed or refused.
package sourcetext

import (
	"strings"
)

// EditableExtensions are the file extensions of the JSON family, the formats with a writer.
var EditableExtensions = []string{".json", ".jsonc", ".arb"}

// EditableUploadSurfaces are the ways a file arrives that leave its source text to people or a
// repository. An integration's files are left out: their service holds the source text.
var EditableUploadSurfaces = []string{
	"files_page",
	"public_api",
	"inbox_reply",
	"mcp",
	"chat",
	"web_chat",
	"slack_agent",
	"agent_post",
	"gitlab_content_sync",
	"github_automation",
	"content_sync",
}

// SegmentMarker starts the internal markers that stand for inline markup in segmented text.
const SegmentMarker = "\x1e"

// SentenceKeyMarker marks a key that segmentation split out of a longer text.
const SentenceKeyMarker = "#srx."

// ValidText reports whether new source text may be stored: it holds no internal marker, which
// would make the string look like a segment with markup, and no NUL, which Postgres refuses.
func ValidText(sourceText string) bool {
	return !strings.Contains(sourceText, SegmentMarker) && !strings.ContainsRune(sourceText, 0)
}

// FileEditableSQL is a SQL predicate, true when the key aliased `alias` may have its source text
// edited as far as its file goes: it is in no file, or in a JSON-family file whose reconciled
// version came from an editable upload surface. A file with no reconciled version or no recorded
// surface is left alone, since an integration may have brought it in.
func FileEditableSQL(alias string) string {
	extensions := make([]string, len(EditableExtensions))
	for i, extension := range EditableExtensions {
		extensions[i] = "lower(sf.source_path) like '%" + extension + "'"
	}
	surfaces := make([]string, len(EditableUploadSurfaces))
	for i, surface := range EditableUploadSurfaces {
		surfaces[i] = "'" + surface + "'"
	}
	return `(` + alias + `.repository_source_file_id is null or exists (
            select 1 from repository_source_files sf
            join repository_source_file_versions sv on sv.id = sf.reconciled_source_file_version_id
            where sf.id = ` + alias + `.repository_source_file_id
                and (` + strings.Join(extensions, " or ") + `)
                and sv.upload_surface in (` + strings.Join(surfaces, ", ") + `)
        ))`
}

// KeyEditableSQL adds the key's own rules to FileEditableSQL: not hidden (a hidden key is never
// written back), no internal markers in its text, and not a sentence split out of a longer text.
func KeyEditableSQL(alias string) string {
	return `(` + FileEditableSQL(alias) + ` and not ` + alias + `.is_hidden and strpos(` + alias + `.source_text, chr(30)) = 0 and strpos(` + alias + `.key, '` + SentenceKeyMarker + `') = 0)`
}
