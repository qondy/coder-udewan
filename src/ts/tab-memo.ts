import { copyText } from './clipboard';
import { confirmDialog } from './dialog';
import {
  createMemo, deleteMemo, MAX_MEMO_BODY, setMemoPinned, subscribeMemos, updateMemo,
} from './store';
import { onProjectsChange } from './tab-check';
import { Memo, MemoData, Project } from './types';
import { button, closeOverlay, openOverlay, showToast, textEl } from './ui';

/** 本文に差し込めるひな形 */
const MEMO_TEMPLATES: { label: string; category: string; text: string }[] = [
  {
    label: '打ち合わせ',
    category: '打ち合わせ',
    text: '【打ち合わせ】\n日時：\n参加者：\n\n■ 決まったこと\n- \n\n■ 宿題（担当・期限）\n- \n\n■ 次回までに確認すること\n- ',
  },
  {
    label: '修正依頼',
    category: '修正依頼',
    text: '【修正依頼】\n依頼日：\n対象ページ：\n\n1. 箇所：\n   内容：\n\n対応期限：',
  },
  {
    label: '案件の基本情報',
    category: '案件情報',
    text: '【案件の基本情報】\n担当者：\n公開URL：\nテストURL：\n納期：\nブレークポイント：\nフォント：\n※ パスワードやFTPの接続情報はここに書かない',
  },
  {
    label: '作業ログ',
    category: '作業ログ',
    text: '【作業ログ】\n- ',
  },
];

/** カテゴリー入力の候補（使ったことのあるカテゴリーと合わせて表示） */
const DEFAULT_CATEGORIES = ['打ち合わせ', '修正依頼', '作業ログ', '案件情報', 'アイデア', '参考サイト'];
const NO_CATEGORY = '__none';

