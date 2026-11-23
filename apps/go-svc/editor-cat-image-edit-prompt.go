package main

import (
	"fmt"
	"strings"
)

const (
	editorCatImageEditMarkColor       = "#ff2d55"
	editorCatMaxImageEditInstruction  = 2000
	editorCatMaxImageEditNotes        = 20
	editorCatMaxImageEditReferences   = 8
	editorCatImageEditKindMarkup      = "markup"
	editorCatImageEditKindComment     = "comment"
	editorCatImageEditKindErase       = "erase"
	editorCatImageEditKindRemoveBG    = "removeBackground"
)

type editorCatImageEditRequest struct {
	Kind           string
	Instruction    string
	Notes          []string
	NoteReferences []int
}

func editorCatImageEditReferenceCount(request editorCatImageEditRequest) int {
	sum := 0
	for _, count := range request.NoteReferences {
		sum += count
	}
	return sum
}

func editorCatImageEditUsesMask(kind string) bool {
	return kind == editorCatImageEditKindErase
}

func editorCatImageEditCommentNotes(request editorCatImageEditRequest) []struct {
	note   string
	number int
	images []int
} {
	next := 2
	var out []struct {
		note   string
		number int
		images []int
	}
	for index, note := range request.Notes {
		count := 0
		if index < len(request.NoteReferences) {
			count = request.NoteReferences[index]
		}
		images := make([]int, 0, count)
		for range count {
			images = append(images, next)
			next++
		}
		if strings.TrimSpace(note) != "" || len(images) > 0 {
			out = append(out, struct {
				note   string
				number int
				images []int
			}{note: strings.TrimSpace(note), number: index + 1, images: images})
		}
	}
	return out
}

const editorCatImageEditKeepRest = "Leave the rest of the image exactly as it is, including all localised text."

// editorCatImageEditPrompt is the go-svc twin of hyperlocalise-web imageEditPrompt.
func editorCatImageEditPrompt(request editorCatImageEditRequest) string {
	switch request.Kind {
	case editorCatImageEditKindMarkup:
		return strings.Join([]string{
			"The " + editorCatImageEditMarkColor + " brush strokes drawn over the image mark where to change it.",
			"Change: " + request.Instruction,
			"Apply the change only where marked and remove every mark.",
			editorCatImageEditKeepRest,
		}, "\n")
	case editorCatImageEditKindComment:
		references := editorCatImageEditReferenceCount(request) > 0
		notes := editorCatImageEditCommentNotes(request)
		lines := make([]string, 0, len(notes)+4)
		if references {
			lines = append(lines, "Numbered "+editorCatImageEditMarkColor+" markers are pinned to the first image, the one to edit. Make each change at its marker:")
		} else {
			lines = append(lines, "Numbered "+editorCatImageEditMarkColor+" markers are pinned to the image. Make each change at its marker:")
		}
		for _, entry := range notes {
			names := make([]string, 0, len(entry.images))
			for _, image := range entry.images {
				names = append(names, fmt.Sprintf("image %d", image))
			}
			joined := strings.Join(names, " and ")
			switch {
			case entry.note == "":
				lines = append(lines, fmt.Sprintf("%d. Put what is in %s here.", entry.number, joined))
			case len(entry.images) > 0:
				lines = append(lines, fmt.Sprintf("%d. %s (reference: %s)", entry.number, entry.note, joined))
			default:
				lines = append(lines, fmt.Sprintf("%d. %s", entry.number, entry.note))
			}
		}
		if references {
			lines = append(lines, "The other images are references only: take from them what a note asks for, matching the edited image's lighting and perspective, and copy nothing else from them.")
		}
		lines = append(lines, "Remove every marker.", editorCatImageEditKeepRest)
		return strings.Join(lines, "\n")
	case editorCatImageEditKindErase:
		parts := []string{
			"Remove what is in the transparent area of the mask and fill it in so it matches its surroundings seamlessly, as if it was never there.",
		}
		if instruction := strings.TrimSpace(request.Instruction); instruction != "" {
			parts = append(parts, instruction)
		}
		return strings.Join(parts, "\n")
	case editorCatImageEditKindRemoveBG:
		return strings.Join([]string{
			"Remove the background completely and return the main subject, with any text and graphics on it, on a fully transparent background.",
			"Keep the subject's edges clean and do not change the subject itself.",
		}, "\n")
	default:
		return ""
	}
}

func validateEditorCatImageEditRequest(request editorCatImageEditRequest) error {
	switch request.Kind {
	case editorCatImageEditKindMarkup, editorCatImageEditKindComment, editorCatImageEditKindErase, editorCatImageEditKindRemoveBG:
	default:
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if request.Kind == editorCatImageEditKindMarkup && strings.TrimSpace(request.Instruction) == "" {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if request.Kind == editorCatImageEditKindComment && len(editorCatImageEditCommentNotes(request)) == 0 {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if len([]rune(request.Instruction)) > editorCatMaxImageEditInstruction {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	for _, note := range request.Notes {
		if len([]rune(note)) > editorCatMaxImageEditInstruction {
			return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
		}
	}
	if len(request.Notes) > editorCatMaxImageEditNotes {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if editorCatImageEditReferenceCount(request) > editorCatMaxImageEditReferences {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if editorCatImageEditReferenceCount(request) > 0 && request.Kind != editorCatImageEditKindComment {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if len(request.NoteReferences) > len(request.Notes) {
		return editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	return nil
}