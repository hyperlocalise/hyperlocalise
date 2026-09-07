package cmd

import (
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
	"github.com/spf13/cobra"
)

type smartlingGlossaryListOptions struct {
	accountUID     string
	name           string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingGlossaryCreateOptions struct {
	accountUID     string
	name           string
	description    string
	locales        []string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingGlossaryImportOptions struct {
	accountUID     string
	glossaryUID    string
	filePath       string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

func newSmartlingGlossaryListCmd() *cobra.Command {
	o := smartlingGlossaryListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list Smartling glossaries on an account",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingGlossaryList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.name, "name", "", "optional glossary name search query")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("account-uid")
	return cmd
}

func newSmartlingGlossaryCreateCmd() *cobra.Command {
	o := smartlingGlossaryCreateOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "create",
		Short:        "create a Smartling glossary",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingGlossaryCreate(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.name, "name", "", "glossary name")
	cmd.Flags().StringVar(&o.description, "description", "", "optional glossary description")
	cmd.Flags().StringSliceVarP(&o.locales, "locale", "l", nil, "locale ID(s) for the glossary (repeatable)")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("name")
	_ = cmd.MarkFlagRequired("locale")
	return cmd
}

func newSmartlingGlossaryImportCmd() *cobra.Command {
	o := smartlingGlossaryImportOptions{}
	cmd := &cobra.Command{
		Use:          "import",
		Short:        "import Smartling's official glossary CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingGlossaryImport(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.glossaryUID, "glossary-uid", "", "Smartling glossary UID")
	cmd.Flags().StringVar(&o.filePath, "file", "", "official Smartling glossary import CSV path")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("glossary-uid")
	_ = cmd.MarkFlagRequired("file")
	return cmd
}

func executeSmartlingGlossaryList(cmd *cobra.Command, o smartlingGlossaryListOptions) error {
	const action = "smartling glossary list"
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
	glossaries, err := client.SearchGlossaries(backgroundContext(), smartling.GlossarySearchInput{
		AccountUID: strings.TrimSpace(o.accountUID),
		Query:      strings.TrimSpace(o.name),
	})
	if err != nil {
		return wrapSmartlingCommandError(action, err)
	}
	if glossaries == nil {
		glossaries = []smartling.GlossarySummary{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, glossary := range glossaries {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "glossary_uid=%s name=%s locales=%s\n", glossary.GlossaryUID, glossary.Name, strings.Join(glossary.LocaleIDs, ",")); err != nil {
				return err
			}
		}
		return nil
	}, glossaries)
}

func executeSmartlingGlossaryCreate(cmd *cobra.Command, o smartlingGlossaryCreateOptions) error {
	const action = "smartling glossary create"
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
	result, err := client.CreateGlossary(backgroundContext(), smartling.GlossaryCreateInput{
		AccountUID:  strings.TrimSpace(o.accountUID),
		Name:        strings.TrimSpace(o.name),
		Description: strings.TrimSpace(o.description),
		LocaleIDs:   o.locales,
	})
	if err != nil {
		return wrapSmartlingCommandError(action, err)
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "glossary_uid=%s name=%s account_uid=%s\n", result.GlossaryUID, result.Name, result.AccountUID)
		return err
	}, result)
}

func executeSmartlingGlossaryImport(cmd *cobra.Command, o smartlingGlossaryImportOptions) error {
	const action = "smartling glossary import"
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, action)
	if err != nil {
		return err
	}
	client, err := smartling.NewHTTPClient(cfg)
	if err != nil {
		return err
	}
	result, err := client.ImportGlossary(backgroundContext(), smartling.GlossaryImportInput{
		AccountUID:  strings.TrimSpace(o.accountUID),
		GlossaryUID: strings.TrimSpace(o.glossaryUID),
		FilePath:    strings.TrimSpace(o.filePath),
	})
	if err != nil {
		return wrapSmartlingCommandError(action, err)
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "import_uid=%s status=%s\n", result.ImportUID, result.ImportStatus)
	return err
}
