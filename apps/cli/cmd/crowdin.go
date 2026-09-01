package cmd

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
	"github.com/spf13/cobra"
)

const crowdinTemplateFilename = "crowdin.yml"

//go:embed templates/crowdin.yml
var crowdinTemplateFS embed.FS

type crowdinCommonOptions struct {
	configPath              string
	identityPath            string
	branch                  string
	languages               []string
	exportOnlyApproved      bool
	skipUntranslatedStrings bool
	mergeApproved           bool
	includeSources          bool
	dryRun                  bool
}

type crowdinDownloadSourcesOptions struct {
	configPath   string
	identityPath string
	branch       string
	fileID       int
	sourcePaths  []string
	outputPath   string
	force        bool
	dryRun       bool
}

type crowdinGlossaryDownloadOptions struct {
	configPath   string
	identityPath string
	glossaryID   int
	languages    []string
	outputPath   string
}

type crowdinTranslationMemoryDownloadOptions struct {
	configPath          string
	identityPath        string
	translationMemoryID int
	sourceLanguage      string
	targetLanguages     []string
	format              string
	outputPath          string
}

type crowdinTranslationStatusReader interface {
	GetTranslationStatus(context.Context, crowdinstorage.TranslationStatusRequest) ([]crowdinstorage.LanguageProgress, error)
}

type crowdinGlossaryCSVWriter interface {
	WriteGlossaryCSV(context.Context, crowdinstorage.GlossaryDownloadRequest, io.Writer) (crowdinstorage.GlossaryDownloadResult, error)
}

type crowdinTranslationMemoryWriter interface {
	WriteTranslationMemoryCSV(context.Context, crowdinstorage.TranslationMemoryDownloadRequest, io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error)
	WriteTranslationMemoryTMX(context.Context, crowdinstorage.TranslationMemoryDownloadRequest, io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error)
}

type crowdinBranchLister interface {
	ListBranches(context.Context, string) ([]crowdinstorage.Branch, error)
}

type crowdinBranchAdder interface {
	AddBranch(context.Context, string, string) (crowdinstorage.Branch, error)
}

type crowdinFileLister interface {
	ListProjectFiles(context.Context, string, string) ([]crowdinstorage.ProjectFile, error)
}

type crowdinLanguageLister interface {
	ListProjectLanguages(context.Context, string) ([]crowdinstorage.ProjectLanguage, error)
	ListAllLanguages(context.Context) ([]crowdinstorage.ProjectLanguage, error)
}

type crowdinGlossaryLister interface {
	ListGlossaries(context.Context, string) ([]crowdinstorage.GlossarySummary, error)
}

type crowdinTranslationMemoryLister interface {
	ListTranslationMemories(context.Context, string) ([]crowdinstorage.TranslationMemorySummary, error)
}

type crowdinLocaleResolver interface {
	ResolveLocales(context.Context, string, []string) ([]crowdinstorage.ResolvedLocale, error)
}

type crowdinTranslationMemoryImporter interface {
	ImportTranslationMemoryFile(context.Context, int, string) (crowdinstorage.ImportResult, error)
}

type crowdinGlossaryImporter interface {
	ImportGlossaryFile(context.Context, int, string) (crowdinstorage.ImportResult, error)
}

type crowdinSourceStringLister interface {
	ListProjectSourceStrings(context.Context, crowdinstorage.ListSourceStringsInput) ([]crowdinstorage.SourceStringRow, error)
}

type crowdinFileOpsClient interface {
	UploadProjectFile(context.Context, string, string, string, string) (int, error)
	DownloadProjectFile(context.Context, string, string, string, string) ([]byte, error)
	DeleteProjectFile(context.Context, string, string, string) error
}

type crowdinAutoTranslator interface {
	ApplyPreTranslationAndWait(context.Context, crowdinstorage.PreTranslationInput) (crowdinstorage.PreTranslationResult, error)
}

