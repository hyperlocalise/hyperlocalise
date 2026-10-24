package cmd

import (
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
	"github.com/spf13/cobra"
)

type smartlingTranslationMemoryListOptions struct {
	accountUID     string
	name           string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingTranslationMemoryCreateOptions struct {
	accountUID     string
	name           string
	description    string
	sourceLocale   string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingTranslationMemoryImportOptions struct {
	accountUID           string
	translationMemoryUID string
	filePath             string
	fileURI              string
	userIdentifier       string
	userSecret           string
	userSecretEnv        string
}

func newSmartlingTranslationMemoryListCmd() *cobra.Command {
	o := smartlingTranslationMemoryListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list Smartling translation memories on an account",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingTranslationMemoryList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.name, "name", "", "optional translation memory name search query")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("account-uid")
	return cmd
}

func newSmartlingTranslationMemoryCreateCmd() *cobra.Command {
	o := smartlingTranslationMemoryCreateOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "create",
		Short:        "create a Smartling translation memory",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingTranslationMemoryCreate(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.name, "name", "", "translation memory name")
	cmd.Flags().StringVar(&o.description, "description", "", "optional translation memory description")
	cmd.Flags().StringVar(&o.sourceLocale, "source-locale", "", "source locale ID for the translation memory")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("name")
	_ = cmd.MarkFlagRequired("source-locale")
	return cmd
}

func newSmartlingTranslationMemoryImportCmd() *cobra.Command {
	o := smartlingTranslationMemoryImportOptions{}
	cmd := &cobra.Command{
		Use:          "import",
		Short:        "import a TMX file into a Smartling translation memory",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingTranslationMemoryImport(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.translationMemoryUID, "tm-uid", "", "Smartling translation memory UID")
	cmd.Flags().StringVar(&o.filePath, "file", "", "TMX file path")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "Smartling TMX file URI (defaults to the file name)")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("tm-uid")
	_ = cmd.MarkFlagRequired("file")
	return cmd
}

func executeSmartlingTranslationMemoryList(cmd *cobra.Command, o smartlingTranslationMemoryListOptions) error {
	const action = "smartling tm list"
	if err := validateEncodedOutputFormat(o.output); err != nil {
		return err
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, action)
	if err != nil {
		return err
	}
	client, err := smartling.NewHTTPClient(cfg)
	if err != nil {
		return err
	}
	memories, err := client.ListTranslationMemories(backgroundContext(), smartling.TranslationMemoryListInput{
		AccountUID: strings.TrimSpace(o.accountUID),
		Query:      strings.TrimSpace(o.name),
	})
	if err != nil {
		return wrapSmartlingCommandError(action, err)
	}
	if memories == nil {
		memories = []smartling.TranslationMemorySummary{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, memory := range memories {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "tm_uid=%s name=%s source_locale=%s locales=%s\n", memory.TranslationMemoryUID, memory.Name, memory.SourceLocaleID, strings.Join(memory.LocaleIDs, ",")); err != nil {
				return err
			}
		}
		return nil
	}, memories)
}

func executeSmartlingTranslationMemoryCreate(cmd *cobra.Command, o smartlingTranslationMemoryCreateOptions) error {
	const action = "smartling tm create"
	if err := validateEncodedOutputFormat(o.output); err != nil {
		return err
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, action)
	if err != nil {
		return err
	}
	client, err := smartling.NewHTTPClient(cfg)
	if err != nil {
		return err
	}
	result, err := client.CreateTranslationMemory(backgroundContext(), smartling.TranslationMemoryCreateInput{
		AccountUID:     strings.TrimSpace(o.accountUID),
		Name:           strings.TrimSpace(o.name),
		Description:    strings.TrimSpace(o.description),
		SourceLocaleID: strings.TrimSpace(o.sourceLocale),
	})
	if err != nil {
		return wrapSmartlingCommandError(action, err)
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "tm_uid=%s name=%s source_locale=%s\n", result.TranslationMemoryUID, result.Name, result.SourceLocaleID)
		return err
	}, result)
}

func executeSmartlingTranslationMemoryImport(cmd *cobra.Command, o smartlingTranslationMemoryImportOptions) error {
	const action = "smartling tm import"
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, action)
	if err != nil {
		return err
	}
	client, err := smartling.NewHTTPClient(cfg)
	if err != nil {
		return err
	}
	result, err := client.ImportTranslationMemory(backgroundContext(), smartling.TranslationMemoryImportInput{
		AccountUID:           strings.TrimSpace(o.accountUID),
		TranslationMemoryUID: strings.TrimSpace(o.translationMemoryUID),
		FilePath:             strings.TrimSpace(o.filePath),
		FileURI:              strings.TrimSpace(o.fileURI),
	})
	if err != nil {
		return wrapSmartlingCommandError(action, err)
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "job_uid=%s tmx_uid=%s strings=%d words=%d\n", result.JobUID, result.TmxUID, result.StringCount, result.WordCount)
	return err
}
