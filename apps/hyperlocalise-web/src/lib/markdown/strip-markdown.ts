/**
 * Converts markdown to a single-line plain-text preview.
 * Strips common syntax (emphasis, code, links, headings, lists) without a full parser.
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Fenced code blocks → keep inner text
      .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
      // Images → alt text (allow nested () in destination)
      .replace(/!\[([^\]]*)\]\(((?:[^()]|\([^()]*\))*)\)/g, "$1")
      // Links → label, or URL when the label is empty
      .replace(
        /\[([^\]]*)\]\(((?:[^()]|\([^()]*\))*)\)/g,
        (_match, label: string, url: string) => label || url,
      )
      // Inline code
      .replace(/`([^`]+)`/g, "$1")
      // Bold / italic (* and ** / __ only — skip single _ so snake_case stays intact)
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/\*([^*]+)\*/g, "$1")
      // Headings
      .replace(/^#{1,6}\s+/gm, "")
      // Blockquotes
      .replace(/^>\s?/gm, "")
      // Unordered / ordered list markers
      .replace(/^[\s]*[-*+]\s+/gm, "")
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // Horizontal rules
      .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "")
      // Collapse whitespace for one-line previews
      .replace(/\s+/g, " ")
      .trim()
  );
}