var newCrowdinTranslationStatusReader = func(cfg crowdinstorage.Config) (crowdinTranslationStatusReader, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinGlossaryCSVWriter = func(cfg crowdinstorage.Config) (crowdinGlossaryCSVWriter, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinTranslationMemoryWriter = func(cfg crowdinstorage.Config) (crowdinTranslationMemoryWriter, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinBranchLister = func(cfg crowdinstorage.Config) (crowdinBranchLister, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinBranchAdder = func(cfg crowdinstorage.Config) (crowdinBranchAdder, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinFileLister = func(cfg crowdinstorage.Config) (crowdinFileLister, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinLanguageLister = func(cfg crowdinstorage.Config) (crowdinLanguageLister, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinGlossaryLister = func(cfg crowdinstorage.Config) (crowdinGlossaryLister, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinTranslationMemoryLister = func(cfg crowdinstorage.Config) (crowdinTranslationMemoryLister, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinLocaleResolver = func(cfg crowdinstorage.Config) (crowdinLocaleResolver, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinTranslationMemoryImporter = func(cfg crowdinstorage.Config) (crowdinTranslationMemoryImporter, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinGlossaryImporter = func(cfg crowdinstorage.Config) (crowdinGlossaryImporter, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinSourceStringLister = func(cfg crowdinstorage.Config) (crowdinSourceStringLister, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinFileOpsClient = func(cfg crowdinstorage.Config) (crowdinFileOpsClient, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

var newCrowdinAutoTranslator = func(cfg crowdinstorage.Config) (crowdinAutoTranslator, error) {
	return crowdinstorage.NewHTTPClient(cfg)
}

func newCrowdinCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "crowdin",
		Short: "Crowdin-compatible file workflow commands",
	}

	cmd.AddCommand(newCrowdinInitCmd())
	cmd.AddCommand(newCrowdinConfigCmd())
	cmd.AddCommand(newCrowdinStatusCmd())
	cmd.AddCommand(newCrowdinBranchCmd())
	cmd.AddCommand(newCrowdinFileCmd())
	cmd.AddCommand(newCrowdinStringCmd())
	cmd.AddCommand(newCrowdinLanguageCmd())
	cmd.AddCommand(newCrowdinUploadCmd())
	cmd.AddCommand(newCrowdinDownloadCmd())
	cmd.AddCommand(newCrowdinGlossaryCmd())
	cmd.AddCommand(newCrowdinTranslationMemoryCmd())
	cmd.AddCommand(newCrowdinAutoTranslateCmd())

	return cmd
}

func newCrowdinInitCmd() *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:          "init",
		Short:        "write a starter crowdin.yml template",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			template, err := crowdinTemplateFS.ReadFile("templates/crowdin.yml")
			if err != nil {
				return fmt.Errorf("read crowdin init template: %w", err)
			}
			if _, err := os.Stat(crowdinTemplateFilename); err == nil && !force {
				return fmt.Errorf("%s already exists; use --force to overwrite", crowdinTemplateFilename)
			} else if err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("check %s: %w", crowdinTemplateFilename, err)
			}
			if err := os.WriteFile(crowdinTemplateFilename, template, 0o644); err != nil {
				return fmt.Errorf("write %s: %w", crowdinTemplateFilename, err)
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s\n", crowdinTemplateFilename)
			return err
		},
	}

	cmd.Flags().BoolVar(&force, "force", false, "overwrite existing crowdin.yml")
	return cmd
}

func newCrowdinConfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "validate Crowdin-compatible config and list configured files",
	}
	cmd.AddCommand(newCrowdinConfigValidateCmd())
	cmd.AddCommand(newCrowdinConfigSourcesCmd())
	cmd.AddCommand(newCrowdinConfigTranslationsCmd())
	return cmd
}

func newCrowdinConfigValidateCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "validate",
		Short:        "validate crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, resolvedPath, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "config=%s files=%d preserve_hierarchy=%t base_path=%s\n", resolvedPath, len(cfg.Files), cfg.PreserveHierarchy, cfg.BasePath)
			return err
		},
	}
	addCrowdinCommonFlags(cmd, &o, false, false)
	return cmd
}

type crowdinStatusOptions struct {
	configPath       string
	identityPath     string
	branch           string
	languages        []string
	output           string
	failIfIncomplete bool
}

func newCrowdinStatusCmd() *cobra.Command {
	o := crowdinStatusOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "status",
		Short:        "show Crowdin translation and approval progress",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, _, err := crowdinstorage.LoadClientConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			cfg = applyCrowdinBranchFlag(cfg, o.branch)
			client, err := newCrowdinTranslationStatusReader(cfg)
			if err != nil {
				return err
			}
			rows, err := client.GetTranslationStatus(backgroundContext(), crowdinstorage.TranslationStatusRequest{
				ProjectID: cfg.ProjectID,
				Branch:    cfg.Branch,
				Languages: o.languages,
			})
			if err != nil {
				return err
			}
			if writeErr := writeCrowdinStatusReport(cmd.OutOrStdout(), rows, o.output); writeErr != nil {
				return writeErr
			}
			if o.failIfIncomplete && crowdinStatusIncomplete(rows, o.languages) {
				return fmt.Errorf("crowdin status: project is not fully translated and approved")
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Crowdin branch name")
	cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "language id(s) to include")
	cmd.Flags().StringVar(&o.output, "output", o.output, "output format: text or json")
	cmd.Flags().BoolVar(&o.failIfIncomplete, "fail-if-incomplete", false, "exit non-zero unless every listed language is fully translated and approved")
	return cmd
}

func writeCrowdinStatusReport(w io.Writer, rows []crowdinstorage.LanguageProgress, output string) error {
	switch strings.ToLower(strings.TrimSpace(output)) {
	case "", "text":
		for _, row := range rows {
			if _, err := fmt.Fprintf(
				w,
				"language=%s translation=%d approval=%d\n",
				row.LanguageID,
				row.TranslationProgress,
				row.ApprovalProgress,
			); err != nil {
				return err
			}
		}
		return nil
	case "json":
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		return enc.Encode(rows)
	default:
		return fmt.Errorf("unsupported output format %q", output)
	}
}

func crowdinStatusIncomplete(rows []crowdinstorage.LanguageProgress, requestedLanguages []string) bool {
	requested := crowdinStatusLanguageIDs(requestedLanguages)
	if len(requested) > 0 {
		byID := make(map[string]crowdinstorage.LanguageProgress, len(rows))
		for _, row := range rows {
			languageID := strings.TrimSpace(row.LanguageID)
			if languageID != "" {
				byID[languageID] = row
			}
		}
		for _, languageID := range requested {
			row, ok := byID[languageID]
			if !ok || row.TranslationProgress < 100 || row.ApprovalProgress < 100 {
				return true
			}
		}
		return false
	}
	if len(rows) == 0 {
		return true
	}
	for _, row := range rows {
		if row.TranslationProgress < 100 || row.ApprovalProgress < 100 {
			return true
		}
	}
	return false
}

func crowdinStatusLanguageIDs(languages []string) []string {
	ids := make([]string, 0, len(languages))
	for _, language := range languages {
		language = strings.TrimSpace(language)
		if language != "" {
			ids = append(ids, language)
		}
	}
	return ids
}

func newCrowdinUploadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "upload",
		Short: "upload sources or translations using crowdin.yml",
	}
	cmd.AddCommand(newCrowdinUploadSourcesCmd())
	cmd.AddCommand(newCrowdinUploadTranslationsCmd())
	return cmd
}

func newCrowdinUploadSourcesCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "upload source files defined in crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			if o.dryRun {
				_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=upload-sources files=%d\n", len(cfg.Files))
				return err
			}
			adapter, err := crowdinstorage.NewFileAdapter(cfg)
			if err != nil {
				return err
			}
			result, err := adapter.UploadSources(backgroundContext(), crowdinstorageRequestSources(cfg, o.branch))
			return writeCrowdinResultError(cmd, "upload-sources", result, err)
		},
	}
	addCrowdinCommonFlags(cmd, &o, false, true)
	return cmd
}

func newCrowdinUploadTranslationsCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "translations",
		Short:        "upload translated files defined in crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			if o.dryRun {
				_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=upload-translations files=%d languages=%s\n", len(cfg.Files), strings.Join(o.languages, ","))
				return err
			}
			adapter, err := crowdinstorage.NewFileAdapter(cfg)
			if err != nil {
				return err
			}
			result, err := adapter.UploadTranslations(backgroundContext(), crowdinstorageRequestTranslations(cfg, o.languages, o.branch))
			return writeCrowdinResultError(cmd, "upload-translations", result, err)
		},
	}
	addCrowdinCommonFlags(cmd, &o, true, true)
	return cmd
}

var downloadCrowdinSourceFileByID = crowdinstorage.DownloadSourceFileByID

func newCrowdinDownloadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "download",
		Short: "download source or translated files from Crowdin",
	}
	cmd.AddCommand(newCrowdinDownloadSourcesCmd())
	cmd.AddCommand(newCrowdinDownloadTranslationsCmd())
	return cmd
}

func newCrowdinDownloadTranslationsCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "translations",
		Short:        "download translated files defined in crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			if o.dryRun {
				_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=download-translations files=%d languages=%s export_only_approved=%t skip_untranslated_strings=%t merge_approved=%t include_sources=%t\n", len(cfg.Files), strings.Join(o.languages, ","), o.exportOnlyApproved, o.skipUntranslatedStrings, o.mergeApproved, o.includeSources)
				return err
			}
			adapter, err := crowdinstorage.NewFileAdapter(cfg)
			if err != nil {
				return err
			}
			result, err := adapter.DownloadTranslations(backgroundContext(), crowdinstorageRequestDownload(cfg, o.languages, o.branch, o.exportOnlyApproved, o.skipUntranslatedStrings, o.mergeApproved, o.includeSources))
			return writeCrowdinResultError(cmd, "download-translations", result, err)
		},
	}
	addCrowdinCommonFlags(cmd, &o, true, true)
	cmd.Flags().BoolVar(&o.exportOnlyApproved, "export-only-approved", false, "download approved translations only")
	cmd.Flags().BoolVar(&o.skipUntranslatedStrings, "skip-untranslated-strings", false, "omit untranslated strings from downloaded files")
	cmd.Flags().BoolVar(&o.mergeApproved, "merge-approved", false, "merge approved downloaded JSON strings into existing translation files")
	cmd.Flags().BoolVar(&o.includeSources, "include-sources", false, "also download source files into files[].source paths")
	return cmd
}

