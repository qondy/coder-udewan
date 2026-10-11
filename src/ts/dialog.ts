import { closeOverlay, openOverlay } from './ui';

interface ConfirmOptions {
  title: string;
  text: string;
  okLabel?: string;
}

let resolver: ((ok: boolean) => void) | null = null;

function getEls() {
  return {
    overlay: document.getElementById('confirm-dialog-overlay') as HTMLElement,
    title: document.getElementById('confirm-dialog-title') as HTMLElement,
    text: document.getElementById('confirm-dialog-text') as HTMLElement,
    ok: document.getElementById('btn-confirm-ok') as HTMLButtonElement,
    cancel: document.getElementById('btn-confirm-cancel') as HTMLButtonElement,
  };
}

function finish(ok: boolean): void {
  closeOverlay(getEls().overlay);
  const r = resolver;
  resolver = null;
  if (r) r(ok);
}

export function initConfirmDialog(): void {
  const els = getEls();
  els.ok.addEventListener('click', () => finish(true));
  els.cancel.addEventListener('click', () => finish(false));
  els.overlay.addEventListener('click', (e) => {
    if (e.target === els.overlay) finish(false);
  });
}

export function isConfirmOpen(): boolean {
  return resolver !== null;
}

export function cancelConfirm(): void {
  if (resolver) finish(false);
}

/** ブラウザ標準の confirm() の代わりに使うカスタム確認ダイアログ */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const els = getEls();
  if (resolver) finish(false);
  els.title.textContent = opts.title;
  els.text.textContent = opts.text;
  els.ok.textContent = opts.okLabel ?? '削除する';
  openOverlay(els.overlay);
  els.cancel.focus();
  return new Promise((resolve) => {
    resolver = resolve;
  });
}
