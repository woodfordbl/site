/** Blur the focused field and clear native selection (iOS keyboard/accessory bar). */
export function dismissMobileTextSelection(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
  window.getSelection()?.removeAllRanges();
}
