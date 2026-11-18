export const DEFAULT_FONT_SIZE = 103;
// A new key resets the previous, larger default for existing users once.
export const FONT_SIZE_KEY = "forge-font-size-v3";

export function readFontSize(value: string | null): number {
  if (value === null) return DEFAULT_FONT_SIZE;
  const size = Number(value);
  return Number.isInteger(size) && size >= 100 && size <= 140
    ? size
    : DEFAULT_FONT_SIZE;
}
