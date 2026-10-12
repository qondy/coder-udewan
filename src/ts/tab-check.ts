import { copyText } from './clipboard';
import { confirmDialog } from './dialog';
import { ChecklistGroup, DELIVERY_CHECKLIST, START_CHECKLIST } from './rules';
import {
  createProject, deleteProject, MAX_CHECK_ITEMS, newItemId, saveProjectItems, subscribeProjects,
  updateProjectInfo,
} from './store';
import { CheckItem, Project } from './types';
import { button, closeOverlay, openOverlay, showToast, textEl } from './ui';

const HIDE_DONE_KEY = 'coder-udewan:hide-done';
const CUSTOM_GROUP = '追加した項目';

let uid: string | null = null;
let projects: Project[] = [];
let loaded = false;
let unsub: (() => void) | null = null;
let currentId: string | null = null;
/** 開いている案件をスナップショットで一度でも受け取ったか（作成直後はまだ届いていないことがある） */
let currentSeen = false;
let editingProjectId: string | null = null;
let savingProject = false;
let hideDone = false;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// メモタブなど、案件の一覧を使うほかの画面への通知
const projectListeners: ((list: Project[]) => void)[] = [];

export function onProjectsChange(cb: (list: Project[]) => void): void {
  projectListeners.push(cb);
  cb(projects);
}

function notifyProjects(): void {
  projectListeners.forEach((cb) => cb(projects));
}

function current(): Project | undefined {
  return projects.find((p) => p.id === currentId);
}

function progress(p: Project): { done: number; total: number; pct: number } {
  const total = p.items.length;
  const done = p.items.filter((it) => it.done).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 納期の表示（「10/20（あと3日）」など） */
function dueLabel(due: string): { text: string; tone: '' | 'soon' | 'over' } {
  if (!due) return { text: '', tone: '' };
  const [y, m, d] = due.split('-').map(Number);
  const [ty, tm, td] = todayStr().split('-').map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  const date = `${m}/${d}`;
  if (diff < 0) return { text: `納期 ${date}（${-diff}日過ぎています）`, tone: 'over' };
  if (diff === 0) return { text: `納期 ${date}（今日）`, tone: 'soon' };
  return { text: `納期 ${date}（あと${diff}日）`, tone: diff <= 3 ? 'soon' : '' };
}

function groupsOf(items: CheckItem[]): string[] {
  const out: string[] = [];
  items.forEach((it) => {
    if (!out.includes(it.group)) out.push(it.group);
  });
  return out;
}

function itemsFrom(lists: ChecklistGroup[]): CheckItem[] {
  return lists.flatMap((g) => g.items.map((text) => ({ id: newItemId(), group: g.group, text, done: false })));
}

// ============================================================
// 保存（チェックの連打でも順番どおりに書き込む）
// ============================================================
let saveChain: Promise<void> = Promise.resolve();

function persistItems(p: Project, items: CheckItem[]): void {
  if (!uid) return;
  const user = uid;
  p.items = items;
  render();
  saveChain = saveChain
    .then(() => saveProjectItems(user, p.id, items))
    .catch(() => showToast('保存できませんでした。通信状況を確認してください'));
}

// ============================================================
// 一覧
// ============================================================
function renderList(): void {
  const list = $('project-list');
  list.replaceChildren();
  $('project-loading').classList.toggle('hidden', loaded);
  $('project-empty').classList.toggle('hidden', !loaded || projects.length > 0);
  projects.forEach((p) => {
    const { done, total, pct } = progress(p);
    const li = document.createElement('li');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'project-card card-surface';
    card.addEventListener('click', () => openDetail(p.id));

    const top = document.createElement('div');
    top.className = 'project-card__top';
    top.appendChild(textEl('span', 'project-card__name', p.name));
    if (total > 0 && done === total) top.appendChild(textEl('span', 'done-badge', '納品OK'));
    card.appendChild(top);

    const due = dueLabel(p.due);
    if (due.text) card.appendChild(textEl('span', `project-card__due${due.tone ? ` is-${due.tone}` : ''}`, due.text));

    const bar = document.createElement('div');
    bar.className = 'progress';
    const fill = document.createElement('div');
    fill.className = 'progress__bar';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(textEl('span', 'project-card__meta', `${done} / ${total} 完了（${pct}%）`));
    li.appendChild(card);
    list.appendChild(li);
  });
}

// ============================================================
// 詳細
// ============================================================
function renderItem(p: Project, it: CheckItem): HTMLElement {
  const li = document.createElement('li');
  li.className = `check-item${it.done ? ' is-done' : ''}`;
  const label = document.createElement('label');
  label.className = 'check-item__label';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = it.done;
  cb.addEventListener('change', () => {
    persistItems(p, p.items.map((x) => (x.id === it.id ? { ...x, done: cb.checked } : x)));
  });
  label.append(cb, textEl('span', 'check-item__text', it.text));
  li.appendChild(label);
  const del = button('×', 'check-item__del', async () => {
    const ok = await confirmDialog({ title: '項目を削除しますか？', text: `「${it.text}」をこの案件のチェックリストから削除します。` });
    if (!ok) return;
    persistItems(p, p.items.filter((x) => x.id !== it.id));
  });
  del.setAttribute('aria-label', `「${it.text}」を削除`);
  li.appendChild(del);
  return li;
}

function renderDetail(): void {
  const p = current();
  if (!p) return;
  const { done, total, pct } = progress(p);
  $('project-name').textContent = p.name;
  const due = dueLabel(p.due);
  const dueEl = $('project-due');
  dueEl.textContent = due.text || '納期は未設定です';
  dueEl.className = `project-head__due${due.tone ? ` is-${due.tone}` : ''}`;
  $('project-progress-bar').style.width = `${pct}%`;
  $('project-summary').textContent = total === 0
    ? 'チェック項目がありません。下のフォームから追加してください。'
    : done === total
      ? `すべての項目（${total}件）をチェックしました。納品OKです！`
      : `${done} / ${total} 完了（${pct}%）・残り ${total - done} 件`;

  const hideBtn = $('btn-hide-done');
  hideBtn.textContent = hideDone ? 'チェック済みも表示' : 'チェック済みを隠す';
  hideBtn.setAttribute('aria-pressed', String(hideDone));

  const groups = groupsOf(p.items);
  const select = $<HTMLSelectElement>('add-item-group');
  const prev = select.value;
  select.replaceChildren();
  [...groups.filter((g) => g !== CUSTOM_GROUP), CUSTOM_GROUP].forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    select.appendChild(opt);
  });
  select.value = prev && Array.from(select.options).some((o) => o.value === prev) ? prev : CUSTOM_GROUP;

  const wrap = $('check-groups');
  wrap.replaceChildren();
  groups.forEach((g) => {
    const items = p.items.filter((it) => it.group === g);
    const gDone = items.filter((it) => it.done).length;
    const visible = hideDone ? items.filter((it) => !it.done) : items;
    const sec = document.createElement('section');
    sec.className = `check-group card-surface${gDone === items.length ? ' is-complete' : ''}`;
    const head = document.createElement('div');
    head.className = 'check-group__head';
    head.appendChild(textEl('h3', 'check-group__title', g));
    head.appendChild(textEl('span', 'check-group__count', `${gDone} / ${items.length}`));
    sec.appendChild(head);
    if (!visible.length) {
      sec.appendChild(textEl('p', 'check-group__all-done', 'このグループはすべてチェック済みです'));
    } else {
      const ul = document.createElement('ul');
      ul.className = 'check-group__list';
      visible.forEach((it) => ul.appendChild(renderItem(p, it)));
      sec.appendChild(ul);
    }
    wrap.appendChild(sec);
  });
}

