import { copyText } from './clipboard';
import { confirmDialog } from './dialog';
import { SAMPLE_SNIPPETS } from './samples';
import {
  createSnippet, createSnippets, deleteSnippet, MAX_SNIPPET_CODE, recordSnippetCopy, SNIPPET_LANGS,
  subscribeSnippets, updateSnippet,
} from './store';
import { Snippet, SnippetData, SnippetLang } from './types';
import { button, closeOverlay, openOverlay, showToast, textEl } from './ui';

export const LANG_LABELS: Record<SnippetLang, string> = {
  html: 'HTML',
  scss: 'SCSS',
  ts: 'TypeScript',
  js: 'JavaScript',
  other: 'その他',
};

let uid: string | null = null;
let snippets: Snippet[] = [];
let loaded = false;
let unsub: (() => void) | null = null;
let query = '';
let langFilter: SnippetLang | '' = '';
let editingId: string | null = null;
let saving = false;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function filtered(): Snippet[] {
  const q = query.trim().toLowerCase();
  return snippets
    .filter((s) => !langFilter || s.lang === langFilter)
    .filter((s) => !q || `${s.title}\n${s.memo}\n${s.code}`.toLowerCase().includes(q))
    .sort((a, b) => b.copyCount - a.copyCount || b.updatedAt - a.updatedAt);
}

function renderLangFilter(): void {
  const row = $('lang-filter');
  row.replaceChildren();
  const counts = new Map<string, number>();
  snippets.forEach((s) => counts.set(s.lang, (counts.get(s.lang) ?? 0) + 1));
  const make = (value: SnippetLang | '', label: string, count: number) => {
    const b = button(`${label} ${count}`, 'chip', () => {
      langFilter = value;
      render();
    });
    b.classList.toggle('is-active', langFilter === value);
    b.setAttribute('aria-pressed', String(langFilter === value));
    row.appendChild(b);
  };
  make('', 'すべて', snippets.length);
  SNIPPET_LANGS.forEach((l) => {
    const c = counts.get(l) ?? 0;
    if (c > 0 || langFilter === l) make(l, LANG_LABELS[l], c);
  });
}

async function copySnippet(s: Snippet): Promise<void> {
  const ok = await copyText(s.code);
  showToast(ok ? `「${s.title}」をコピーしました` : 'コピーできませんでした');
  if (ok && uid) recordSnippetCopy(uid, s.id).catch(() => undefined);
}

function renderCard(s: Snippet): HTMLElement {
  const li = document.createElement('li');
  li.className = 'snippet-card card-surface';

  const head = document.createElement('div');
  head.className = 'snippet-card__head';
  head.appendChild(textEl('span', `lang-badge lang-badge--${s.lang}`, LANG_LABELS[s.lang]));
  head.appendChild(textEl('h3', 'snippet-card__title', s.title));
  li.appendChild(head);

  if (s.memo) li.appendChild(textEl('p', 'snippet-card__memo', s.memo));

  const code = document.createElement('button');
  code.type = 'button';
  code.className = 'snippet-card__code';
  code.setAttribute('aria-label', `「${s.title}」のコードをコピー`);
  code.appendChild(textEl('pre', '', s.code));
  code.addEventListener('click', () => copySnippet(s));
  li.appendChild(code);

  const foot = document.createElement('div');
  foot.className = 'snippet-card__foot';
  foot.appendChild(textEl('span', 'snippet-card__meta', `${s.code.split('\n').length}行・コピー ${s.copyCount}回`));
  const actions = document.createElement('div');
  actions.className = 'snippet-card__actions';
  actions.appendChild(button('編集', 'btn btn--ghost btn--sm', () => openEditor(s)));
  actions.appendChild(button('コピー', 'btn btn--primary btn--sm', () => copySnippet(s)));
  foot.appendChild(actions);
  li.appendChild(foot);
  return li;
}

function render(): void {
  const list = $('snippet-list');
  $('snippet-loading').classList.toggle('hidden', loaded);
  list.replaceChildren();
  renderLangFilter();
  if (!loaded) return;
  const items = filtered();
  $('snippet-empty-first').classList.toggle('hidden', snippets.length > 0);
  $('snippet-empty-match').classList.toggle('hidden', snippets.length === 0 || items.length > 0);
  items.forEach((s) => list.appendChild(renderCard(s)));
}

// ============================================================
// 編集モーダル
// ============================================================
function updateCount(): void {
  const len = $<HTMLTextAreaElement>('input-snippet-code').value.length;
  $('snippet-code-count').textContent = `${len.toLocaleString()} / ${MAX_SNIPPET_CODE.toLocaleString()}`;
}

