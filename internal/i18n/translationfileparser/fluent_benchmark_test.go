package translationfileparser

import (
	"fmt"
	"testing"
)

func BenchmarkFluentParser(b *testing.B) {
	content := []byte(`### Checkout
# Greeting shown after sign-in.
hello = Hello { $name }
escaped = Use \\{literal\\} and C:\\Temp

brand =
    .title = Hyperlocalise
    .aria-label = Open { $item }

items =
    { $count ->
        [one] One item
       *[other] { $count } items
    }
`)

	for i := 0; i < 100; i++ {
		content = append(content, []byte(fmt.Sprintf("\nmessage%d = Value %d\n    .attr = Attr %d\n", i, i, i))...)
	}

	parser := FluentParser{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, _ = parser.ParseWithContext(content)
	}
}

func BenchmarkFluentMarshal(b *testing.B) {
	content := []byte(`### Checkout
# Greeting shown after sign-in.
hello = Hello { $name }
escaped = Use \\{literal\\} and C:\\Temp

brand =
    .title = Hyperlocalise
    .aria-label = Open { $item }

items =
    { $count ->
        [one] One item
       *[other] { $count } items
    }
`)
	for i := 0; i < 100; i++ {
		content = append(content, []byte(fmt.Sprintf("\nmessage%d = Value %d\n    .attr = Attr %d\n", i, i, i))...)
	}

	values, _ := FluentParser{}.Parse(content)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalFluent(content, values)
	}
}
