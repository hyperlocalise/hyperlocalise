package icuparser

import "testing"

func TestSamePlaceholderSetIgnoresOrderAndDuplicates(t *testing.T) {
	if !SamePlaceholderSet([]string{"b", "a", "b"}, []string{"a", "b"}) {
		t.Fatalf("expected placeholder sets to match")
	}
}

func TestSameICUBlocks(t *testing.T) {
	tests := []struct {
		name string
		a    []BlockSignature
		b    []BlockSignature
		want bool
	}{
		{
			name: "identical blocks",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			want: true,
		},
		{
			name: "pound mismatch is accepted",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{1}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}, Pounds: []int{2}}},
			want: true,
		},
		{
			name: "type mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{{Arg: "n", Type: "select", Options: []string{"one"}}},
			want: false,
		},
		{
			name: "arg mismatch",
			a:    []BlockSignature{{Arg: "n1", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{{Arg: "n2", Type: "plural", Options: []string{"one"}}},
			want: false,
		},
		{
			name: "options mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"other"}}},
			want: false,
		},
		{
			name: "length mismatch",
			a:    []BlockSignature{{Arg: "n", Type: "plural", Options: []string{"one"}}},
			b:    []BlockSignature{},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := SameICUBlocks(tt.a, tt.b); got != tt.want {
				t.Errorf("SameICUBlocks() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFormatICUBlocks(t *testing.T) {
	tests := []struct {
		name   string
		blocks []BlockSignature
		want   string
	}{
		{
			name:   "empty",
			blocks: nil,
			want:   "[]",
		},
		{
			name: "plural with pounds",
			blocks: []BlockSignature{
				{Arg: "n", Type: "plural", Options: []string{"one", "other"}, Pounds: []int{1, 0}},
			},
			want: "[n:plural[one other]#[1 0]]",
		},
		{
			name: "select without pounds",
			blocks: []BlockSignature{
				{Arg: "g", Type: "select", Options: []string{"female", "male"}},
			},
			want: "[g:select[female male]]",
		},
		{
			name: "mixed blocks",
			blocks: []BlockSignature{
				{Arg: "count", Type: "plural", Options: []string{"other"}, Pounds: []int{1}},
				{Arg: "gender", Type: "select", Options: []string{"other"}},
			},
			want: "[count:plural[other]#[1], gender:select[other]]",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FormatICUBlocks(tt.blocks); got != tt.want {
				t.Errorf("FormatICUBlocks() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseInvariantMustacheNormalization(t *testing.T) {
	tests := []struct {
		name    string
		msg     string
		want    []string
		wantErr bool
	}{
		{
			name: "simple mustache",
			msg:  "Hello {{name}}",
			want: []string{"name"},
		},
		{
			name: "mustache with dots and dollars",
			msg:  "Price for {{user.id}} is {{$amount}}",
			want: []string{"$amount", "user.id"},
		},
		{
			name: "mixed icu and mustache",
			msg:  "{count, plural, one {item} other {items}} for {{user_name}}",
			want: []string{"count", "user_name"},
		},
		{
			name:    "invalid mustache identifier (spaces)",
			msg:     "Hello {{not a valid id}}",
			wantErr: true,
		},
		{
			name: "mustache with dashes",
			msg:  "Value: {{my-dash-id}}",
			want: []string{"my-dash-id"},
		},
		{
			name: "mustache with unicode",
			msg:  "Hello {{π}}",
			want: []string{"π"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inv, err := ParseInvariant(tt.msg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseInvariant(%q) error = %v, wantErr %v", tt.msg, err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if !SamePlaceholderSet(inv.Placeholders, tt.want) {
				t.Errorf("ParseInvariant(%q) placeholders = %v, want %v", tt.msg, inv.Placeholders, tt.want)
			}
		})
	}
}

func TestParseInvariantSorting(t *testing.T) {
	// Blocks should be sorted by Arg, then Type, then Options/Pounds.
	msg := "{b, select, other {x}} {a, plural, one {#} other {##}} {a, select, other {y}}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	if len(inv.ICUBlocks) != 3 {
		t.Fatalf("expected 3 ICU blocks, got %d", len(inv.ICUBlocks))
	}

	// Expected order:
	// 1. Arg: a, Type: plural
	// 2. Arg: a, Type: select
	// 3. Arg: b, Type: select
	expected := []struct {
		arg  string
		kind string
	}{
		{"a", "plural"},
		{"a", "select"},
		{"b", "select"},
	}

	for i, exp := range expected {
		if inv.ICUBlocks[i].Arg != exp.arg || inv.ICUBlocks[i].Type != exp.kind {
			t.Errorf("block %d: expected %s:%s, got %s:%s", i, exp.arg, exp.kind, inv.ICUBlocks[i].Arg, inv.ICUBlocks[i].Type)
		}
	}
}

func TestCountPoundsNestedPlurals(t *testing.T) {
	// Inside the "one" branch of c1, there is one # (for c1) and a nested c2 plural.
	// The # inside the c2 plural MUST NOT be counted towards c1's pound count,
	// as it refers to c2.
	msg := "{c1, plural, one {# {c2, plural, one {#} other {##}}}}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	// c1 has one option ("one") with 1 pound sign.
	// c2 has two options ("one", "other") with 1 and 2 pound signs respectively.
	expected := []struct {
		arg    string
		pounds []int
	}{
		{arg: "c1", pounds: []int{1}},
		{arg: "c2", pounds: []int{1, 2}},
	}

	if len(inv.ICUBlocks) != len(expected) {
		t.Fatalf("expected %d ICU blocks, got %d", len(expected), len(inv.ICUBlocks))
	}

	for i, exp := range expected {
		block := inv.ICUBlocks[i]
		if block.Arg != exp.arg {
			t.Errorf("block %d: expected Arg %q, got %q", i, exp.arg, block.Arg)
		}
		if !slicesEqual(block.Pounds, exp.pounds) {
			t.Errorf("block %d (%s): expected Pounds %v, got %v", i, exp.arg, exp.pounds, block.Pounds)
		}
	}
}

func TestSelectArgumentInPlaceholders(t *testing.T) {
	// Select arguments MUST be included in the invariant's Placeholder list,
	// just like plural arguments and simple interpolation placeholders.
	msg := "{gender, select, male {male} other {other}}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	found := false
	for _, p := range inv.Placeholders {
		if p == "gender" {
			found = true
			break
		}
	}

	if !found {
		t.Errorf("expected 'gender' in placeholders, got %v", inv.Placeholders)
	}
}

func TestUnicodePlaceholderInPlaceholders(t *testing.T) {
	// Unicode letters (e.g. π) MUST be supported in placeholders.
	msg := "Hello {π}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	found := false
	for _, p := range inv.Placeholders {
		if p == "π" {
			found = true
			break
		}
	}

	if !found {
		t.Errorf("expected 'π' in placeholders, got %v", inv.Placeholders)
	}
}

func TestNumericPlaceholderInPlaceholders(t *testing.T) {
	// Numeric ICU arguments (e.g. {0}, {1}) MUST be included in the invariant's
	// Placeholder list for tool parity.
	msg := "{0} and {1}"
	inv, err := ParseInvariant(msg)
	if err != nil {
		t.Fatalf("ParseInvariant failed: %v", err)
	}

	found0 := false
	found1 := false
	for _, p := range inv.Placeholders {
		if p == "0" {
			found0 = true
		}
		if p == "1" {
			found1 = true
		}
	}

	if !found0 {
		t.Errorf("expected '0' in placeholders, got %v", inv.Placeholders)
	}
	if !found1 {
		t.Errorf("expected '1' in placeholders, got %v", inv.Placeholders)
	}
}

func TestParseInvariantDeduplicatesPlaceholders(t *testing.T) {
	// ParseInvariant MUST return a unique set of placeholders, even if an
	// argument is used multiple times or through different elements (like #).
	tests := []struct {
		name string
		msg  string
		want []string
	}{
		{
			name: "duplicate arguments",
			msg:  "Hello {name} {name}",
			want: []string{"name"},
		},
		{
			name: "plural with multiple pounds",
			msg:  "{n, plural, one {#} other {# items}}",
			want: []string{"n"},
		},
		{
			name: "mixed argument and pound",
			msg:  "{count, plural, other {Value: {count} (#)}}",
			want: []string{"count"},
		},
		{
			name: "nested duplicates",
			msg:  "{n, plural, other {{n, plural, other {#}}}}",
			want: []string{"n"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inv, err := ParseInvariant(tt.msg)
			if err != nil {
				t.Fatalf("ParseInvariant(%q) failed: %v", tt.msg, err)
			}
			if !slicesEqual(inv.Placeholders, tt.want) {
				t.Errorf("ParseInvariant(%q) placeholders = %v, want %v", tt.msg, inv.Placeholders, tt.want)
			}
		})
	}
}

func TestHasDuplicatePounds(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		want bool
	}{
		{"no blocks", "plain text", false},
		{"no pounds", "{n, plural, one {item} other {items}}", false},
		{"single pounds", "{n, plural, one {# item} other {# items}}", false},
		{"duplicate pounds", "{n, plural, one {## items} other {items}}", true},
		{"duplicate in other branch", "{n, plural, one {#} other {##}}", true},
		{"multiple blocks, one duplicate", "{n1, plural, one {#}}{n2, plural, one {##}}", true},
		{"nested duplicate", "{n1, plural, one {{n2, plural, other {##}}}}", true},
		{"select inside plural", "{n, plural, other {{gender, select, male {# he} female {# she} other {# they}}}}", false},
		{"select inside plural duplicate", "{n, plural, other {# {gender, select, male {#} female {she} other {they}}}}", true},
		{"select block", "{gender, select, male {he} female {she} other {they}}", false},
		{"selectordinal duplicate", "{n, selectordinal, one {##st} other {#th}}", true},
		{"mustache placeholder", "Hello {{name}}", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inv, err := ParseInvariant(tt.msg)
			if err != nil {
				t.Fatalf("ParseInvariant(%q) failed: %v", tt.msg, err)
			}
			if got := HasDuplicatePounds(inv.ICUBlocks); got != tt.want {
				t.Errorf("HasDuplicatePounds() = %v, want %v for %q", got, tt.want, tt.msg)
			}
		})
	}
}


func TestParseInvariantIncludesTypedBlocks(t *testing.T) {
	tests := []struct {
		msg  string
		want []BlockSignature
	}{
		{
			msg: "{n, number}",
			want: []BlockSignature{
				{Arg: "n", Type: "number"},
			},
		},
		{
			msg: "{d, date}",
			want: []BlockSignature{
				{Arg: "d", Type: "date"},
			},
		},
		{
			msg: "{t, time}",
			want: []BlockSignature{
				{Arg: "t", Type: "time"},
			},
		},
		{
			msg: "{p, plural, other {{n, number}}}",
			want: []BlockSignature{
				{Arg: "n", Type: "number"},
				{Arg: "p", Type: "plural", Options: []string{"other"}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.msg, func(t *testing.T) {
			inv, err := ParseInvariant(tt.msg)
			if err != nil {
				t.Fatalf("ParseInvariant failed: %v", err)
			}
			if !SameICUBlocks(inv.ICUBlocks, tt.want) {
				t.Errorf("ParseInvariant(%q) ICUBlocks = %s, want %s", tt.msg, FormatICUBlocks(inv.ICUBlocks), FormatICUBlocks(tt.want))
			}
		})
	}
}