function openEditor(s: Snippet | null): void {
  editingId = s ? s.id : null;
  $('snippet-modal-title').textContent = s ? 'スニペットを編集' : '新しいスニペット';
  $<HTMLInputElement>('input-snippet-title').value = s ? s.title : '';
  $<HTMLSelectElement>('input-snippet-lang').value = s ? s.lang : (langFilter || 'html');
  $<HTMLTextAreaElement>('input-snippet-code').value = s ? s.code : '';
  $<HTMLInputElement>('input-snippet-memo').value = s ? s.memo : '';
  $('btn-snippet-delete').classList.toggle('hidden', !s);
  updateCount();
  openOverlay($('snippet-overlay'));
  $<HTMLInputElement>('input-snippet-title').focus();
}

async function submitEditor(e: Event): Promise<void> {
  e.preventDefault();
  if (saving || !uid) return;
  const titleEl = $<HTMLInputElement>('input-snippet-title');
  const codeEl = $<HTMLTextAreaElement>('input-snippet-code');
  const data: SnippetData = {
    title: titleEl.value.trim(),
    lang: $<HTMLSelectElement>('input-snippet-lang').value as SnippetLang,
    code: codeEl.value,
    memo: $<HTMLInputElement>('input-snippet-memo').value.trim(),
  };
  if (!data.title) {
    showToast('タイトルを入力してください');
    titleEl.focus();
    return;
  }
  if (!data.code.trim()) {
    showToast('コードを入力してください');
    codeEl.focus();
    return;
  }
  saving = true;
  const btn = $<HTMLButtonElement>('btn-snippet-save');
  btn.disabled = true;
  try {
    if (editingId) await updateSnippet(uid, editingId, data);
    else await createSnippet(uid, data);
    closeOverlay($('snippet-overlay'));
    showToast(editingId ? 'スニペットを更新しました' : 'スニペットを登録しました');
  } catch {
    showToast('保存できませんでした。通信状況を確認してください');
  } finally {
    saving = false;
    btn.disabled = false;
  }
}

async function removeEditing(): Promise<void> {
  const s = snippets.find((x) => x.id === editingId);
  if (!s || !uid) return;
  const ok = await confirmDialog({ title: 'スニペットを削除しますか？', text: `「${s.title}」を削除します。元に戻せません。` });
  if (!ok) return;
  try {
    await deleteSnippet(uid, s.id);
    closeOverlay($('snippet-overlay'));
    showToast('スニペットを削除しました');
  } catch {
    showToast('削除できませんでした。通信状況を確認してください');
  }
}

/** 編集モーダルを閉じてよいか（入力途中なら確認する） */
export async function canCloseSnippetEditor(): Promise<boolean> {
  const s = snippets.find((x) => x.id === editingId);
  const title = $<HTMLInputElement>('input-snippet-title').value;
  const code = $<HTMLTextAreaElement>('input-snippet-code').value;
  const memo = $<HTMLInputElement>('input-snippet-memo').value;
  const dirty = s
    ? title !== s.title || code !== s.code || memo !== s.memo
    : Boolean(title.trim() || code.trim() || memo.trim());
  if (!dirty) return true;
  return confirmDialog({ title: '編集内容を破棄しますか？', text: '保存していない入力内容は失われます。', okLabel: '破棄する' });
}

let addingSamples = false;

export function initSnippetTab(): void {
  const search = $<HTMLInputElement>('snippet-search');
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  $('btn-snippet-new').addEventListener('click', () => openEditor(null));
  $('btn-snippet-empty-new').addEventListener('click', () => openEditor(null));
  $('btn-snippet-clear').addEventListener('click', () => {
    query = '';
    search.value = '';
    langFilter = '';
    render();
  });
  $('btn-snippet-samples').addEventListener('click', async () => {
    if (addingSamples || !uid) return;
    addingSamples = true;
    const btn = $<HTMLButtonElement>('btn-snippet-samples');
    btn.disabled = true;
    try {
      await createSnippets(uid, SAMPLE_SNIPPETS);
      showToast('定番のスニペットを5つ追加しました');
    } catch {
      showToast('追加できませんでした。通信状況を確認してください');
    } finally {
      addingSamples = false;
      btn.disabled = false;
    }
  });
  $('snippet-form').addEventListener('submit', submitEditor);
  $('btn-snippet-delete').addEventListener('click', removeEditing);
  $('input-snippet-code').addEventListener('input', updateCount);
  // コード欄では Tab キーでインデントを入れる（Shift+Tab はフォーカス移動のまま）
  $('input-snippet-code').addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.shiftKey || e.isComposing) return;
    const ta = e.target as HTMLTextAreaElement;
    e.preventDefault();
    ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
    updateCount();
  });
  render();
}

export function setSnippetUser(nextUid: string | null): void {
  if (unsub) unsub();
  unsub = null;
  uid = nextUid;
  snippets = [];
  loaded = false;
  render();
  if (!nextUid) return;
  unsub = subscribeSnippets(nextUid, (list) => {
    snippets = list;
    loaded = true;
    render();
  }, () => {
    loaded = true;
    render();
    showToast('スニペットを読み込めませんでした');
  });
}
