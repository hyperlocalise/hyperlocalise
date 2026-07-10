/**
 * Converts markdown to a single-line plain-text preview.
 * Strips common syntax (emphasis, code, links, headings, lists) without a full parser.
 */
export function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Fenced code blocks → keep inner text
      .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
      // Images → alt text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Links → label
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Inline code
      .replace(/`([^`]+)`/g, "$1")
      // Bold / italic
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
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
