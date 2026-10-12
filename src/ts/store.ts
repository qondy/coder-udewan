import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, increment, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeForm } from './prompt';
import {
  CheckItem, Memo, MemoData, Preset, Project, PromptForm, Snippet, SnippetData, SnippetLang,
} from './types';

export const MAX_PRESET_NAME = 40;
export const MAX_PRESETS = 30;
export const MAX_SNIPPET_TITLE = 80;
export const MAX_SNIPPET_CODE = 20000;
export const MAX_SNIPPET_MEMO = 300;
export const MAX_PROJECT_NAME = 60;
export const MAX_CHECK_TEXT = 120;
export const MAX_CHECK_ITEMS = 200;
export const MAX_MEMO_TITLE = 80;
export const MAX_MEMO_BODY = 10000;
export const MAX_MEMO_CATEGORY = 20;
export const SNIPPET_LANGS: SnippetLang[] = ['html', 'scss', 'ts', 'js', 'other'];

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const msOrNull = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? v : null);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

type Unsub = () => void;
type OnError = (err: Error) => void;

// ============================================================
// Presets（指示プロンプトの保存テンプレート）
// ============================================================
const presetsCol = (uid: string) => collection(db, 'users', uid, 'presets');

export function subscribePresets(uid: string, onData: (list: Preset[]) => void, onError: OnError): Unsub {
  return onSnapshot(presetsCol(uid), (snap) => {
    const list: Preset[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      const name = str(data.name, MAX_PRESET_NAME).trim();
      if (!createdAt || !name) return;
      list.push({ id: d.id, name, form: normalizeForm(data.form), createdAt });
    });
    list.sort((a, b) => a.createdAt - b.createdAt);
    onData(list);
  }, onError);
}

export async function createPreset(uid: string, name: string, form: PromptForm): Promise<void> {
  await addDoc(presetsCol(uid), {
    name: name.trim().slice(0, MAX_PRESET_NAME),
    form: normalizeForm(form),
    createdAt: Date.now(),
  });
}

export function deletePreset(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'presets', id));
}

// ============================================================
// Snippets
// ============================================================
const snippetsCol = (uid: string) => collection(db, 'users', uid, 'snippets');

function sanitizeSnippet(data: SnippetData): SnippetData {
  return {
    title: data.title.trim().slice(0, MAX_SNIPPET_TITLE),
    lang: SNIPPET_LANGS.includes(data.lang) ? data.lang : 'other',
    code: data.code.slice(0, MAX_SNIPPET_CODE),
    memo: data.memo.trim().slice(0, MAX_SNIPPET_MEMO),
  };
}

export function subscribeSnippets(uid: string, onData: (list: Snippet[]) => void, onError: OnError): Unsub {
  return onSnapshot(snippetsCol(uid), (snap) => {
    const list: Snippet[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      if (!createdAt || typeof data.title !== 'string' || typeof data.code !== 'string') return;
      list.push({
        id: d.id,
        ...sanitizeSnippet({
          title: data.title,
          lang: data.lang as SnippetLang,
          code: data.code,
          memo: str(data.memo, MAX_SNIPPET_MEMO),
        }),
        copyCount: typeof data.copyCount === 'number' && data.copyCount > 0 ? Math.floor(data.copyCount) : 0,
        createdAt,
        updatedAt: msOrNull(data.updatedAt) ?? createdAt,
      });
    });
    onData(list);
  }, onError);
}

export async function createSnippet(uid: string, data: SnippetData): Promise<void> {
  const now = Date.now();
  await addDoc(snippetsCol(uid), { ...sanitizeSnippet(data), copyCount: 0, createdAt: now, updatedAt: now });
}

export function updateSnippet(uid: string, id: string, data: SnippetData): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'snippets', id), { ...sanitizeSnippet(data), updatedAt: Date.now() });
}

export function recordSnippetCopy(uid: string, id: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'snippets', id), { copyCount: increment(1) });
}

export function deleteSnippet(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'snippets', id));
}

