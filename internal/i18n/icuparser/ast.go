package icuparser

type ElementType string

const (
	TypeLiteral       ElementType = "literal"
	TypeArgument      ElementType = "argument"
	TypeNumber        ElementType = "number"
	TypeDate          ElementType = "date"
	TypeTime          ElementType = "time"
	TypeSelect        ElementType = "select"
	TypePlural        ElementType = "plural"
	TypePound         ElementType = "pound"
	TypeTag           ElementType = "tag"
	TypeSelectOrdinal ElementType = "selectordinal"
)

type Element interface {
	Type() ElementType
}

type LiteralElement struct {
	Value string
}

func (LiteralElement) Type() ElementType { return TypeLiteral }

type ArgumentElement struct {
	Value string
}

func (ArgumentElement) Type() ElementType { return TypeArgument }

// NumberSkeleton is a parsed ICU number skeleton (::…) with tokens and Intl options.
type NumberSkeleton struct {
	Tokens        []NumberSkeletonToken
	ParsedOptions NumberFormatOptions
}

// DateTimeSkeleton is a parsed ICU date/time skeleton (::…) with resolved pattern and options.
type DateTimeSkeleton struct {
	Pattern       string
	ParsedOptions DateTimeFormatOptions
}

type NumberElement struct {
	Value string
	Style string
	// Skeleton is set when Style uses ICU skeleton syntax (leading "::") after successful tokenization.
	Skeleton *NumberSkeleton
}

func (NumberElement) Type() ElementType { return TypeNumber }

type DateElement struct {
	Value    string
	Style    string
	Skeleton *DateTimeSkeleton
}

func (DateElement) Type() ElementType { return TypeDate }

type TimeElement struct {
	Value    string
	Style    string
	Skeleton *DateTimeSkeleton
}

func (TimeElement) Type() ElementType { return TypeTime }

type PoundElement struct{}

func (PoundElement) Type() ElementType { return TypePound }

type SelectOption struct {
	Selector string
	Value    []Element
}

type SelectElement struct {
	Value   string
	Options []SelectOption
}

func (SelectElement) Type() ElementType { return TypeSelect }

type PluralOption struct {
	Selector string
	Value    []Element
}

type PluralElement struct {
	Value      string
	Options    []PluralOption
	Offset     int
	Ordinal    bool
	PluralType ElementType
}

func (p PluralElement) Type() ElementType {
	if p.PluralType != "" {
		return p.PluralType
	}
	if p.Ordinal {
		return TypeSelectOrdinal
	}
	return TypePlural
}

type TagElement struct {
	Value       string
	Children    []Element
	SelfClosing bool
}

func (TagElement) Type() ElementType { return TypeTag }

type ParseOptions struct {
	IgnoreTag bool
	// ShouldParseSkeletons controls whether :: number/date/time skeletons are converted into
	// ParsedOptions (Intl-style structs). Token validation for number skeletons always runs for :: styles.
	ShouldParseSkeletons bool
}
