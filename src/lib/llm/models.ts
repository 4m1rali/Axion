/** Merge API models with saved/custom entries; stable sort by id. */
export function mergeModelLists(...groups: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    for (const raw of group) {
      const id = raw.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return out;
}

export function addModelToList(models: string[], id: string): string[] {
  const trimmed = id.trim();
  if (!trimmed) return models;
  return mergeModelLists(models, [trimmed]);
}
