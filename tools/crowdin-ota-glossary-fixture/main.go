package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

type options struct {
	createGlossary bool
	glossaryID     int
	importSeed     bool
	skipImport     bool
	offline        bool
	token          string
	baseURL        string
	userID         int
	outputPath     string
	seedPath       string
}

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, stdout io.Writer) error {
	opts, err := parseOptions(args)
	if err != nil {
		return err
	}
	value, err := loadDefaultFixture()
	if err != nil {
		return err
	}
	if err := writeTBX(opts.seedPath, value); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "generated %s (%d concepts)\n", opts.seedPath, len(value.Concepts))
	if opts.offline {
		return nil
	}

	client := newAPIClient(opts.baseURL, opts.token)
	glossaryID := opts.glossaryID
	if opts.createGlossary {
		glossaryID, err = client.createGlossary(ctx, value)
		if err != nil {
			return fmt.Errorf("create glossary: %w", err)
		}
		_, _ = fmt.Fprintf(stdout, "created Crowdin glossary %d\n", glossaryID)
	}
	if !opts.skipImport && (opts.createGlossary || opts.importSeed) {
		storageID, uploadErr := client.uploadStorage(ctx, opts.seedPath)
		if uploadErr != nil {
			return fmt.Errorf("upload glossary seed: %w", uploadErr)
		}
		if err := client.importGlossary(ctx, glossaryID, storageID); err != nil {
			return fmt.Errorf("import glossary seed: %w", err)
		}
		_, _ = fmt.Fprintf(stdout, "imported glossary seed into Crowdin glossary %d\n", glossaryID)
	}

	var userID *int
	if opts.userID > 0 {
		userID = &opts.userID
	}
	runs := make([]recordedRun, 0, fixtureExpressionCount(value)*len(value.TargetLanguageIDs))
	for _, targetLanguageID := range value.TargetLanguageIDs {
		for _, query := range value.QueryCases {
			for _, expression := range query.Expressions {
				input := concordanceRequest{
					SourceLanguageID: value.SourceLanguageID,
					TargetLanguageID: targetLanguageID,
					Expressions:      []string{expression},
					UserID:           userID,
				}
				output, status, requestErr := client.concordance(ctx, input)
				if requestErr != nil {
					return fmt.Errorf("concordance case %s/%s/%s: %w", targetLanguageID, query.ID, expression, requestErr)
				}
				runs = append(runs, recordedRun{
					CaseID:           query.ID,
					TargetLanguageID: targetLanguageID,
					Input:            input,
					HTTPStatus:       status,
					Output:           output,
				})
				_, _ = fmt.Fprintf(stdout, "captured %s/%s/%s (%d)\n", targetLanguageID, query.ID, expression, status)
			}
		}
	}

	content, err := recordingBytes(buildRecording(value, glossaryID, opts.seedPath, userID, runs))
	if err != nil {
		return err
	}
	if err := atomicWrite(opts.outputPath, content); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "saved %s (%d request/response pairs)\n", opts.outputPath, len(runs))
	return nil
}

func parseOptions(args []string) (options, error) {
	values := options{
		baseURL:    firstNonEmpty(os.Getenv("CROWDIN_API_BASE_URL"), defaultBaseURL),
		token:      firstNonEmpty(os.Getenv("CROWDIN_PAT"), os.Getenv("CROWDIN_API_TOKEN")),
		outputPath: defaultRecordOutput,
		seedPath:   defaultSeedOutput,
	}
	flags := flag.NewFlagSet("crowdin-ota-glossary-fixture", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	flags.BoolVar(&values.createGlossary, "create-glossary", false, "create a new dedicated Crowdin glossary and import the seed")
	flags.IntVar(&values.glossaryID, "glossary-id", 0, "existing Crowdin glossary identifier")
	flags.BoolVar(&values.importSeed, "import", false, "import the generated TBX into an existing glossary")
	flags.BoolVar(&values.skipImport, "skip-import", false, "skip glossary import after creating or selecting a glossary")
	flags.BoolVar(&values.offline, "offline", false, "generate the TBX without making Crowdin requests")
	flags.StringVar(&values.token, "token", values.token, "Crowdin PAT (default: CROWDIN_PAT or CROWDIN_API_TOKEN)")
	flags.StringVar(&values.baseURL, "base-url", values.baseURL, "Crowdin API v2 base URL")
	flags.IntVar(&values.userID, "user-id", 0, "optional glossary owner user ID for organization concordance")
	flags.StringVar(&values.outputPath, "output", values.outputPath, "JSON recording output path")
	flags.StringVar(&values.seedPath, "seed-output", values.seedPath, "TBX seed output path")
	if err := flags.Parse(args); err != nil {
		return options{}, err
	}
	if flags.NArg() != 0 {
		return options{}, fmt.Errorf("unexpected arguments: %s", strings.Join(flags.Args(), " "))
	}
	if values.createGlossary && values.glossaryID != 0 {
		return options{}, errors.New("--create-glossary and --glossary-id are mutually exclusive")
	}
	if values.importSeed && values.skipImport {
		return options{}, errors.New("--import and --skip-import are mutually exclusive")
	}
	if values.glossaryID < 0 || values.userID < 0 {
		return options{}, errors.New("--glossary-id and --user-id must not be negative")
	}
	if values.seedPath == "" || values.outputPath == "" {
		return options{}, errors.New("--seed-output and --output must not be empty")
	}
	if values.offline {
		return values, nil
	}
	if strings.TrimSpace(values.token) == "" {
		return options{}, errors.New("missing crowdin PAT: set CROWDIN_PAT or pass --token (or use --offline)")
	}
	if !values.createGlossary && values.glossaryID <= 0 {
		return options{}, errors.New("live mode requires --create-glossary or a positive --glossary-id")
	}
	if strings.TrimSpace(values.baseURL) == "" {
		return options{}, errors.New("--base-url must not be empty")
	}
	return values, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
