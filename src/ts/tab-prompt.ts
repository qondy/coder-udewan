import { copyText } from './clipboard';
import { confirmDialog } from './dialog';
import {
  buildPrompt, defaultForm, emptyAdjustItem, KIND_LABELS, MAX_ADJUST_ITEMS, normalizeForm,
} from './prompt';
import { createPreset, deletePreset, MAX_PRESETS, subscribePresets } from './store';
import { AdjustItem, Preset, PromptForm } from './types';
import { button, closeOverlay, openOverlay, showToast, textEl } from './ui';

const DRAFT_KEY = 'coder-udewan:draft';

let uid: string | null = null;
let form: PromptForm = defaultForm();
let presets: Preset[] = [];
let unsubPresets: (() => void) | null = null;
let savingPreset = false;
let draftTimer = 0;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function loadDraft(): PromptForm {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? normalizeForm(JSON.parse(raw)) : defaultForm();
  } catch {
    return defaultForm();
  }
}

function saveDraft(): void {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // 保存できない環境（プライベートモード等）では下書き保存を諦める
    }
  }, 300);
}

// ============================================================
// フォーム ⇄ state
// ============================================================
type FieldKey = Exclude<keyof PromptForm, 'adjustItems'>;

function formEl(): HTMLFormElement {
  return $('prompt-form');
}

/** name 属性を持つ入力から PromptForm の値を読み取る（調整内容のリストは別管理） */
function readForm(): void {
  const el = formEl();
  const next: Record<string, unknown> = { ...form };
  Array.from(el.elements).forEach((node) => {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return;
    const name = node.name as FieldKey;
    if (!name || node.closest('#adjust-list')) return;
    if (node instanceof HTMLInputElement && node.type === 'checkbox') next[name] = node.checked;
    else if (node instanceof HTMLInputElement && node.type === 'radio') {
      if (node.checked) next[name] = node.value;
    } else next[name] = node.value;
  });
  form = normalizeForm({ ...next, adjustItems: form.adjustItems });
}

function writeForm(): void {
  const el = formEl();
  const values = form as unknown as Record<string, unknown>;
  Array.from(el.elements).forEach((node) => {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return;
    const name = node.name;
    if (!name || node.closest('#adjust-list') || !(name in values)) return;
    const v = values[name];
    if (node instanceof HTMLInputElement && node.type === 'checkbox') node.checked = v === true;
    else if (node instanceof HTMLInputElement && node.type === 'radio') node.checked = node.value === v;
    else node.value = typeof v === 'string' ? v : '';
  });
  renderAdjustItems();
}

function renderKindSections(): void {
  document.querySelectorAll<HTMLElement>('.kind-section').forEach((sec) => {
    sec.classList.toggle('hidden', sec.dataset.kind !== form.kind);
  });
}

function renderPreview(): void {
  const text = buildPrompt(form);
  $('prompt-preview').textContent = text;
  $('prompt-count').textContent = `${text.length.toLocaleString()} 文字`;
}

function refresh(): void {
  renderKindSections();
  renderPreview();
  saveDraft();
}

// ============================================================
// 調整内容のリスト
// ============================================================
function adjustField(
  label: string, value: string, multiline: boolean, placeholder: string, onInput: (v: string) => void,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'adjust-list__field';
  wrap.appendChild(textEl('span', 'adjust-list__field-label', label));
  const input = multiline ? document.createElement('textarea') : document.createElement('input');
  if (input instanceof HTMLTextAreaElement) input.rows = 2;
  else input.type = 'text';
  input.maxLength = multiline ? 2000 : 80;
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = 'off';
  input.addEventListener('input', () => onInput(input.value));
  wrap.appendChild(input);
  return wrap;
}

function renderAdjustItems(): void {
  const list = $('adjust-list');
  list.replaceChildren();
  form.adjustItems.forEach((it: AdjustItem, i: number) => {
    const li = document.createElement('li');
    li.className = 'adjust-list__item';
    const head = document.createElement('div');
    head.className = 'adjust-list__head';
    head.appendChild(textEl('span', 'adjust-list__num', `${i + 1}`));
    if (form.adjustItems.length > 1) {
      head.appendChild(button('この項目を消す', 'link-btn link-btn--muted', () => {
        form.adjustItems.splice(i, 1);
        renderAdjustItems();
        refresh();
      }));
    }
    li.appendChild(head);
    const update = (key: keyof AdjustItem) => (v: string) => {
      form.adjustItems[i][key] = v;
      refresh();
    };
    li.appendChild(adjustField('箇所', it.place, false, '例：MVの見出し（スクショ①）', update('place')));
    li.appendChild(adjustField('現状', it.now, true, '例：SPで2行目が1文字だけ折り返している', update('now')));
    li.appendChild(adjustField('希望', it.want, true, '例：「〜を、」の後で改行して2行に収めたい', update('want')));
    list.appendChild(li);
  });
  ($('btn-adjust-add') as HTMLButtonElement).disabled = form.adjustItems.length >= MAX_ADJUST_ITEMS;
}

