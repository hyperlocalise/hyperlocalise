package cmd

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/qavalidate"
	"github.com/spf13/cobra"
)

type validateOptions struct {
	sourceText   string
	sourceFile   string
	targetText   string
	targetFile   string
	targetLocale string
	sourcePath   string
	maxLength    int
	inputFile    string
	policyFile   string
	format       string
	noFail       bool
}

func newValidateCmd() *cobra.Command {
	o := validateOptions{format: "text"}
	cmd := &cobra.Command{
		Use:          "validate",
		Short:        "validate a source and target segment or a JSON batch",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			policy := qavalidate.DefaultPolicy()
			if o.policyFile != "" {
				loaded, err := qavalidate.LoadPolicy(o.policyFile)
				if err != nil {
					return fmt.Errorf("load QA policy: %w", err)
				}
				policy = loaded
			}
			segments, err := readValidateSegments(cmd, o)
			if err != nil {
				return err
			}
			report, err := qavalidate.ValidateBatch(cmd.Context(), segments, policy)
			if err != nil {
				return err
			}
			switch o.format {
			case "json":
				encoder := json.NewEncoder(cmd.OutOrStdout())
				encoder.SetEscapeHTML(false)
				if err := encoder.Encode(report); err != nil {
					return err
				}
			case "text":
				count := 0
				for _, result := range report.Results {
					for _, finding := range result.Checks {
						count++
						_, _ = fmt.Fprintf(cmd.OutOrStdout(), "%s: %s: %s\n", result.ID, finding.Severity, finding.Message)
					}
					for _, skipped := range result.SkippedChecks {
						_, _ = fmt.Fprintf(cmd.OutOrStdout(), "%s: skipped %s\n", result.ID, skipped)
					}
				}
				if count == 0 {
					_, _ = fmt.Fprintln(cmd.OutOrStdout(), "No QA findings.")
				}
				if count > 0 && !o.noFail {
					return errCheckFindings
				}
			default:
				return fmt.Errorf("unsupported format %q", o.format)
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&o.sourceText, "source-text", "", "source text to validate")
	cmd.Flags().StringVar(&o.sourceFile, "source-file", "", "file containing source text")
	cmd.Flags().StringVar(&o.targetText, "target-text", "", "target text to validate")
	cmd.Flags().StringVar(&o.targetFile, "target-file", "", "file containing target text")
	cmd.Flags().StringVar(&o.targetLocale, "target-locale", "", "target locale")
	cmd.Flags().StringVar(&o.sourcePath, "source-path", "", "source path for format detection")
	cmd.Flags().IntVar(&o.maxLength, "max-length", 0, "maximum target length in Unicode characters")
	cmd.Flags().StringVar(&o.inputFile, "input-file", "", "JSON batch input path, or - for stdin")
	cmd.Flags().StringVar(&o.policyFile, "policy-file", "", "versioned QA policy JSON file")
	cmd.Flags().StringVar(&o.format, "format", o.format, "output format: text or json")
	cmd.Flags().BoolVar(&o.noFail, "no-fail", false, "report findings without a nonzero exit")
	return cmd
}

func readValidateSegments(cmd *cobra.Command, o validateOptions) ([]qavalidate.Segment, error) {
	if o.inputFile != "" {
		if cmd.Flags().Changed("source-text") || o.sourceFile != "" || cmd.Flags().Changed("target-text") || o.targetFile != "" {
			return nil, errors.New("--input-file cannot be combined with source/target flags")
		}
		var input io.Reader
		if o.inputFile == "-" {
			input = cmd.InOrStdin()
		} else {
			file, err := os.Open(o.inputFile)
			if err != nil {
				return nil, err
			}
			defer func() { _ = file.Close() }()
			input = file
		}
		var payload struct {
			Segments []qavalidate.Segment `json:"segments"`
		}
		decoder := json.NewDecoder(input)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			return nil, fmt.Errorf("decode validation input: %w", err)
		}
		if len(payload.Segments) == 0 {
			return nil, errors.New("validation input has no segments")
		}
		seen := map[string]bool{}
		for _, segment := range payload.Segments {
			if segment.ID == "" || segment.TargetLocale == "" || segment.MaxLength < 0 {
				return nil, errors.New("each segment needs id and targetLocale and a nonnegative maxLength")
			}
			if seen[segment.ID] {
				return nil, fmt.Errorf("duplicate segment id %q", segment.ID)
			}
			seen[segment.ID] = true
		}
		return payload.Segments, nil
	}
	if (cmd.Flags().Changed("source-text") == (o.sourceFile != "")) ||
		(cmd.Flags().Changed("target-text") == (o.targetFile != "")) {
		return nil, errors.New("provide exactly one of --source-text/--source-file and --target-text/--target-file")
	}
	if strings.TrimSpace(o.targetLocale) == "" {
		return nil, errors.New("--target-locale is required")
	}
	if o.maxLength < 0 {
		return nil, errors.New("--max-length must be nonnegative")
	}
	source, target := o.sourceText, o.targetText
	if o.sourceFile != "" {
		data, err := os.ReadFile(o.sourceFile)
		if err != nil {
			return nil, fmt.Errorf("read source file: %w", err)
		}
		source = string(data)
	}
	if o.targetFile != "" {
		data, err := os.ReadFile(o.targetFile)
		if err != nil {
			return nil, fmt.Errorf("read target file: %w", err)
		}
		target = string(data)
	}
	sourcePath := o.sourcePath
	if sourcePath == "" {
		sourcePath = o.sourceFile
	}
	return []qavalidate.Segment{{
		ID: "segment", SourceText: source, TargetText: target,
		SourcePath: sourcePath, TargetLocale: o.targetLocale, MaxLength: o.maxLength,
	}}, nil
}
