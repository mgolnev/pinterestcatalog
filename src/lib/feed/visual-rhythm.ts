type RhythmRow = {
  leaf_category?: string | null;
  normalized_color?: string | null;
};

/** Локальные перестановки внутри страницы: не более 2 одинаковых leaf подряд. */
export function applyVisualRhythm<T extends RhythmRow>(rows: T[], limit: number): T[] {
  const arr = rows.slice(0, limit);
  for (let i = 2; i < arr.length; i++) {
    const a = arr[i - 2]?.leaf_category ?? "";
    const b = arr[i - 1]?.leaf_category ?? "";
    const c = arr[i]?.leaf_category ?? "";
    if (a && b && c && a === b && b === c) {
      for (let j = i + 1; j < arr.length; j++) {
        if ((arr[j]?.leaf_category ?? "") !== c) {
          const tmp = arr[i]!;
          arr[i] = arr[j]!;
          arr[j] = tmp;
          break;
        }
      }
    }
  }
  for (let i = 2; i < arr.length; i++) {
    const a = arr[i - 2]?.normalized_color ?? "";
    const b = arr[i - 1]?.normalized_color ?? "";
    const c = arr[i]?.normalized_color ?? "";
    if (a && b && c && a === b && b === c) {
      for (let j = i + 1; j < arr.length; j++) {
        if ((arr[j]?.normalized_color ?? "") !== c) {
          const tmp = arr[i]!;
          arr[i] = arr[j]!;
          arr[j] = tmp;
          break;
        }
      }
    }
  }
  return arr;
}
