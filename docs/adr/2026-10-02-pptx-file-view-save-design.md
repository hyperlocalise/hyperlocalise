# Layout-preserving save for PowerPoint files in File view

This corrects three lines of [CAT Univer office support](../plans/2026-08-01-cat-univer-office-support-design.md) for `.pptx`: the import/export row, "Target pane: editable Univer instance", and "Source pane: read-only Univer instance". `.docx` and `.xlsx` are unchanged, and AI generation and segment extraction for office files stay out of scope.

## Problem

File view opened a PowerPoint file by reading its text into one text box per slide and saved by building a new deck from that text. Saving discarded layout, images, backgrounds, shapes, tables, and formatting, and the import read table markup as slide text.

The Univer slides editor (1.0.2) can neither carry the edit nor show the text. Its in-place text editor is not mounted, so text typed on the slide canvas never reaches the saved file. It draws only the last line of a text box, so a slide showed one paragraph of its text. It has no read-only mode.

## Decisions

- Read slide text from the package itself: one unit per paragraph that has visible text, from shapes and table cells, with slides in presentation order. A line break inside a paragraph is a line break in the unit.
- A pane shows a deck as one field per paragraph, grouped by slide number, instead of a Univer instance. A field maps to exactly one paragraph, so a save never has to match lines to paragraphs and is never refused.
- A read-only pane shows the same fields without accepting edits, so source and target line up field for field. Its text can still be selected and copied.
- On save, write each changed field back into its paragraph inside the file the pane was opened from. Unchanged paragraphs and every other part of the package are carried over as they are.
- An edited paragraph keeps a single run's formatting, the run that held most of its text, preferring runs that are not links. Bold words and links inside an edited paragraph are lost; they are kept in paragraphs that were not edited.
- Speaker notes, layouts, masters, charts, diagrams, and fields such as slide numbers are not editable and are carried over.
- A target with no translated file starts from the source file, so the first save stores the source deck with the edits.
- An editable pane with neither a source nor a target file keeps the Univer slides view and saves a plain generated deck.

## Validation

Unit tests cover extraction, write-back, the editable and read-only panes, and the round trip from source deck to saved translation. Seeding, editing, saving, and reopening a saved deck were also checked in a browser. The packages tested were generated or written by hand, not authored in PowerPoint, Keynote, or Google Slides.
