package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateEditorCatImageEditRequest(t *testing.T) {
	t.Parallel()
	tooLong := strings.Repeat("a", editorCatMaxImageEditInstruction+1)
	cases := []struct {
		name    string
		request editorCatImageEditRequest
		ok      bool
	}{
		{name: "markup", request: editorCatImageEditRequest{Kind: editorCatImageEditKindMarkup, Instruction: "Brighten"}, ok: true},
		{name: "erase", request: editorCatImageEditRequest{Kind: editorCatImageEditKindErase}, ok: true},
		{name: "remove background", request: editorCatImageEditRequest{Kind: editorCatImageEditKindRemoveBG}, ok: true},
		{name: "comment notes", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment, Notes: []string{"localise this"}}, ok: true},
		{name: "unknown kind", request: editorCatImageEditRequest{Kind: "crop"}},
		{name: "markup without instruction", request: editorCatImageEditRequest{Kind: editorCatImageEditKindMarkup}},
		{name: "comment without notes", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment}},
		{name: "instruction too long", request: editorCatImageEditRequest{Kind: editorCatImageEditKindMarkup, Instruction: tooLong}},
		{name: "too many notes", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment, Notes: make([]string, editorCatMaxImageEditNotes+1)}},
		{name: "note too long", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment, Notes: []string{tooLong}}},
		{name: "more reference counts than notes", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment, Notes: []string{"a"}, NoteReferences: []int{1, 1}}},
		{name: "negative reference count", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment, Notes: []string{"a"}, NoteReferences: []int{-1}}},
		{name: "oversized note reference", request: editorCatImageEditRequest{Kind: editorCatImageEditKindComment, Notes: []string{"note"}, NoteReferences: []int{editorCatMaxImageEditReferences + 1}}},
		{name: "references on markup", request: editorCatImageEditRequest{Kind: editorCatImageEditKindMarkup, Instruction: "Brighten", NoteReferences: []int{1}}},
		{name: "too many total references", request: editorCatImageEditRequest{
			Kind: editorCatImageEditKindComment, Notes: []string{"a", "b"}, NoteReferences: []int{5, 4},
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateEditorCatImageEditRequest(tc.request)
			if tc.ok {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
			require.ErrorContains(t, err, "invalid_project_payload")
		})
	}
}

func TestEditorCatImageEditPromptKinds(t *testing.T) {
	t.Parallel()
	markup := editorCatImageEditPrompt(editorCatImageEditRequest{
		Kind: editorCatImageEditKindMarkup, Instruction: "Brighten the badge",
	})
	require.Contains(t, markup, editorCatImageEditMarkColor)
	require.Contains(t, markup, "Brighten the badge")

	erase := editorCatImageEditPrompt(editorCatImageEditRequest{
		Kind: editorCatImageEditKindErase, Instruction: "Fill the sky",
	})
	require.Contains(t, erase, "transparent area of the mask")
	require.Contains(t, erase, "Fill the sky")

	remove := editorCatImageEditPrompt(editorCatImageEditRequest{Kind: editorCatImageEditKindRemoveBG})
	require.Contains(t, remove, "fully transparent background")

	comment := editorCatImageEditPrompt(editorCatImageEditRequest{
		Kind:           editorCatImageEditKindComment,
		Notes:          []string{"use this logo", ""},
		NoteReferences: []int{0, 1},
	})
	require.Contains(t, comment, "1. use this logo")
	require.Contains(t, comment, "2. Put what is in image 2 here.")
	require.Contains(t, comment, "The other images are references only")
}

func TestEditorCatImageEditCommentNotesCapsReferenceCounts(t *testing.T) {
	t.Parallel()
	notes := editorCatImageEditCommentNotes(editorCatImageEditRequest{
		Kind:           editorCatImageEditKindComment,
		Notes:          []string{"localise this"},
		NoteReferences: []int{editorCatMaxImageEditReferences + 50},
	})
	require.Len(t, notes, 1)
	require.Len(t, notes[0].images, editorCatMaxImageEditReferences)
}
