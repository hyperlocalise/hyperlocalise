package cmd

import (
	"context"
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
	"github.com/spf13/cobra"
)

type smartlingFilesListOptions struct {
	projectID      string
	uriMask        string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingFilesStatusOptions struct {
	projectID      string
	fileURI        string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingLocalesListOptions struct {
	projectID      string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingProjectsListOptions struct {
	accountUID     string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingProjectsInfoOptions struct {
	projectID      string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
}

type smartlingFilesDeleteOptions struct {
	projectID      string
	fileURI        string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	dryRun         bool
}

type smartlingFilesRenameOptions struct {
	projectID      string
	fileURI        string
	newFileURI     string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	dryRun         bool
}

type smartlingDiscoveryClient interface {
	ListFiles(context.Context, smartling.FileListInput) ([]smartling.FileListItem, error)
	GetFileStatus(context.Context, smartling.FileStatusInput) (smartling.FileStatus, error)
	ListLocales(context.Context, smartling.LocaleListInput) ([]smartling.LocaleListItem, error)
	ListProjects(context.Context, smartling.ProjectListInput) ([]smartling.ProjectListItem, error)
	GetProject(context.Context, smartling.ProjectInfoInput) (smartling.ProjectInfo, error)
	DeleteFile(context.Context, smartling.FileDeleteInput) error
	RenameFile(context.Context, smartling.FileRenameInput) error
}

var newSmartlingDiscoveryClient = func(cfg smartling.Config) (smartlingDiscoveryClient, error) {
	return smartling.NewHTTPClient(cfg)
}

func newSmartlingFilesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "files",
		Short: "list, show status, rename, and delete files",
	}
	cmd.AddCommand(newSmartlingFilesListCmd())
	cmd.AddCommand(newSmartlingFilesStatusCmd())
	cmd.AddCommand(newSmartlingFilesRenameCmd())
	cmd.AddCommand(newSmartlingFilesDeleteCmd())
	return cmd
}

func newSmartlingFilesListCmd() *cobra.Command {
	o := smartlingFilesListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list files in a Smartling project",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingFilesList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.uriMask, "uri-mask", "", "substring filter on file URI (not a glob; en.json matches locales/en.json)")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}

func newSmartlingFilesStatusCmd() *cobra.Command {
	o := smartlingFilesStatusOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "status",
		Short:        "show translation status for one Smartling file",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingFilesStatus(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "exact Smartling file URI")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}

func newSmartlingFilesRenameCmd() *cobra.Command {
	o := smartlingFilesRenameOptions{}
	cmd := &cobra.Command{
		Use:          "rename",
		Short:        "rename one Smartling file URI",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingFilesRename(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "current Smartling file URI")
	cmd.Flags().StringVar(&o.newFileURI, "new-file-uri", "", "new Smartling file URI")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without calling Smartling")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}

func newSmartlingFilesDeleteCmd() *cobra.Command {
	o := smartlingFilesDeleteOptions{}
	cmd := &cobra.Command{
		Use:          "delete",
		Short:        "delete one Smartling file URI",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingFilesDelete(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "exact Smartling file URI")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without calling Smartling")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}

func newSmartlingLocalesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "locales",
		Short: "list locales in a Smartling project",
	}
	cmd.AddCommand(newSmartlingLocalesListCmd())
	return cmd
}

func newSmartlingLocalesListCmd() *cobra.Command {
	o := smartlingLocalesListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list source and target locales in a Smartling project",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingLocalesList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}

func newSmartlingProjectsCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "projects",
		Short: "list and inspect Smartling projects",
	}
	cmd.AddCommand(newSmartlingProjectsListCmd())
	cmd.AddCommand(newSmartlingProjectsInfoCmd())
	return cmd
}

func newSmartlingProjectsListCmd() *cobra.Command {
	o := smartlingProjectsListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list Smartling projects for an account",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingProjectsList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID (same id as glossary download --account-uid)")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	return cmd
}

func newSmartlingProjectsInfoCmd() *cobra.Command {
	o := smartlingProjectsInfoOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "info",
		Short:        "show one Smartling project",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingProjectsInfo(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.output, "output", "text", "output format: text or json")
	addSmartlingCredentialFlags(cmd, &o.userIdentifier, &o.userSecret, &o.userSecretEnv)
	_ = cmd.MarkFlagRequired("project-id")
	return cmd
}

func addSmartlingCredentialFlags(cmd *cobra.Command, userIdentifier, userSecret, userSecretEnv *string) {
	cmd.Flags().StringVar(userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
}

func executeSmartlingFilesList(cmd *cobra.Command, o smartlingFilesListOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling files list: --project-id is required")
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling files list")
	if err != nil {
		return err
	}
	cfg.ProjectID = strings.TrimSpace(o.projectID)
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	files, err := client.ListFiles(backgroundContext(), smartling.FileListInput{
		ProjectID: strings.TrimSpace(o.projectID),
		URIMask:   strings.TrimSpace(o.uriMask),
	})
	if err != nil {
		return wrapSmartlingCommandError("smartling files list", err)
	}
	if files == nil {
		files = []smartling.FileListItem{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, file := range files {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "uri=%s type=%s last_uploaded=%s\n", file.FileURI, file.FileType, file.LastUploaded); err != nil {
				return err
			}
		}
		return nil
	}, files)
}

func executeSmartlingFilesStatus(cmd *cobra.Command, o smartlingFilesStatusOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling files status: --project-id is required")
	}
	if strings.TrimSpace(o.fileURI) == "" {
		return fmt.Errorf("smartling files status: --file-uri is required")
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling files status")
	if err != nil {
		return err
	}
	cfg.ProjectID = strings.TrimSpace(o.projectID)
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	status, err := client.GetFileStatus(backgroundContext(), smartling.FileStatusInput{
		ProjectID: strings.TrimSpace(o.projectID),
		FileURI:   strings.TrimSpace(o.fileURI),
	})
	if err != nil {
		return wrapSmartlingCommandError("smartling files status", err)
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "uri=%s type=%s last_uploaded=%s\n", status.FileURI, status.FileType, status.LastUploaded); err != nil {
			return err
		}
		for _, item := range status.Items {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "locale=%s completed_strings=%d total_strings=%d completed_words=%d total_words=%d percent=%d\n", item.LocaleID, item.CompletedStringCount, item.AuthorizedStringCount, item.CompletedWordCount, item.AuthorizedWordCount, smartling.LocaleStatusPercent(item)); err != nil {
				return err
			}
		}
		return nil
	}, status)
}

