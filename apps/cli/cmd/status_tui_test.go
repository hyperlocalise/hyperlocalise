package cmd

import (
	"bytes"
	"fmt"
	"slices"
	"strings"
	"testing"

	"charm.land/bubbles/v2/help"
	"charm.land/bubbles/v2/table"
	tea "charm.land/bubbletea/v2"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func newTestStatusDashboard(summary statusSummary, group, bucket string) statusDashboardModel {
	m := statusDashboardModel{
		summary: summary,
		group:   group,
		bucket:  bucket,
		keys:    defaultStatusKeyMap(),
		help:    help.New(),
		tbl: table.New(
			table.WithColumns([]table.Column{
				{Title: "Locale", Width: 12},
				{Title: "Total", Width: 8},
				{Title: "Translated", Width: 12},
				{Title: "Needs Review", Width: 14},
				{Title: "Source Match", Width: 14},
				{Title: "Untranslated", Width: 13},
				{Title: "Completion", Width: 11},
			}),
			table.WithHeight(15),
			table.WithFocused(true),
		),
	}
	m.sortRows()
	return m
}

func statusSummaryFixture() statusSummary {
	return statusSummary{
		Total:        10,
		Translated:   6,
		NeedsReview:  1,
		SourceMatch:  1,
		Untranslated: 2,
		ByLocale: []localeSummary{
			{Locale: "fr-FR", Total: 4, Translated: 1, Untranslated: 2, NeedsReview: 1},
			{Locale: "de-DE", Total: 3, Translated: 3},
			{Locale: "es-ES", Total: 3, Translated: 2, SourceMatch: 1},
		},
	}
}

func statusRowLocales(m statusDashboardModel) []string {
	locales := make([]string, 0, len(m.tbl.Rows()))
	for _, row := range m.tbl.Rows() {
		locales = append(locales, row[0])
	}
	return locales
}

func updateStatusDashboard(t *testing.T, m statusDashboardModel, msg tea.Msg) (statusDashboardModel, tea.Cmd) {
	t.Helper()
	next, cmd := m.Update(msg)
	updated, ok := next.(statusDashboardModel)
	if !ok {
		t.Fatalf("expected statusDashboardModel, got %T", next)
	}
	return updated, cmd
}

func assertStatusTableSize(t *testing.T, m statusDashboardModel, width, height int) {
	t.Helper()
	want := newTestStatusDashboard(statusSummaryFixture(), "", "").tbl
	want.SetWidth(width)
	want.SetHeight(height)
	if m.tbl.Width() != want.Width() || m.tbl.Height() != want.Height() {
		t.Fatalf("table size = %dx%d, want %dx%d", m.tbl.Width(), m.tbl.Height(), want.Width(), want.Height())
	}
}

func statusKey(text string) tea.KeyPressMsg {
	r := []rune(text)[0]
	return tea.KeyPressMsg(tea.Key{Text: text, Code: r})
}

func TestStatusDashboardViewShowsScopeTotalsAndSelection(t *testing.T) {
	m := newTestStatusDashboard(statusSummaryFixture(), "web", "")

	view := fmt.Sprint(m.View())
	for _, want := range []string{
		"hyperlocalise status dashboard",
		"group=web  bucket=-  sort=locale  reverse=false",
		"total=10",
		"translated=6",
		"needs_review=1",
		"source_match=1",
		"untranslated=2",
		"selected locale=de-DE completion=100.0%",
	} {
		if !strings.Contains(view, want) {
			t.Fatalf("view missing %q:\n%s", want, view)
		}
	}
}

func TestStatusDashboardSortCyclesAndReverses(t *testing.T) {
	m := newTestStatusDashboard(statusSummaryFixture(), "", "")
	if got := strings.Join(statusRowLocales(m), ","); got != "de-DE,es-ES,fr-FR" {
		t.Fatalf("locale order = %s", got)
	}

	m, _ = updateStatusDashboard(t, m, statusKey("s"))
	if m.sortModeLabel() != "untranslated" || strings.Join(statusRowLocales(m), ",") != "fr-FR,de-DE,es-ES" {
		t.Fatalf("untranslated sort = %s %v", m.sortModeLabel(), statusRowLocales(m))
	}

	m, _ = updateStatusDashboard(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyTab}))
	if m.sortModeLabel() != "translated" || strings.Join(statusRowLocales(m), ",") != "de-DE,es-ES,fr-FR" {
		t.Fatalf("translated sort = %s %v", m.sortModeLabel(), statusRowLocales(m))
	}

	m, _ = updateStatusDashboard(t, m, statusKey("r"))
	if !m.reverse || strings.Join(statusRowLocales(m), ",") != "fr-FR,es-ES,de-DE" {
		t.Fatalf("reversed translated sort = %v", statusRowLocales(m))
	}
	if view := fmt.Sprint(m.View()); !strings.Contains(view, "sort=translated  reverse=true") {
		t.Fatalf("view missing reversed sort meta:\n%s", view)
	}

	m, _ = updateStatusDashboard(t, m, statusKey("s"))
	if m.sortModeLabel() != "locale" {
		t.Fatalf("expected sort to wrap to locale, got %s", m.sortModeLabel())
	}
}