function render(): void {
  const p = current();
  if (p) currentSeen = true;
  // 開いていた案件が削除された（別の端末で消した場合も含む）ら一覧に戻る
  else if (currentId && currentSeen) currentId = null;
  $('check-list-view').classList.toggle('hidden', Boolean(currentId));
  $('check-detail-view').classList.toggle('hidden', !currentId);
  if (currentId) renderDetail();
  else renderList();
}

function openDetail(id: string): void {
  currentId = id;
  currentSeen = false;
  render();
  window.scrollTo({ top: 0 });
}

// ============================================================
// 案件の作成・編集
// ============================================================
function openProjectModal(p: Project | null): void {
  editingProjectId = p ? p.id : null;
  $('project-modal-title').textContent = p ? '案件を編集' : '新しい案件';
  $('btn-project-save').textContent = p ? '保存する' : '作成する';
  $<HTMLInputElement>('input-project-name').value = p ? p.name : '';
  $<HTMLInputElement>('input-project-due').value = p ? p.due : '';
  $('project-lists-field').classList.toggle('hidden', Boolean(p));
  $<HTMLInputElement>('input-list-start').checked = true;
  $<HTMLInputElement>('input-list-delivery').checked = true;
  openOverlay($('project-overlay'));
  $<HTMLInputElement>('input-project-name').focus();
}

async function submitProject(e: Event): Promise<void> {
  e.preventDefault();
  if (savingProject || !uid) return;
  const nameEl = $<HTMLInputElement>('input-project-name');
  const name = nameEl.value.trim();
  const due = $<HTMLInputElement>('input-project-due').value;
  if (!name) {
    showToast('案件名を入力してください');
    nameEl.focus();
    return;
  }
  savingProject = true;
  const btn = $<HTMLButtonElement>('btn-project-save');
  btn.disabled = true;
  try {
    if (editingProjectId) {
      await updateProjectInfo(uid, editingProjectId, name, due);
      closeOverlay($('project-overlay'));
      showToast('案件を更新しました');
    } else {
      const lists = [
        ...($<HTMLInputElement>('input-list-start').checked ? START_CHECKLIST : []),
        ...($<HTMLInputElement>('input-list-delivery').checked ? DELIVERY_CHECKLIST : []),
      ];
      const id = await createProject(uid, name, due, itemsFrom(lists));
      closeOverlay($('project-overlay'));
      showToast('案件を作成しました');
      openDetail(id);
    }
  } catch {
    showToast('保存できませんでした。通信状況を確認してください');
  } finally {
    savingProject = false;
    btn.disabled = false;
  }
}