const URL_RE = /(https?:\/\/[^\s<>"'）」]+)/g;

let uid: string | null = null;
let memos: Memo[] = [];
let projects: Project[] = [];
let loaded = false;
let unsub: (() => void) | null = null;
let query = '';
/** '' はすべて、NO_CATEGORY は未分類、それ以外はカテゴリー名 */
let categoryFilter = '';
/** '' はすべて、'none' は案件なし、それ以外は案件ID */
let projectFilter = '';
let editingId: string | null = null;
let saving = false;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function projectName(id: string): string {
  const p = projects.find((x) => x.id === id);
  return p ? p.name : '';
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `今日 ${hm}`;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? `${md} ${hm}` : `${d.getFullYear()}/${md}`;
}

/** 1行目をタイトル代わりに使う（タイトル未入力のとき） */
function displayTitle(m: Memo): string {
  if (m.title) return m.title;
  const first = m.body.trim().split('\n')[0] ?? '';
  return first.replace(/^【|】$/g, '').slice(0, 40) || '（無題のメモ）';
}

function filtered(): Memo[] {
  const q = query.trim().toLowerCase();
  return memos
    .filter((m) => {
      if (categoryFilter === NO_CATEGORY) return !m.category;
      return !categoryFilter || m.category === categoryFilter;
    })
    .filter((m) => {
      if (projectFilter === 'none') return !m.projectId || !projectName(m.projectId);
      return !projectFilter || m.projectId === projectFilter;
    })
    .filter((m) => !q || `${m.title}\n${m.body}\n${m.category}\n${projectName(m.projectId)}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

/** URL を安全にリンク化して本文を組み立てる（innerHTML は使わない） */
function bodyEl(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'memo-card__body';
  text.split(URL_RE).forEach((part, i) => {
    if (i % 2 === 1) {
      const a = document.createElement('a');
      a.href = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = part;
      a.addEventListener('click', (e) => e.stopPropagation());
      p.appendChild(a);
    } else if (part) {
      p.appendChild(document.createTextNode(part));
    }
  });
  return p;
}

/** 使われているカテゴリーを、件数の多い順に返す */
function usedCategories(): [string, number][] {
  const counts = new Map<string, number>();
  memos.forEach((m) => {
    if (m.category) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
}

function renderFilter(): void {
  const row = $('memo-filter');
  row.replaceChildren();
  const make = (value: string, label: string, count: number) => {
    const b = button(`${label} ${count}`, 'chip', () => {
      categoryFilter = value;
      render();
    });
    b.classList.toggle('is-active', categoryFilter === value);
    b.setAttribute('aria-pressed', String(categoryFilter === value));
    row.appendChild(b);
  };
  const cats = usedCategories();
  make('', 'すべて', memos.length);
  cats.forEach(([c, n]) => make(c, c, n));
  if (categoryFilter && categoryFilter !== NO_CATEGORY && !cats.some(([c]) => c === categoryFilter)) make(categoryFilter, categoryFilter, 0);
  const none = memos.filter((m) => !m.category).length;
  if ((none > 0 && cats.length > 0) || categoryFilter === NO_CATEGORY) make(NO_CATEGORY, '未分類', none);

  // 案件の絞り込み（プルダウン）
  const select = $<HTMLSelectElement>('memo-project-filter');
  select.replaceChildren();
  const add = (value: string, label: string) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  };
  add('', 'すべての案件');
  projects.forEach((p) => add(p.id, p.name));
  add('none', '案件なし');
  select.value = projectFilter;
  $('memo-filter-bar').classList.toggle('hidden', memos.length === 0 && !categoryFilter && !projectFilter);
}

function renderCard(m: Memo): HTMLElement {
  const li = document.createElement('li');
  li.className = `memo-card card-surface${m.pinned ? ' is-pinned' : ''}`;

  const head = document.createElement('div');
  head.className = 'memo-card__head';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'memo-card__title';
  open.textContent = displayTitle(m);
  open.addEventListener('click', () => openEditor(m, ''));
  head.appendChild(open);
  const pin = button(m.pinned ? 'ピン留め中' : 'ピン留め', `memo-card__pin${m.pinned ? ' is-active' : ''}`, async () => {
    if (!uid) return;
    try {
      await setMemoPinned(uid, m.id, !m.pinned);
    } catch {
      showToast('変更できませんでした。通信状況を確認してください');
    }
  });
  pin.setAttribute('aria-pressed', String(m.pinned));
  head.appendChild(pin);
  li.appendChild(head);

  const name = projectName(m.projectId);
  if (m.category || name) {
    const tags = document.createElement('div');
    tags.className = 'memo-card__tags';
    if (m.category) {
      const cat = button(m.category, 'memo-card__category', () => {
        categoryFilter = m.category;
        render();
      });
      cat.title = `「${m.category}」のメモだけを表示`;
      tags.appendChild(cat);
    }
    if (name) tags.appendChild(textEl('span', 'memo-card__project', name));
    li.appendChild(tags);
  }
  if (m.body.trim()) li.appendChild(bodyEl(m.body));

  const foot = document.createElement('div');
  foot.className = 'memo-card__foot';
  foot.appendChild(textEl('span', 'memo-card__date', `更新 ${formatDate(m.updatedAt)}`));
  const actions = document.createElement('div');
  actions.className = 'memo-card__actions';
  actions.appendChild(button('編集', 'btn btn--ghost btn--sm', () => openEditor(m, '')));
  actions.appendChild(button('コピー', 'btn btn--primary btn--sm', async () => {
    const ok = await copyText(m.title ? `${m.title}\n\n${m.body}` : m.body);
    showToast(ok ? 'メモをコピーしました' : 'コピーできませんでした');
  }));
  foot.appendChild(actions);
  li.appendChild(foot);
  return li;
}

function render(): void {
  if (projectFilter && projectFilter !== 'none' && !projectName(projectFilter) && loaded) projectFilter = '';
  $('memo-loading').classList.toggle('hidden', loaded);
  renderFilter();
  const list = $('memo-list');
  list.replaceChildren();
  if (!loaded) return;
  const items = filtered();
  $('memo-empty-first').classList.toggle('hidden', memos.length > 0);
  $('memo-empty-match').classList.toggle('hidden', memos.length === 0 || items.length > 0);
  items.forEach((m) => list.appendChild(renderCard(m)));
}

// ============================================================
// 編集モーダル
// ============================================================
function renderProjectOptions(selected: string): void {
  const select = $<HTMLSelectElement>('input-memo-project');
  select.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '紐付けない';
  select.appendChild(none);
  projects.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  select.value = projects.some((p) => p.id === selected) ? selected : '';
}

function renderCategorySuggestions(): void {
  const names = Array.from(new Set([...usedCategories().map(([c]) => c), ...DEFAULT_CATEGORIES]));
  const list = $('memo-category-list');
  list.replaceChildren();
  names.forEach((n) => {
    const opt = document.createElement('option');
    opt.value = n;
    list.appendChild(opt);
  });
  const chips = $('memo-category-chips');
  chips.replaceChildren();
  names.slice(0, 8).forEach((n) => chips.appendChild(button(n, 'chip chip--sm', () => {
    $<HTMLInputElement>('input-memo-category').value = n;
  })));
}

function updateCount(): void {
  const len = $<HTMLTextAreaElement>('input-memo-body').value.length;
  $('memo-body-count').textContent = `${len.toLocaleString()} / ${MAX_MEMO_BODY.toLocaleString()}`;
}

function openEditor(m: Memo | null, defaultProjectId: string): void {
  editingId = m ? m.id : null;
  $('memo-modal-title').textContent = m ? 'メモを編集' : '新しいメモ';
  $<HTMLInputElement>('input-memo-title').value = m ? m.title : '';
  $<HTMLTextAreaElement>('input-memo-body').value = m ? m.body : '';
  $<HTMLInputElement>('input-memo-pinned').checked = m ? m.pinned : false;
  $<HTMLInputElement>('input-memo-category').value = m
    ? m.category
    : (categoryFilter && categoryFilter !== NO_CATEGORY ? categoryFilter : '');
  renderCategorySuggestions();
  renderProjectOptions(m ? m.projectId : defaultProjectId);
  $('btn-memo-delete').classList.toggle('hidden', !m);
  updateCount();
  openOverlay($('memo-overlay'));
  $<HTMLTextAreaElement>('input-memo-body').focus();
}

function readEditor(): MemoData {
  return {
    title: $<HTMLInputElement>('input-memo-title').value.trim(),
    body: $<HTMLTextAreaElement>('input-memo-body').value,
    category: $<HTMLInputElement>('input-memo-category').value.trim(),
    projectId: $<HTMLSelectElement>('input-memo-project').value,
    pinned: $<HTMLInputElement>('input-memo-pinned').checked,
  };
}

async function submitEditor(e?: Event): Promise<void> {
  if (e) e.preventDefault();
  if (saving || !uid) return;
  const data = readEditor();
  if (!data.title && !data.body.trim()) {
    showToast('タイトルか本文を入力してください');
    $<HTMLTextAreaElement>('input-memo-body').focus();
    return;
  }
  saving = true;
  const btn = $<HTMLButtonElement>('btn-memo-save');
  btn.disabled = true;
  try {
    if (editingId) await updateMemo(uid, editingId, data);
    else await createMemo(uid, data);
    closeOverlay($('memo-overlay'));
    showToast(editingId ? 'メモを更新しました' : 'メモを保存しました');
  } catch {
    showToast('保存できませんでした。通信状況を確認してください');
  } finally {
    saving = false;
    btn.disabled = false;
  }
}

async function removeEditing(): Promise<void> {
  const m = memos.find((x) => x.id === editingId);
  if (!m || !uid) return;
  const ok = await confirmDialog({ title: 'メモを削除しますか？', text: `「${displayTitle(m)}」を削除します。元に戻せません。` });
  if (!ok) return;
  try {
    await deleteMemo(uid, m.id);
    closeOverlay($('memo-overlay'));
    showToast('メモを削除しました');
  } catch {
    showToast('削除できませんでした。通信状況を確認してください');
  }
}

/** 編集モーダルを閉じてよいか（入力途中なら確認する） */
export async function canCloseMemoEditor(): Promise<boolean> {
  const m = memos.find((x) => x.id === editingId);
  const d = readEditor();
  const dirty = m
    ? d.title !== m.title || d.body !== m.body || d.category !== m.category || d.projectId !== (projectName(m.projectId) ? m.projectId : '') || d.pinned !== m.pinned
    : Boolean(d.title || d.body.trim());
  if (!dirty) return true;
  return confirmDialog({ title: '編集内容を破棄しますか？', text: '保存していない入力内容は失われます。', okLabel: '破棄する' });
}

function insertTemplate(text: string, category: string): void {
  const cat = $<HTMLInputElement>('input-memo-category');
  if (!cat.value.trim()) cat.value = category;
  const ta = $<HTMLTextAreaElement>('input-memo-body');
  const before = ta.value.slice(0, ta.selectionStart);
  const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
  ta.setRangeText(`${prefix}${text}`, ta.selectionStart, ta.selectionEnd, 'end');
  ta.focus();
  updateCount();
}

/** 指定した案件で絞り込んだ状態でメモタブを開く（納品チェックの案件画面から呼ばれる） */
export function showProjectMemos(projectId: string): void {
  projectFilter = projectId;
  categoryFilter = '';
  query = '';
  $<HTMLInputElement>('memo-search').value = '';
  render();
}

export function initMemoTab(): void {
  const search = $<HTMLInputElement>('memo-search');
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  const newMemo = () => openEditor(null, projectFilter && projectFilter !== 'none' ? projectFilter : '');
  $('btn-memo-new').addEventListener('click', newMemo);
  $('btn-memo-empty-new').addEventListener('click', newMemo);
  $('memo-project-filter').addEventListener('change', (e) => {
    projectFilter = (e.target as HTMLSelectElement).value;
    render();
  });
  $('btn-memo-clear').addEventListener('click', () => {
    query = '';
    search.value = '';
    categoryFilter = '';
    projectFilter = '';
    render();
  });
  $('memo-form').addEventListener('submit', submitEditor);
  $('btn-memo-delete').addEventListener('click', removeEditing);
  $('input-memo-body').addEventListener('input', updateCount);
  // Ctrl / ⌘ + Enter で保存
  $('memo-form').addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      submitEditor();
    }
  });
  const tpl = $('memo-templates');
  MEMO_TEMPLATES.forEach((t) => tpl.appendChild(button(`＋ ${t.label}`, 'chip chip--sm', () => insertTemplate(t.text, t.category))));

  onProjectsChange((list) => {
    projects = list;
    render();
  });
  render();
}

export function setMemoUser(nextUid: string | null): void {
  if (unsub) unsub();
  unsub = null;
  uid = nextUid;
  memos = [];
  loaded = false;
  render();
  if (!nextUid) return;
  unsub = subscribeMemos(nextUid, (list) => {
    memos = list;
    loaded = true;
    render();
  }, () => {
    loaded = true;
    render();
    showToast('メモを読み込めませんでした');
  });
}