func TestStatusDashboardTiedRowsSortDeterministically(t *testing.T) {
	tied := statusSummary{
		ByLocale: []localeSummary{
			{Locale: "fr-FR", Total: 2, Translated: 1, Untranslated: 1},
			{Locale: "de-DE", Total: 2, Translated: 1, Untranslated: 1},
			{Locale: "ja-JP", Total: 3, Translated: 2, Untranslated: 1},
			{Locale: "es-ES", Total: 2, Translated: 1, Untranslated: 1},
		},
	}
	cases := []struct {
		mode     statusSortMode
		forward  string
		backward string
	}{
		{mode: sortByLocale, forward: "de-DE,es-ES,fr-FR,ja-JP", backward: "ja-JP,fr-FR,es-ES,de-DE"},
		{mode: sortByUntranslated, forward: "de-DE,es-ES,fr-FR,ja-JP", backward: "ja-JP,fr-FR,es-ES,de-DE"},
		{mode: sortByTranslated, forward: "ja-JP,de-DE,es-ES,fr-FR", backward: "fr-FR,es-ES,de-DE,ja-JP"},
	}
	for _, tc := range cases {
		for _, reverse := range []bool{false, true} {
			summary := tied
			summary.ByLocale = slices.Clone(tied.ByLocale)
			m := newTestStatusDashboard(summary, "", "")
			m.sortMode = tc.mode
			m.reverse = reverse
			want := tc.forward
			if reverse {
				want = tc.backward
			}
			for range 3 {
				m.sortRows()
				if got := strings.Join(statusRowLocales(m), ","); got != want {
					t.Fatalf("sort=%s reverse=%v order = %s, want %s", m.sortModeLabel(), reverse, got, want)
				}
			}
		}
	}
}

func TestStatusDashboardHelpToggleWindowSizeAndNavigation(t *testing.T) {
	m := newTestStatusDashboard(statusSummaryFixture(), "", "")

	m, cmd := updateStatusDashboard(t, m, tea.WindowSizeMsg{Width: 20, Height: 5})
	if cmd != nil || m.width != 20 || m.height != 5 {
		t.Fatalf("unexpected window state width=%d height=%d cmd=%v", m.width, m.height, cmd)
	}
	assertStatusTableSize(t, m, 40, 8)

	m, _ = updateStatusDashboard(t, m, tea.WindowSizeMsg{Width: 120, Height: 40})
	assertStatusTableSize(t, m, 118, 31)

	m, _ = updateStatusDashboard(t, m, statusKey("?"))
	if !m.help.ShowAll {
		t.Fatal("expected full help after ?")
	}
	m, _ = updateStatusDashboard(t, m, statusKey("?"))
	if m.help.ShowAll {
		t.Fatal("expected short help after second ?")
	}

	m, _ = updateStatusDashboard(t, m, tea.KeyPressMsg(tea.Key{Code: tea.KeyDown}))
	if view := fmt.Sprint(m.View()); !strings.Contains(view, "selected locale=es-ES completion=66.7%") {
		t.Fatalf("expected cursor to move to es-ES:\n%s", view)
	}
}

