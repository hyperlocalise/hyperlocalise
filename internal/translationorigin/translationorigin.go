// Package translationorigin decides whether a machine or a person wrote a translation's text.
//
// Provenance names the last writer and is overwritten by every save, so a person who approves
// machine text unchanged would turn it into their own. Origin follows the text instead. Keep the
// rules in step with apps/hyperlocalise-web/src/lib/projects/translations/translation-origin.ts
// and the backfill in apps/hyperlocalise-web/drizzle/0177_grey_lila_cheney.sql.
package translationorigin

// Origin values, matching the project_translation_origin enum.
const (
	Machine           = "machine"
	MachinePostEdited = "machine_post_edited"
	Human             = "human"
	Unknown           = "unknown"
)

// Writer kinds: who is writing the text now.
const (
	// WriterMachine is a translation job or an agent.
	WriterMachine = "machine"
	// WriterPerson is a person in the content editor or through the public API.
	WriterPerson = "person"
	// WriterImport is a file, integration or bilingual import that does not say who wrote the text.
	WriterImport = "import"
)

// Valid reports whether value is one of the origin values.
func Valid(value string) bool {
	switch value {
	case Machine, MachinePostEdited, Human, Unknown:
		return true
	}
	return false
}

// Previous is the translation before a write. A nil *Previous means there was no translation.
type Previous struct {
	Origin string
	Text   string
}

// Next returns the origin after writer writes text over previous.
//
// A write that leaves the text as it was keeps its origin, so approving or rejecting changes
// nothing. A machine always writes machine text. A person who changes machine text post-edits it;
// changing anything else, or writing into an empty translation, is their own. An import that
// changes the text records it as unknown.
func Next(previous *Previous, writer, text string) string {
	if writer == WriterMachine {
		return Machine
	}
	if previous != nil && previous.Text == text && Valid(previous.Origin) {
		return previous.Origin
	}
	if writer == WriterImport {
		return Unknown
	}
	if previous != nil && (previous.Origin == Machine || previous.Origin == MachinePostEdited) {
		return MachinePostEdited
	}
	return Human
}

// WriterForProvenance maps a project_translation_provenance value to its writer kind.
func WriterForProvenance(provenance string) string {
	switch provenance {
	case "translation_job", "agent":
		return WriterMachine
	case "import":
		return WriterImport
	}
	return WriterPerson
}

// SQLNext is Next as a SQL expression, for statements that write many rows at once.
// prevOrigin and prevText are expressions for the earlier row (NULL when there is none),
// writer and text for the write. The result is text; cast it to project_translation_origin.
func SQLNext(prevOrigin, prevText, writer, text string) string {
	return `(case
        when ` + writer + ` = 'machine' then 'machine'
        when ` + prevOrigin + ` is not null and ` + prevText + ` = ` + text + ` then ` + prevOrigin + `::text
        when ` + writer + ` = 'import' then 'unknown'
        when ` + prevOrigin + `::text in ('machine', 'machine_post_edited') then 'machine_post_edited'
        else 'human' end)`
}
