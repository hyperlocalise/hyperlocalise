export type GrepMatch = {
  path: string;
  line: number;
  content: string;
};

/** Parse a `grep -rn` output line into path, line number, and content. */
export function parseGrepLine(line: string): GrepMatch | null {
  const match = line.match(/:(\d+):/);
  if (!match || match.index === undefined) {
    return null;
  }

  const path = line.slice(0, match.index);
  const rest = line.slice(match.index + 1);
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const lineNum = Number.parseInt(rest.slice(0, colonIndex), 10);
  if (Number.isNaN(lineNum)) {
    return null;
  }

  const content = rest.slice(colonIndex + 1);
  return { path, line: lineNum, content };
}
