Optimized segment key and placeholder generation in HTML, Markdown, Liquid, and MDX parsers.
Replaced `fmt.Sprintf` with string concatenation and `strconv.Itoa` in hot paths (segment key generation, hashing, placeholder token creation, and MDX path generation).
This follows existing optimization patterns in the codebase (`json_parser.go`, `json_marshal.go`) to reduce reflection and formatting overhead, leading to fewer allocations and faster execution.