export async function createSnippets(uid: string, items: SnippetData[]): Promise<void> {
  const batch = writeBatch(db);
  const now = Date.now();
  items.forEach((item, i) => {
    const t = now - i;
    batch.set(doc(snippetsCol(uid)), { ...sanitizeSnippet(item), copyCount: 0, createdAt: t, updatedAt: t });
  });
  await batch.commit();
}

// ============================================================
// Projects（納品前チェック）
// ============================================================
const projectsCol = (uid: string) => collection(db, 'users', uid, 'projects');

export function newItemId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeItems(raw: unknown): CheckItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CheckItem[] = [];
  raw.slice(0, MAX_CHECK_ITEMS).forEach((it) => {
    if (!it || typeof it !== 'object') return;
    const o = it as Record<string, unknown>;
    const text = str(o.text, MAX_CHECK_TEXT).trim();
    const id = str(o.id, 40);
    if (!text || !id) return;
    out.push({ id, group: str(o.group, 40).trim() || 'その他', text, done: o.done === true });
  });
  return out;
}

export function subscribeProjects(uid: string, onData: (list: Project[]) => void, onError: OnError): Unsub {
  return onSnapshot(projectsCol(uid), (snap) => {
    const list: Project[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      const name = str(data.name, MAX_PROJECT_NAME).trim();
      if (!createdAt || !name) return;
      list.push({
        id: d.id,
        name,
        due: isDate(data.due) ? data.due : '',
        items: sanitizeItems(data.items),
        createdAt,
        updatedAt: msOrNull(data.updatedAt) ?? createdAt,
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export async function createProject(uid: string, name: string, due: string, items: CheckItem[]): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(projectsCol(uid), {
    name: name.trim().slice(0, MAX_PROJECT_NAME),
    due: isDate(due) ? due : '',
    items: sanitizeItems(items),
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export function updateProjectInfo(uid: string, id: string, name: string, due: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'projects', id), {
    name: name.trim().slice(0, MAX_PROJECT_NAME),
    due: isDate(due) ? due : '',
    updatedAt: Date.now(),
  });
}

export function saveProjectItems(uid: string, id: string, items: CheckItem[]): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'projects', id), { items: sanitizeItems(items), updatedAt: Date.now() });
}

export function deleteProject(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'projects', id));
}

// ============================================================
// Memos
// ============================================================
const memosCol = (uid: string) => collection(db, 'users', uid, 'memos');

function sanitizeMemo(data: MemoData): MemoData {
  return {
    title: data.title.trim().slice(0, MAX_MEMO_TITLE),
    body: data.body.slice(0, MAX_MEMO_BODY),
    category: data.category.trim().slice(0, MAX_MEMO_CATEGORY),
    projectId: data.projectId.slice(0, 40),
    pinned: data.pinned === true,
  };
}

export function subscribeMemos(uid: string, onData: (list: Memo[]) => void, onError: OnError): Unsub {
  return onSnapshot(memosCol(uid), (snap) => {
    const list: Memo[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      if (!createdAt || typeof data.body !== 'string') return;
      list.push({
        id: d.id,
        ...sanitizeMemo({
          title: str(data.title, MAX_MEMO_TITLE),
          body: data.body,
          category: str(data.category, MAX_MEMO_CATEGORY),
          projectId: str(data.projectId, 40),
          pinned: data.pinned === true,
        }),
        createdAt,
        updatedAt: msOrNull(data.updatedAt) ?? createdAt,
      });
    });
    onData(list);
  }, onError);
}

export async function createMemo(uid: string, data: MemoData): Promise<void> {
  const now = Date.now();
  await addDoc(memosCol(uid), { ...sanitizeMemo(data), createdAt: now, updatedAt: now });
}

export function updateMemo(uid: string, id: string, data: MemoData): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'memos', id), { ...sanitizeMemo(data), updatedAt: Date.now() });
}

export function setMemoPinned(uid: string, id: string, pinned: boolean): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'memos', id), { pinned });
}

export function deleteMemo(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'memos', id));
}
