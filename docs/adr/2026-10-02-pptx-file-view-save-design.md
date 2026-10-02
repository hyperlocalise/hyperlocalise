# Layout-preserving save for PowerPoint files in File view

This corrects two lines of [CAT Univer office support](../plans/2026-08-01-cat-univer-office-support-design.md) for `.pptx`: the import/export row and "Target pane: editable Univer instance". `.docx` and `.xlsx` are unchanged, and AI generation and segment extraction for office files stay out of scope.

## Problem

File view opened a PowerPoint file by reading its text into one text box per slide and saved by building a new deck from that text. Saving discarded layout, images, backgrounds, shapes, tables, and formatting, and the import read table markup as slide text.

The Univer slides editor (1.0.2) cannot carry the edit either. Its in-place text editor is not mounted, so text cannot be typed on the slide canvas, and it has no read-only mode.

## Decisions

- Read slide text from the package itself: one unit per paragraph that has visible text, from shapes and table cells, with slides in presentation order. A line break inside a paragraph is a line break in the unit.
- An editable target shows one field per paragraph, grouped by slide number, instead of a Univer instance. A field maps to exactly one paragraph, so a save never has to match lines to paragraphs and is never refused.
- On save, write each changed field back into its paragraph inside the file the pane was opened from. Unchanged paragraphs and every other part of the package are carried over as they are.
- An edited paragraph keeps a single run's formatting, the run that held most of its text, preferring runs that are not links. Bold words and links inside an edited paragraph are lost; they are kept in paragraphs that were not edited.
- Speaker notes, layouts, masters, charts, diagrams, and fields such as slide numbers are not editable and are carried over.
- A target with no translated file starts from the source file, so the first save stores the source deck with the edits.
- Read-only panes keep the Univer slides view of the text. Presses on its slide canvas and its control for adding a slide are blocked, because selecting, moving, and deleting objects all start there.
- A pane with neither a source nor a target file still saves a plain generated deck.

## Validation

Unit tests cover extraction, write-back, the pane round trip from source deck to saved translation, and the read-only guard. The panes were not exercised in a browser, and the packages tested were generated or written by hand, not authored in PowerPoint, Keynote, or Google Slides.