func newCrowdinDownloadSourcesCmd() *cobra.Command {
	o := crowdinDownloadSourcesOptions{}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "download source files from Crowdin",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return executeCrowdinDownloadSources(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Crowdin branch name to process")
	cmd.Flags().IntVar(&o.fileID, "file-id", 0, "download one source file by Crowdin file ID")
	cmd.Flags().StringSliceVar(&o.sourcePaths, "source", nil, "limit config-based download to one or more files[].source paths")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "output file path for --file-id; omit or use - for stdout")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
}

func executeCrowdinDownloadSources(cmd *cobra.Command, o crowdinDownloadSourcesOptions) error {
	outputPath := strings.TrimSpace(o.outputPath)
	if outputPath != "" && o.fileID == 0 {
		return fmt.Errorf("crowdin download sources: --output requires --file-id")
	}
	if o.fileID > 0 {
		if o.dryRun {
			destination := outputPath
			if destination == "" {
				destination = "-"
			}
			_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=download-sources file_id=%d output=%s\n", o.fileID, destination)
			return err
		}
		if err := validateCrowdinDownloadSourcesOutputPath(outputPath, o.force); err != nil {
			return err
		}

		cfg, _, err := crowdinstorage.LoadClientConfig(o.configPath, o.identityPath)
		if err != nil {
			return err
		}
		content, err := downloadCrowdinSourceFileByID(backgroundContext(), cfg, o.fileID)
		if err != nil {
			return fmt.Errorf("crowdin download sources: %w", err)
		}
		if outputPath == "" || outputPath == "-" {
			_, err := cmd.OutOrStdout().Write(content)
			return err
		}
		if err := writeCrowdinDownloadedSource(outputPath, content, o.force); err != nil {
			return err
		}
		_, err = fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d file_id=%d\n", outputPath, len(content), o.fileID)
		return err
	}

	cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
	if err != nil {
		return err
	}
	if o.dryRun {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=download-sources files=%d sources=%s\n", len(cfg.Files), strings.Join(o.sourcePaths, ","))
		return err
	}
	cfg = overrideCrowdinBranch(cfg, o.branch)
	adapter, err := crowdinstorage.NewFileAdapter(cfg)
	if err != nil {
		return err
	}
	result, err := adapter.DownloadSources(backgroundContext(), storage.FileDownloadSourcesRequest{
		Config:      cfg,
		SourcePaths: o.sourcePaths,
	})
	return writeCrowdinResultError(cmd, "download-sources", result, err)
}

func writeCrowdinDownloadedSource(path string, content []byte, force bool) error {
	if err := validateCrowdinDownloadSourcesOutputPath(path, force); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("crowdin download sources: mkdir output directory: %w", err)
	}
	return writeFileAtomic(path, content)
}

func validateCrowdinDownloadSourcesOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("crowdin download sources: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("crowdin download sources: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("crowdin download sources: stat output file %q: %w", path, err)
	}
	return nil
}

func newCrowdinGlossaryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "glossary",
		Short: "Crowdin glossary commands",
	}
	cmd.AddCommand(newCrowdinGlossaryListCmd())
	cmd.AddCommand(newCrowdinGlossaryDownloadCmd())
	cmd.AddCommand(newCrowdinGlossaryUploadCmd())
	return cmd
}

func newCrowdinGlossaryDownloadCmd() *cobra.Command {
	o := crowdinGlossaryDownloadOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Crowdin glossary terms as CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := crowdinstorage.LoadClientConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			client, err := newCrowdinGlossaryCSVWriter(cfg)
			if err != nil {
				return err
			}

			outputPath := strings.TrimSpace(o.outputPath)
			out := cmd.OutOrStdout()
			var closeOut func() error
			var tempPath string
			if outputPath != "" {
				file, err := os.CreateTemp(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".*.tmp")
				if err != nil {
					return fmt.Errorf("create temporary glossary csv: %w", err)
				}
				out = file
				tempPath = file.Name()
				closeOut = file.Close
			}

			result, err := client.WriteGlossaryCSV(backgroundContext(), crowdinstorage.GlossaryDownloadRequest{
				GlossaryID: o.glossaryID,
				Languages:  o.languages,
			}, out)
			if closeOut != nil {
				if closeErr := closeOut(); closeErr != nil && err == nil {
					err = fmt.Errorf("close glossary csv: %w", closeErr)
				}
			}
			if err != nil {
				if tempPath != "" {
					if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
						return fmt.Errorf("%w; also failed to remove temporary output: %v", err, removeErr)
					}
				}
				return err
			}
			if outputPath != "" {
				if err := os.Rename(tempPath, outputPath); err != nil {
					if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
						return fmt.Errorf("replace glossary csv: %w; also failed to remove temporary output: %v", err, removeErr)
					}
					return fmt.Errorf("replace glossary csv: %w", err)
				}
				_, err = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s terms=%d\n", outputPath, result.Terms)
				return err
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().IntVar(&o.glossaryID, "glossary-id", 0, "Crowdin glossary identifier")
	cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "term language(s) to include")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "write CSV to file instead of stdout")
	_ = cmd.MarkFlagRequired("glossary-id")
	return cmd
}

func newCrowdinTranslationMemoryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "tm",
		Aliases: []string{"translation-memory"},
		Short:   "Crowdin translation memory commands",
	}
	cmd.AddCommand(newCrowdinTranslationMemoryListCmd())
	cmd.AddCommand(newCrowdinTranslationMemoryDownloadCmd())
	cmd.AddCommand(newCrowdinTranslationMemoryUploadCmd())
	return cmd
}

func newCrowdinTranslationMemoryDownloadCmd() *cobra.Command {
	o := crowdinTranslationMemoryDownloadOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Crowdin translation memory entries",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			outputFormat, err := normalizeTranslationMemoryDownloadFormat(o.format)
			if err != nil {
				return fmt.Errorf("crowdin translation memory download: %w", err)
			}

			cfg, _, err := crowdinstorage.LoadClientConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			client, err := newCrowdinTranslationMemoryWriter(cfg)
			if err != nil {
				return err
			}

			outputPath := strings.TrimSpace(o.outputPath)
			out := cmd.OutOrStdout()
			var closeOut func() error
			var tempPath string
			if outputPath != "" {
				file, err := os.CreateTemp(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".*.tmp")
				if err != nil {
					return fmt.Errorf("create temporary translation memory output: %w", err)
				}
				out = file
				tempPath = file.Name()
				closeOut = file.Close
			}

			result, err := writeCrowdinTranslationMemory(backgroundContext(), client, crowdinstorage.TranslationMemoryDownloadRequest{
				TranslationMemoryID: o.translationMemoryID,
				SourceLanguage:      o.sourceLanguage,
				TargetLanguages:     o.targetLanguages,
			}, outputFormat, out)
			if closeOut != nil {
				if closeErr := closeOut(); closeErr != nil && err == nil {
					err = fmt.Errorf("close translation memory output: %w", closeErr)
				}
			}
			if err != nil {
				if tempPath != "" {
					if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
						return fmt.Errorf("%w; also failed to remove temporary output: %v", err, removeErr)
					}
				}
				return err
			}
			if outputPath != "" {
				if err := os.Rename(tempPath, outputPath); err != nil {
					if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
						return fmt.Errorf("replace translation memory output: %w; also failed to remove temporary output: %v", err, removeErr)
					}
					return fmt.Errorf("replace translation memory output: %w", err)
				}
				_, err = writeTranslationMemoryDownloadSummary(cmd.OutOrStdout(), outputPath, outputFormat, result.Rows, result.Segments)
				return err
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().IntVar(&o.translationMemoryID, "tm-id", 0, "Crowdin translation memory identifier")
	cmd.Flags().StringVar(&o.sourceLanguage, "source-language", "", "source language ID to export")
	cmd.Flags().StringSliceVarP(&o.targetLanguages, "target-language", "l", nil, "target language ID(s) to export")
	cmd.Flags().StringVar(&o.format, "format", "csv", "download format: csv or tmx")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "write output to file instead of stdout")
	_ = cmd.MarkFlagRequired("tm-id")
	_ = cmd.MarkFlagRequired("source-language")
	_ = cmd.MarkFlagRequired("target-language")
	return cmd
}

