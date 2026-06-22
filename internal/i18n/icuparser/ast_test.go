package icuparser

import "testing"

func TestElementTypeMethods(t *testing.T) {
	tests := []struct {
		name string
		el   Element
		want ElementType
	}{
		{name: "literal", el: LiteralElement{}, want: TypeLiteral},
		{name: "argument", el: ArgumentElement{}, want: TypeArgument},
		{name: "number", el: NumberElement{}, want: TypeNumber},
		{name: "date", el: DateElement{}, want: TypeDate},
		{name: "time", el: TimeElement{}, want: TypeTime},
		{name: "select", el: SelectElement{}, want: TypeSelect},
		{name: "plural", el: PluralElement{Ordinal: false}, want: TypePlural},
		{name: "plural_explicit", el: PluralElement{PluralType: TypePlural}, want: TypePlural},
		{name: "selectordinal", el: PluralElement{Ordinal: true}, want: TypeSelectOrdinal},
		{name: "selectordinal_explicit", el: PluralElement{PluralType: TypeSelectOrdinal}, want: TypeSelectOrdinal},
		{name: "pound", el: PoundElement{}, want: TypePound},
		{name: "tag", el: TagElement{}, want: TypeTag},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.el.Type(); got != tt.want {
				t.Fatalf("unexpected type: got %q want %q", got, tt.want)
			}
		})
	}
}
