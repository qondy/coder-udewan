import { loginWithGoogle, logout, onAuthChange } from './auth';
import { cancelConfirm, initConfirmDialog, isConfirmOpen } from './dialog';
import { submitFeedback } from './feedback';
import { initCheckTab, setCheckUser } from './tab-check';
import { initPromptTab, setPromptUser } from './tab-prompt';
import { initRulesTab } from './tab-rules';
import { canCloseSnippetEditor, initSnippetTab, setSnippetUser } from './tab-snippet';
import { TabKey } from './types';
import { closeOverlay, openOverlay, showToast } from './ui';

const TAB_KEY = 'coder-udewan:tab';
const TABS: TabKey[] = ['prompt', 'rules', 'snippet', 'check'];

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ============================================================
// タブ
// ============================================================
function switchTab(tab: TabKey): void {
  document.querySelectorAll<HTMLButtonElement>('.tabs__btn').forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
  });
  TABS.forEach((t) => $(`panel-${t}`).classList.toggle('hidden', t !== tab));
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // 保存できなくてもタブの切り替えはできる
  }
}

function initTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab as TabKey));
    // 矢印キーでタブを移動
    b.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
      switchTab(next.dataset.tab as TabKey);
      next.focus();
    });
  });
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TAB_KEY);
  } catch {
    saved = null;
  }
  switchTab(TABS.includes(saved as TabKey) ? (saved as TabKey) : 'prompt');
}

// ============================================================
// モーダル共通（× / キャンセル / 背景クリック / Esc で閉じる）
// ============================================================
async function requestClose(overlay: HTMLElement): Promise<void> {
  if (overlay.id === 'snippet-overlay' && !(await canCloseSnippetEditor())) return;
  closeOverlay(overlay);
}

function initOverlays(): void {
  document.querySelectorAll<HTMLElement>('.dialog-overlay').forEach((overlay) => {
    if (overlay.id === 'confirm-dialog-overlay') return;
    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === overlay || t.closest('[data-close]')) requestClose(overlay);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isConfirmOpen()) {
      cancelConfirm();
      return;
    }
    const open = Array.from(document.querySelectorAll<HTMLElement>('.dialog-overlay.is-open')).pop();
    if (open) requestClose(open);
  });
}

// ============================================================
// ご意見
// ============================================================
function initFeedback(): void {
  const overlay = $('feedback-modal-overlay');
  const input = $<HTMLTextAreaElement>('input-feedback-message');
  const send = $<HTMLButtonElement>('btn-feedback-send');
  let sending = false;
  $('feedback-btn').addEventListener('click', () => {
    openOverlay(overlay);
    input.focus();
  });
  send.addEventListener('click', async () => {
    const message = input.value.trim();
    if (!message) {
      showToast('ご意見を入力してください');
      input.focus();
      return;
    }
    if (sending) return;
    sending = true;
    send.disabled = true;
    send.textContent = '送信中…';
    const ok = await submitFeedback(message);
    sending = false;
    send.disabled = false;
    send.textContent = '送信する';
    if (ok) {
      input.value = '';
      closeOverlay(overlay);
      showToast('送信しました。ありがとうございます！');
    } else {
      showToast('送信できませんでした。時間をおいてもう一度お試しください');
    }
  });
}

// ============================================================
// ログイン
// ============================================================
function initAuth(): void {
  const loginBtn = $<HTMLButtonElement>('btn-google-login');
  let loggingIn = false;
  loginBtn.addEventListener('click', async () => {
    if (loggingIn) return;
    loggingIn = true;
    loginBtn.disabled = true;
    try {
      await loginWithGoogle();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        showToast('ログインできませんでした。もう一度お試しください');
      }
    } finally {
      loggingIn = false;
      loginBtn.disabled = false;
    }
  });
  $('btn-logout').addEventListener('click', () => {
    logout().catch(() => showToast('ログアウトできませんでした'));
  });

  onAuthChange((user) => {
    $('login-screen').classList.toggle('hidden', Boolean(user));
    $('app').classList.toggle('hidden', !user);
    $('user-info').classList.toggle('hidden', !user);
    if (user) {
      const avatar = $<HTMLImageElement>('user-avatar');
      if (user.photoURL) {
        avatar.src = user.photoURL;
        avatar.classList.remove('hidden');
      } else {
        avatar.classList.add('hidden');
      }
      $('user-name').textContent = user.displayName ?? '';
    }
    const uid = user ? user.uid : null;
    setPromptUser(uid);
    setSnippetUser(uid);
    setCheckUser(uid);
  });
}

initConfirmDialog();
initOverlays();
initTabs();
initPromptTab();
initRulesTab();
initSnippetTab();
initCheckTab();
initFeedback();
initAuth();