// ============================================================
// テンプレート（プリセット）
// ============================================================
function renderPresets(): void {
  const list = $('preset-list');
  list.replaceChildren();
  if (!uid) return;
  if (!presets.length) {
    list.appendChild(textEl('p', 'preset-bar__empty', 'よく使う設定（幅・倍率・ルールの入れ方など）を保存しておくと、ワンタップで呼び出せます。'));
    return;
  }
  presets.forEach((p) => {
    const chip = document.createElement('span');
    chip.className = 'preset-chip';
    const load = button(p.name, 'preset-chip__load', () => {
      form = normalizeForm(p.form);
      writeForm();
      refresh();
      showToast(`「${p.name}」を読み込みました`);
    });
    load.title = `${KIND_LABELS[p.form.kind]}のテンプレートを読み込む`;
    const del = button('×', 'preset-chip__del', async () => {
      const ok = await confirmDialog({
        title: 'テンプレートを削除しますか？',
        text: `「${p.name}」を削除します。元に戻せません。`,
      });
      if (!ok || !uid) return;
      try {
        await deletePreset(uid, p.id);
        showToast('テンプレートを削除しました');
      } catch {
        showToast('削除できませんでした。通信状況を確認してください');
      }
    });
    del.setAttribute('aria-label', `「${p.name}」を削除`);
    chip.append(load, del);
    list.appendChild(chip);
  });
}

function openPresetModal(): void {
  if (presets.length >= MAX_PRESETS) {
    showToast(`テンプレートは${MAX_PRESETS}個まで保存できます`);
    return;
  }
  const input = $<HTMLInputElement>('input-preset-name');
  input.value = form.project.trim() ? `${form.project.trim()}（${KIND_LABELS[form.kind]}）`.slice(0, 40) : '';
  openOverlay($('preset-overlay'));
  input.focus();
}

async function submitPreset(e: Event): Promise<void> {
  e.preventDefault();
  if (savingPreset || !uid) return;
  const input = $<HTMLInputElement>('input-preset-name');
  const name = input.value.trim();
  if (!name) {
    showToast('テンプレート名を入力してください');
    input.focus();
    return;
  }
  savingPreset = true;
  const btn = $<HTMLButtonElement>('btn-preset-submit');
  btn.disabled = true;
  try {
    await createPreset(uid, name, form);
    closeOverlay($('preset-overlay'));
    showToast('テンプレートを保存しました');
  } catch {
    showToast('保存できませんでした。通信状況を確認してください');
  } finally {
    savingPreset = false;
    btn.disabled = false;
  }
}

// ============================================================
// 初期化
// ============================================================
export function initPromptTab(): void {
  form = loadDraft();
  writeForm();
  refresh();

  const el = formEl();
  el.addEventListener('submit', (e) => e.preventDefault());
  el.addEventListener('input', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('#adjust-list')) return;
    // px 欄は数字だけにする
    if (t instanceof HTMLInputElement && t.inputMode === 'numeric') {
      const digits = t.value.replace(/[^0-9]/g, '');
      if (digits !== t.value) t.value = digits;
    }
    readForm();
    refresh();
  });
  el.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).closest('#adjust-list')) return;
    readForm();
    refresh();
  });

  $('btn-adjust-add').addEventListener('click', () => {
    if (form.adjustItems.length >= MAX_ADJUST_ITEMS) return;
    form.adjustItems.push(emptyAdjustItem());
    renderAdjustItems();
    refresh();
    const items = document.querySelectorAll<HTMLInputElement>('#adjust-list .adjust-list__item:last-child input');
    if (items[0]) items[0].focus();
  });

  $('btn-prompt-copy').addEventListener('click', async () => {
    const ok = await copyText(buildPrompt(form));
    showToast(ok ? '指示文をコピーしました' : 'コピーできませんでした。プレビューを選択してコピーしてください');
  });

  $('btn-form-reset').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '入力をリセットしますか？',
      text: '入力中の内容を消して、初期値に戻します。保存したテンプレートは消えません。',
      okLabel: 'リセットする',
    });
    if (!ok) return;
    form = defaultForm();
    writeForm();
    refresh();
    showToast('入力をリセットしました');
  });

  $('btn-preset-save').addEventListener('click', openPresetModal);
  $('preset-form').addEventListener('submit', submitPreset);
}

export function setPromptUser(nextUid: string | null): void {
  if (unsubPresets) unsubPresets();
  unsubPresets = null;
  uid = nextUid;
  presets = [];
  renderPresets();
  if (!nextUid) return;
  unsubPresets = subscribePresets(nextUid, (list) => {
    presets = list;
    renderPresets();
  }, () => showToast('テンプレートを読み込めませんでした'));
}