func TestStatusDashboardQuitKeys(t *testing.T) {
	for _, msg := range []tea.KeyPressMsg{
		statusKey("q"),
		tea.KeyPressMsg(tea.Key{Code: tea.KeyEscape}),
		tea.KeyPressMsg(tea.Key{Code: 'c', Mod: tea.ModCtrl}),
	} {
		m := newTestStatusDashboard(statusSummaryFixture(), "", "")
		_, cmd := updateStatusDashboard(t, m, msg)
		if cmd == nil {
			t.Fatalf("%s: expected quit command", msg.String())
		}
		if _, ok := cmd().(tea.QuitMsg); !ok {
			t.Fatalf("%s: expected tea.QuitMsg", msg.String())
		}
	}
}

func TestStatusDashboardSortKeepsCursorInRange(t *testing.T) {
	m := newTestStatusDashboard(statusSummaryFixture(), "", "")
	m.tbl.SetCursor(2)
	m.summary.ByLocale = m.summary.ByLocale[:1]
	m.sortRows()
	if m.tbl.Cursor() != 0 {
		t.Fatalf("expected cursor clamped to 0, got %d", m.tbl.Cursor())
	}

	empty := newTestStatusDashboard(statusSummary{}, "", "")
	if view := fmt.Sprint(empty.View()); strings.Contains(view, "selected locale=") {
		t.Fatalf("expected no selection line for empty summary:\n%s", view)
	}
}

func TestBuildStatusSummaryCountsEveryStatusAndAddsUnlistedLocales(t *testing.T) {
	entries := []storage.Entry{
		{Key: "a", Locale: "fr-FR", Value: "Bonjour"},
		{Key: "b", Locale: "fr-FR", Value: "  "},
		{Key: "c", Locale: "fr-FR", Value: "Brouillon", Provenance: storage.EntryProvenance{Origin: storage.OriginLLM, State: storage.StateDraft}},
		{Key: "d", Locale: "ja-JP", Value: "Hello", Metadata: map[string]string{statusSourceValueMetadataKey: " Hello "}},
	}

	summary := buildStatusSummary(entries, []string{"fr-FR", "de-DE"})
	if summary.Total != 4 || summary.Translated != 1 || summary.Untranslated != 1 || summary.NeedsReview != 1 || summary.SourceMatch != 1 {
		t.Fatalf("unexpected totals: %+v", summary)
	}
	want := []localeSummary{
		{Locale: "de-DE"},
		{Locale: "fr-FR", Total: 3, Translated: 1, NeedsReview: 1, Untranslated: 1},
		{Locale: "ja-JP", Total: 1, SourceMatch: 1},
	}
	if len(summary.ByLocale) != len(want) {
		t.Fatalf("by locale = %+v", summary.ByLocale)
	}
	for i := range want {
		if summary.ByLocale[i] != want[i] {
			t.Fatalf("by locale[%d] = %+v, want %+v", i, summary.ByLocale[i], want[i])
		}
	}
}

func TestStatusPercentAndEmptyDash(t *testing.T) {
	if got := percent(1, 0); got != "0.0%" {
		t.Fatalf("percent(1,0) = %q", got)
	}
	if got := percent(1, 3); got != "33.3%" {
		t.Fatalf("percent(1,3) = %q", got)
	}
	if emptyDash(" ") != "-" || emptyDash("web") != "web" {
		t.Fatal("unexpected emptyDash output")
	}
}

func TestRunStatusDashboardRequiresTTY(t *testing.T) {
	err := runStatusDashboard(&bytes.Buffer{}, nil, nil, "", "")
	if err == nil || err.Error() != "--interactive requires a TTY output" {
		t.Fatalf("expected TTY error, got %v", err)
	}
}

func TestStatusKeyMapHelpBindings(t *testing.T) {
	keys := defaultStatusKeyMap()
	if len(keys.ShortHelp()) != 4 || len(keys.FullHelp()) != 1 || len(keys.FullHelp()[0]) != 4 {
		t.Fatal("unexpected status key help bindings")
	}
	if got := keys.Sort.Help().Key; got != "s/tab" {
		t.Fatalf("sort help key = %q", got)
	}
}
