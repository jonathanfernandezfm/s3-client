export function computeRangeKeys(
  orderedKeys: string[],
  anchorKey: string | null,
  targetKey: string
): string[] {
  if (anchorKey === null) return [targetKey];
  const anchorIdx = orderedKeys.indexOf(anchorKey);
  const targetIdx = orderedKeys.indexOf(targetKey);
  if (anchorIdx === -1 || targetIdx === -1) return [targetKey];
  const [start, end] =
    anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
  return orderedKeys.slice(start, end + 1);
}
