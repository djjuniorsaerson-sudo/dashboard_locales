export const PANEL_SYNC_EVENT = 'panel:data-sync';

export function dispatchPanelSync(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PANEL_SYNC_EVENT, { detail }));
}

export function subscribePanelSync(handler) {
  if (typeof window === 'undefined') return () => {};
  const wrapped = (event) => handler(event?.detail || {});
  window.addEventListener(PANEL_SYNC_EVENT, wrapped);
  return () => window.removeEventListener(PANEL_SYNC_EVENT, wrapped);
}