func executeSmartlingLocalesList(cmd *cobra.Command, o smartlingLocalesListOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling locales list: --project-id is required")
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling locales list")
	if err != nil {
		return err
	}
	cfg.ProjectID = strings.TrimSpace(o.projectID)
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	locales, err := client.ListLocales(backgroundContext(), smartling.LocaleListInput{
		ProjectID: strings.TrimSpace(o.projectID),
	})
	if err != nil {
		return wrapSmartlingCommandError("smartling locales list", err)
	}
	if locales == nil {
		locales = []smartling.LocaleListItem{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, locale := range locales {
			if locale.Enabled != nil {
				if _, err := fmt.Fprintf(cmd.OutOrStdout(), "locale=%s source=%t enabled=%t\n", locale.LocaleID, locale.Source, *locale.Enabled); err != nil {
					return err
				}
				continue
			}
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "locale=%s source=%t\n", locale.LocaleID, locale.Source); err != nil {
				return err
			}
		}
		return nil
	}, locales)
}

func executeSmartlingProjectsList(cmd *cobra.Command, o smartlingProjectsListOptions) error {
	if strings.TrimSpace(o.accountUID) == "" {
		return fmt.Errorf("smartling projects list: --account-uid is required (same id as glossary download --account-uid)")
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling projects list")
	if err != nil {
		return err
	}
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	projects, err := client.ListProjects(backgroundContext(), smartling.ProjectListInput{
		AccountUID: strings.TrimSpace(o.accountUID),
	})
	if err != nil {
		return wrapSmartlingCommandError("smartling projects list", err)
	}
	if projects == nil {
		projects = []smartling.ProjectListItem{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, project := range projects {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "project_id=%s name=%s source_locale=%s\n", project.ProjectID, project.ProjectName, project.SourceLocaleID); err != nil {
				return err
			}
		}
		return nil
	}, projects)
}