func addCrowdinCommonFlags(cmd *cobra.Command, o *crowdinCommonOptions, includeLanguages, includeBranch bool) {
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without applying remote or local changes")
	if includeBranch {
		cmd.Flags().StringVar(&o.branch, "branch", "", "Crowdin branch name to process")
	}
	if includeLanguages {
		cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "target language(s) to process")
	}
}

func loadCrowdinWorkflowConfig(configPath, identityPath string) (storage.FileWorkflowConfig, string, error) {
	cfg, resolvedPath, err := crowdinstorage.LoadFileWorkflowConfig(configPath, identityPath)
	if err != nil {
		return storage.FileWorkflowConfig{}, "", err
	}
	return cfg, resolvedPath, nil
}

func writeCrowdinFileResult(cmd *cobra.Command, action string, result storage.FileOperationResult) error {
	_, err := fmt.Fprintf(cmd.OutOrStdout(), "action=%s processed=%d skipped=%d warnings=%d\n", action, len(result.Processed), len(result.Skipped), len(result.Warnings))
	return err
}

func writeCrowdinResultError(cmd *cobra.Command, action string, result storage.FileOperationResult, opErr error) error {
	if writeErr := writeCrowdinFileResult(cmd, action, result); writeErr != nil && opErr == nil {
		return writeErr
	}
	return opErr
}

func crowdinstorageRequestSources(cfg storage.FileWorkflowConfig, branch string) storage.FileUploadSourcesRequest {
	cfg = overrideCrowdinBranch(cfg, branch)
	return storage.FileUploadSourcesRequest{Config: cfg}
}

func crowdinstorageRequestTranslations(cfg storage.FileWorkflowConfig, languages []string, branch string) storage.FileUploadTranslationsRequest {
	cfg = overrideCrowdinBranch(cfg, branch)
	return storage.FileUploadTranslationsRequest{Config: cfg, Languages: languages}
}

func crowdinstorageRequestDownload(cfg storage.FileWorkflowConfig, languages []string, branch string, exportOnlyApproved, skipUntranslatedStrings, mergeApproved, includeSources bool) storage.FileDownloadTranslationsRequest {
	cfg = overrideCrowdinBranch(cfg, branch)
	overrides := storage.FileExportOptions{}
	if exportOnlyApproved {
		overrides.ExportOnlyApproved = &exportOnlyApproved
	}
	if skipUntranslatedStrings {
		overrides.SkipUntranslatedStrings = &skipUntranslatedStrings
	}
	req := storage.FileDownloadTranslationsRequest{Config: cfg, Languages: languages, MergeApproved: mergeApproved, IncludeSources: includeSources}
	if overrides.ExportOnlyApproved != nil || overrides.SkipUntranslatedStrings != nil {
		req.ExportOverrides = &overrides
	}
	return req
}

func overrideCrowdinBranch(cfg storage.FileWorkflowConfig, branch string) storage.FileWorkflowConfig {
	if trimmed := strings.TrimSpace(branch); trimmed != "" {
		cfg.Branch = trimmed
	}
	return cfg
}

func applyCrowdinBranchFlag(cfg crowdinstorage.Config, flagBranch string) crowdinstorage.Config {
	if trimmed := strings.TrimSpace(flagBranch); trimmed != "" {
		cfg.Branch = trimmed
	}
	return cfg
}
