# Multilingual inline editing and stable file navigation

The multilingual editor should support editing a translation in its cell without switching views. File selection should preserve the file list, loaded pages, expanded folders, and scroll position.

Use one active editor with the existing markup-aware translation control. Enter saves and moves down, Tab saves and moves across languages, Shift+Enter inserts a newline, and Escape cancels. Keep the active cell mounted across virtualization and keep language-specific drafts in the workspace store. Serialize writes per cell, preserve newer typing, and retain failed drafts for retry. Include these drafts in the existing unsaved-navigation guard.

Save using the cell's locale and file identity. Publish the authoritative response to that target's query cache, then coalesce queue reconciliation after rapid edits. Disable hidden single-language target/comment reads in multilingual mode. Forward abort signals to superseded queue requests.

Use Next's native-history integration for file and locale selection within the editor, with live search parameters driving client content. Keep route navigation for changes to another page. Reset file-list pagination only when the project or branch changes, not when selection changes.

Verify keyboard editing, language isolation, failed and overlapping saves, selection without file-list requests or remounts, and history restoration. Run the complete web test suite and `vp check --fix`.

Visible translations still use the existing bounded per-cell read scheduler. Backend batching is a separate optimization requiring provider-specific support and measurement.
