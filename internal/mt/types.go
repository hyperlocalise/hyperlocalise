package mt

// Request is a batch machine-translation request using BCP 47 locales.
type Request struct {
	SourceLocale string
	TargetLocale string
	Sources      []string
}

// Response contains translations in the same order as Request.Sources.
type Response struct {
	Translations []string
}
