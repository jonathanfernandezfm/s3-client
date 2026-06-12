export const MAX_TAGS_PER_OBJECT = 10;

export interface TagRow {
  id: string;
  key: string;
  value: string;
}

export function rowId(): string {
  return `tag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
export const MAX_TAG_KEY_LENGTH = 128;
export const MAX_TAG_VALUE_LENGTH = 256;

export interface TagPair {
  key: string;
  value: string;
}

/** Validates a tag set against AWS S3 object-tagging limits. Returns an error message, or null when valid. */
export function validateTagSet(tags: TagPair[]): string | null {
  if (tags.length > MAX_TAGS_PER_OBJECT) {
    return `Too many tags (max ${MAX_TAGS_PER_OBJECT} per object)`;
  }
  const seen = new Set<string>();
  for (const t of tags) {
    if (t.key.length === 0) return "Tag keys cannot be empty";
    if (t.key.length > MAX_TAG_KEY_LENGTH) {
      return `Tag keys cannot exceed ${MAX_TAG_KEY_LENGTH} characters`;
    }
    if (t.value.length > MAX_TAG_VALUE_LENGTH) {
      return `Tag values cannot exceed ${MAX_TAG_VALUE_LENGTH} characters`;
    }
    if (seen.has(t.key)) return `Duplicate tag key "${t.key}"`;
    seen.add(t.key);
  }
  return null;
}

/** Collects the distinct tag values present in a key → values map, sorted alphabetically. */
export function distinctTagValues(tagsByKey: Record<string, string[]>): string[] {
  const set = new Set<string>();
  for (const values of Object.values(tagsByKey)) {
    for (const v of values) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
