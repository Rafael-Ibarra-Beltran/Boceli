// Keep detents stable for the lifetime of an open sheet, including method changes.
export function registerSheetDetents(screenHeight: number, fontScale: number): [number, number] {
  return screenHeight <= 700 || fontScale >= 1.3 ? [0.95, 1] : [0.8, 0.95];
}
