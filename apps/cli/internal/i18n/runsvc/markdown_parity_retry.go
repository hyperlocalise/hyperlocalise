package runsvc

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

const markdownParityScopeMaxPasses = 3

// markdownParityRetryInput carries planning inputs for re-translating an entire MD/MDX
// scope after a composed AST parity failure.
type markdownParityRetryInput struct {
	cfg           *config.I18NConfig
	bucket        string
	group         string
	targetLocales []string
	sourcePaths   []string
}

func markdownParityFixContext(msgs []string) string {
	var b strings.Builder
	b.WriteString("The assembled markdown file failed structural parity with the source template (same rules as the CLI check command).\n")
	b.WriteString("Return only a translation for this segment. Do not add headings (#), lists, thematic break lines (---), fenced code blocks (```), or blockquote lines (>) unless the source segment already contains the same markdown line pattern.\n")
	b.WriteString("Preserve internal HLMDPH placeholder tokens exactly.\n\nDetails:\n")
	b.WriteString(strings.Join(msgs, "\n"))
	return b.String()
}

func (s *Service) retryMarkdownASTParityScope(ctx context.Context, in *markdownParityRetryInput, targetPath string, output stagedOutput, parityMsgs []string) error {
	if in == nil || in.cfg == nil {
		return errors.New("markdown parity retry: missing config")
	}
	if len(output.entries) == 0 {
		return errors.New("markdown parity retry: no staged entries")
	}
	fixCtx := markdownParityFixContext(parityMsgs)
	var lastMarshalErr error
	for pass := 0; pass < markdownParityScopeMaxPasses; pass++ {
		tasks, _, err := s.planTasks(in.cfg, in.bucket, in.group, in.targetLocales, in.sourcePaths, nil, []FixMarkdownScope{{
			SourcePath:   output.sourcePath,
			TargetPath:   targetPath,
			TargetLocale: output.targetLocale,
		}})
		if err != nil {
			return err
		}
		if len(tasks) == 0 {
			return fmt.Errorf("markdown parity retry: no tasks planned for source=%q target=%q locale=%q", output.sourcePath, targetPath, output.targetLocale)
		}
		for _, task := range tasks {
			t := task
			materializeTaskPrompts(&t)
			if strings.TrimSpace(fixCtx) != "" {
				t.UserPrompt = strings.TrimSpace(t.UserPrompt) + "\n\n" + fixCtx
			}
			translated, err := s.translateWithRetry(ctx, t)
			if err != nil {
				return err
			}
			output.entries[t.EntryKey] = translated
		}
		_, _, lastMarshalErr = s.marshalMarkdownTarget(targetPath, output.sourcePath, output.entries)
		if lastMarshalErr == nil {
			return nil
		}
		var pe *translationfileparser.MarkdownASTParityError
		if errors.As(lastMarshalErr, &pe) && len(pe.Messages) > 0 {
			fixCtx = markdownParityFixContext(pe.Messages)
			continue
		}
		return lastMarshalErr
	}
	return fmt.Errorf("markdown parity retry exhausted after %d passes: %w", markdownParityScopeMaxPasses, lastMarshalErr)
}
