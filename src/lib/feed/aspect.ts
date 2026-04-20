/**
 * Реальные пропорции основного фото в каталоге (пиксели кадра).
 * Строка URL часто задаёт только ресайз/качество (например 515Wx515H), ей нельзя верить для aspect-ratio.
 */
export const CANONICAL_PRODUCT_WIDTH = 578;
export const CANONICAL_PRODUCT_HEIGHT = 737;
export const CANONICAL_PRODUCT_ASPECT_RATIO =
  CANONICAL_PRODUCT_WIDTH / CANONICAL_PRODUCT_HEIGHT;

/**
 * Устаревший парсинг имён файлов — для GJ не используем как источник истины (см. канон выше).
 * Оставлен для редких URL с явными размерами, не совпадающими с типичным ресайзом 515×515.
 */
export function inferAspectRatioFromImageUrl(url: string): number | null {
  const wxh = url.match(/(\d{2,4})\s*[Ww]\s*x\s*(\d{2,4})\s*[Hh]/i);
  if (wxh) {
    const w = Number(wxh[1]);
    const h = Number(wxh[2]);
    if (w > 0 && h > 0) {
      // Типичный ресайз CDN — не отражает кадр 578×737
      if (w === 515 && h === 515) return null;
      return w / h;
    }
  }
  const alt = url.match(/[_/-](\d{2,4})x(\d{2,4})[_/.-]/i);
  if (alt) {
    const w = Number(alt[1]);
    const h = Number(alt[2]);
    if (w > 0 && h > 0) {
      if (w === 515 && h === 515) return null;
      return w / h;
    }
  }
  return null;
}

/**
 * width/height для плитки: сначала БД, иначе размер из URL (если не «ложный» 515×515), иначе канон 578/737.
 */
export function tileWidthOverHeight(
  imageUrl: string,
  storedRatio: number | null | undefined
): number {
  if (storedRatio !== null && storedRatio !== undefined && storedRatio > 0) {
    return storedRatio;
  }
  const fromUrl = inferAspectRatioFromImageUrl(imageUrl);
  if (fromUrl !== null && fromUrl > 0) return fromUrl;
  return CANONICAL_PRODUCT_ASPECT_RATIO;
}

/** CSS aspect-ratio: width / height — при ratio = width/height задаём `${ratio} / 1`. */
export function cssAspectRatioBox(ratioWidthOverHeight: number): string {
  return `${ratioWidthOverHeight} / 1`;
}
