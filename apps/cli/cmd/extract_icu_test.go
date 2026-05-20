package cmd

import "testing"

func TestFlattenExtractICUMessage(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "no selector stays unchanged",
			in:   "Hello {name}",
			want: "Hello {name}",
		},
		{
			name: "plural hoists prefix suffix and pound",
			in:   "You have {count, plural, one{one project} other{# projects}}.",
			want: "{count, plural, one{You have one project.} other{You have # projects.}}",
		},
		{
			name: "select hoists prefix and suffix",
			in:   "The {gender, select, female{hostess} male{host} other{host}} arrived.",
			want: "{gender, select, female{The hostess arrived.} male{The host arrived.} other{The host arrived.}}",
		},
		{
			name: "selectordinal hoists prefix and suffix",
			in:   "You finished {place, selectordinal, one{#st} two{#nd} few{#rd} other{#th}}.",
			want: "{place, selectordinal, one{You finished #st.} two{You finished #nd.} few{You finished #rd.} other{You finished #th.}}",
		},
		{
			name: "nested selectors are flattened recursively",
			in:   "{gender, select, female{She has {count, plural, one{one file} other{# files}}} male{He has {count, plural, one{one file} other{# files}}} other{They have {count, plural, one{one file} other{# files}}}}.",
			want: "{gender, select, female{{count, plural, one{She has one file.} other{She has # files.}}} male{{count, plural, one{He has one file.} other{He has # files.}}} other{{count, plural, one{They have one file.} other{They have # files.}}}}",
		},
		{
			name: "rich text tags are preserved in plural branches",
			in:   "{count, plural, one{<b>One file</b>} other{<b># files</b>}} selected.",
			want: "{count, plural, one{<b>One file</b> selected.} other{<b># files</b> selected.}}",
		},
		{
			name: "quoted braces in literals are preserved",
			in:   "Set '{'count'}' to {count, plural, one{one value} other{# values}}.",
			want: "{count, plural, one{Set '{'count'}' to one value.} other{Set '{'count'}' to # values.}}",
		},
		{
			name: "plural offset is preserved",
			in:   "Invite {count, plural, offset:1 =0{nobody} one{{name}} other{{name} and # others}}.",
			want: "{count, plural, offset:1 =0{Invite nobody.} one{Invite {name}.} other{Invite {name} and # others.}}",
		},
		{
			name: "unsupported custom formatter stays unchanged",
			in:   "You waited {count, plural, one{{duration, duration} day} other{{duration, duration} days}}.",
			want: "You waited {count, plural, one{{duration, duration} day} other{{duration, duration} days}}.",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := flattenExtractICUMessage(tt.in)
			if err != nil {
				t.Fatalf("flatten ICU message: %v", err)
			}
			if got != tt.want {
				t.Fatalf("flattened message = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFlattenExtractICUMessageReturnsParseError(t *testing.T) {
	if _, err := flattenExtractICUMessage("Broken {count, plural, one{thing}"); err == nil {
		t.Fatal("expected parse error")
	}
}
