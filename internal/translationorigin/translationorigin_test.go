package translationorigin

import "testing"

func TestValid(t *testing.T) {
	for _, value := range []string{Machine, MachinePostEdited, Human, Unknown} {
		if !Valid(value) {
			t.Fatalf("Valid(%q) = false, want true", value)
		}
	}
	for _, value := range []string{"", "spelling", "translation_job", "machine "} {
		if Valid(value) {
			t.Fatalf("Valid(%q) = true, want false", value)
		}
	}
}

func TestNext(t *testing.T) {
	tests := []struct {
		name     string
		previous *Previous
		writer   string
		text     string
		want     string
	}{
		{"machine into empty", nil, WriterMachine, "Bonjour", Machine},
		{"machine over human", &Previous{Human, "Salut"}, WriterMachine, "Bonjour", Machine},
		{"person keeps machine text", &Previous{Machine, "Bonjour"}, WriterPerson, "Bonjour", Machine},
		{"person edits machine text", &Previous{Machine, "Bonjour"}, WriterPerson, "Salut", MachinePostEdited},
		{"person edits post-edited text", &Previous{MachinePostEdited, "Salut"}, WriterPerson, "Coucou", MachinePostEdited},
		{"person writes into empty", nil, WriterPerson, "Salut", Human},
		{"person edits human text", &Previous{Human, "Salut"}, WriterPerson, "Coucou", Human},
		{"person edits unknown text", &Previous{Unknown, "Salut"}, WriterPerson, "Coucou", Human},
		{"person keeps unknown text", &Previous{Unknown, "Salut"}, WriterPerson, "Salut", Unknown},
		{"import into empty", nil, WriterImport, "Salut", Unknown},
		{"import changes machine text", &Previous{Machine, "Bonjour"}, WriterImport, "Salut", Unknown},
		{"import keeps machine text", &Previous{Machine, "Bonjour"}, WriterImport, "Bonjour", Machine},
		{"invalid previous origin", &Previous{"", "Salut"}, WriterPerson, "Salut", Human},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Next(tt.previous, tt.writer, tt.text); got != tt.want {
				t.Fatalf("Next() = %q, want %q", got, tt.want)
			}
		})
	}
}