func executeSmartlingProjectsInfo(cmd *cobra.Command, o smartlingProjectsInfoOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling projects info: --project-id is required")
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling projects info")
	if err != nil {
		return err
	}
	cfg.ProjectID = strings.TrimSpace(o.projectID)
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	info, err := client.GetProject(backgroundContext(), smartling.ProjectInfoInput{
		ProjectID: strings.TrimSpace(o.projectID),
	})
	if err != nil {
		return wrapSmartlingCommandError("smartling projects info", err)
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		archived := "false"
		if info.Archived {
			archived = "true"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "project_id=%s name=%s account_uid=%s source_locale=%s archived=%s\n", info.ProjectID, info.ProjectName, info.AccountUID, info.SourceLocaleID, archived)
		return err
	}, info)
}

func executeSmartlingFilesRename(cmd *cobra.Command, o smartlingFilesRenameOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling files rename: --project-id is required")
	}
	if strings.TrimSpace(o.fileURI) == "" {
		return fmt.Errorf("smartling files rename: --file-uri is required")
	}
	if strings.TrimSpace(o.newFileURI) == "" {
		return fmt.Errorf("smartling files rename: --new-file-uri is required")
	}
	if o.dryRun {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=smartling-files-rename project_id=%s file_uri=%s new_file_uri=%s\n", strings.TrimSpace(o.projectID), strings.TrimSpace(o.fileURI), strings.TrimSpace(o.newFileURI))
		return err
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling files rename")
	if err != nil {
		return err
	}
	cfg.ProjectID = strings.TrimSpace(o.projectID)
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	if err := client.RenameFile(backgroundContext(), smartling.FileRenameInput{
		ProjectID:  strings.TrimSpace(o.projectID),
		FileURI:    strings.TrimSpace(o.fileURI),
		NewFileURI: strings.TrimSpace(o.newFileURI),
	}); err != nil {
		return wrapSmartlingCommandError("smartling files rename", err)
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "renamed uri=%s new_uri=%s\n", strings.TrimSpace(o.fileURI), strings.TrimSpace(o.newFileURI))
	return err
}

func executeSmartlingFilesDelete(cmd *cobra.Command, o smartlingFilesDeleteOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling files delete: --project-id is required")
	}
	if strings.TrimSpace(o.fileURI) == "" {
		return fmt.Errorf("smartling files delete: --file-uri is required")
	}
	if o.dryRun {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=smartling-files-delete project_id=%s file_uri=%s\n", strings.TrimSpace(o.projectID), strings.TrimSpace(o.fileURI))
		return err
	}
	cfg, err := resolveSmartlingCLICredentials(o.userIdentifier, o.userSecret, o.userSecretEnv, "smartling files delete")
	if err != nil {
		return err
	}
	cfg.ProjectID = strings.TrimSpace(o.projectID)
	client, err := newSmartlingDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	if err := client.DeleteFile(backgroundContext(), smartling.FileDeleteInput{
		ProjectID: strings.TrimSpace(o.projectID),
		FileURI:   strings.TrimSpace(o.fileURI),
	}); err != nil {
		return wrapSmartlingCommandError("smartling files delete", err)
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "deleted uri=%s\n", strings.TrimSpace(o.fileURI))
	return err
}

func wrapSmartlingCommandError(action string, err error) error {
	if err == nil {
		return nil
	}
	prefix := action + ": "
	if strings.HasPrefix(err.Error(), prefix) {
		return err
	}
	return fmt.Errorf("%s%w", prefix, err)
}
