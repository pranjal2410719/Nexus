export function sanitizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.?\/+/, "");
}

const NEXUS_ENTRY_RE = /(?:^|\n)## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\]/;
const NEXUS_SPLIT_RE = /(?=\n## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC\])/g;

/**
 * Truncates log entries to keep only the last `maxEntries` of timestamped Nexus log entries.
 * Preserves all pre-existing user content and custom markdown headers intact.
 */
export function pruneEntries(content: string, maxEntries: number = 5): string {
  if (!content) return content;

  const match = content.match(NEXUS_ENTRY_RE);
  if (!match || match.index === undefined) {
    return content;
  }

  // Where the first Nexus entry starts
  const firstEntryIndex = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const header = content.slice(0, firstEntryIndex);

  if (maxEntries <= 0) {
    return header ? header.trimEnd() + "\n" : "";
  }

  const entriesText = content.slice(firstEntryIndex);

  // Split entries (each subsequent entry starts with \n## [...)
  const entries = entriesText.split(NEXUS_SPLIT_RE);

  if (entries.length <= maxEntries) {
    return content;
  }

  const keptEntries = entries.slice(-maxEntries);
  // Strip leading newline from the first kept entry to prevent newline drift
  keptEntries[0] = keptEntries[0].replace(/^\n+/, "");

  const joined = keptEntries.join("");
  if (!header) {
    return joined;
  }
  return header.endsWith("\n") ? header + joined : header + "\n" + joined;
}