function addItem(e: Event): void {
  e.preventDefault();
  const p = current();
  if (!p) return;
  const input = $<HTMLInputElement>('add-item-text');
  const text = input.value.trim().slice(0, 120);
  if (!text) {
    showToast('項目の内容を入力してください');
    input.focus();
    return;
  }
  if (p.items.length >= MAX_CHECK_ITEMS) {
    showToast(`項目は${MAX_CHECK_ITEMS}件までです`);
    return;
  }
  const group = $<HTMLSelectElement>('add-item-group').value || CUSTOM_GROUP;
  // 同じグループの末尾に差し込む
  const items = [...p.items];
  let at = -1;
  items.forEach((it, i) => {
    if (it.group === group) at = i;
  });
  const item: CheckItem = { id: newItemId(), group, text, done: false };
  if (at === -1) items.push(item);
  else items.splice(at + 1, 0, item);
  persistItems(p, items);
  input.value = '';
  input.focus();
  showToast('項目を追加しました');
}

export function initCheckTab(): void {
  try {
    hideDone = localStorage.getItem(HIDE_DONE_KEY) === '1';
  } catch {
    hideDone = false;
  }
  $('btn-project-new').addEventListener('click', () => openProjectModal(null));
  $('btn-project-empty-new').addEventListener('click', () => openProjectModal(null));
  $('project-form').addEventListener('submit', submitProject);
  $('btn-project-back').addEventListener('click', () => {
    currentId = null;
    render();
  });
  $('btn-project-edit').addEventListener('click', () => {
    const p = current();
    if (p) openProjectModal(p);
  });
  $('add-item-form').addEventListener('submit', addItem);
  $('btn-hide-done').addEventListener('click', () => {
    hideDone = !hideDone;
    try {
      localStorage.setItem(HIDE_DONE_KEY, hideDone ? '1' : '0');
    } catch {
      // 保存できなくても表示の切り替えはできる
    }
    render();
  });
  $('btn-project-memos').addEventListener('click', () => {
    if (!currentId) return;
    document.dispatchEvent(new CustomEvent('app:open-memos', { detail: { projectId: currentId } }));
  });
  $('btn-copy-unchecked').addEventListener('click', async () => {
    const p = current();
    if (!p) return;
    const left = p.items.filter((it) => !it.done);
    if (!left.length) {
      showToast('未チェックの項目はありません');
      return;
    }
    const lines = [`【${p.name}】未チェックの項目（${left.length}件）`];
    groupsOf(left).forEach((g) => {
      lines.push('', `■ ${g}`, ...left.filter((it) => it.group === g).map((it) => `- ${it.text}`));
    });
    const ok = await copyText(lines.join('\n'));
    showToast(ok ? `未チェックの${left.length}件をコピーしました` : 'コピーできませんでした');
  });
  $('btn-check-reset').addEventListener('click', async () => {
    const p = current();
    if (!p) return;
    const ok = await confirmDialog({
      title: 'すべて未チェックに戻しますか？',
      text: 'チェック済みの印がすべて外れます。項目自体は消えません。',
      okLabel: '未チェックに戻す',
    });
    if (!ok) return;
    persistItems(p, p.items.map((it) => ({ ...it, done: false })));
    showToast('すべて未チェックに戻しました');
  });
  $('btn-project-delete').addEventListener('click', async () => {
    const p = current();
    if (!p || !uid) return;
    const ok = await confirmDialog({ title: '案件を削除しますか？', text: `「${p.name}」とチェックリストをすべて削除します。元に戻せません。` });
    if (!ok) return;
    try {
      await deleteProject(uid, p.id);
      currentId = null;
      render();
      showToast('案件を削除しました');
    } catch {
      showToast('削除できませんでした。通信状況を確認してください');
    }
  });
  render();
}

export function setCheckUser(nextUid: string | null): void {
  if (unsub) unsub();
  unsub = null;
  uid = nextUid;
  projects = [];
  loaded = false;
  currentId = null;
  notifyProjects();
  render();
  if (!nextUid) return;
  unsub = subscribeProjects(nextUid, (list) => {
    projects = list;
    loaded = true;
    notifyProjects();
    render();
  }, () => {
    loaded = true;
    render();
    showToast('案件を読み込めませんでした');
  });
}
