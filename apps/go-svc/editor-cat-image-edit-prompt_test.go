package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateEditorCatImageEditRequestRejectsOversizedNoteReferences(t *testing.T) {
	err := validateEditorCatImageEditRequest(editorCatImageEditRequest{
		Kind:           editorCatImageEditKindComment,
		Notes:          []string{"note"},
		NoteReferences: []int{editorCatMaxImageEditReferences + 1},
	})
	require.Error(t, err)
}

func TestEditorCatImageEditCommentNotesCapsReferenceCounts(t *testing.T) {
	notes := editorCatImageEditCommentNotes(editorCatImageEditRequest{
		Kind:           editorCatImageEditKindComment,
		Notes:          []string{"localise this"},
		NoteReferences: []int{editorCatMaxImageEditReferences + 50},
	})
	require.Len(t, notes, 1)
	require.Len(t, notes[0].images, editorCatMaxImageEditReferences)
}
