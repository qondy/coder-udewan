import { copyText } from './clipboard';
import {
  buildRuleFile, defaultRuleFileSettings, normalizeRuleFileSettings, RuleFileSettings, TARGETS,
} from './rulefile';
import { showToast, textEl } from './ui';

const SETTINGS_KEY = 'coder-udewan:rulefile';

let settings: RuleFileSettings = defaultRuleFileSettings();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function load(): RuleFileSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? normalizeRuleFileSettings(JSON.parse(raw)) : defaultRuleFileSettings();
  } catch {
    return defaultRuleFileSettings();
  }
}

function save(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存できない環境では、その場の設定だけで使う
  }
}

function formEl(): HTMLFormElement {
  return $('rulefile-form');
}

function readForm(): void {
  const next: Record<string, unknown> = { ...settings };
  Array.from(formEl().elements).forEach((node) => {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || !node.name) return;
    if (node instanceof HTMLInputElement && node.type === 'checkbox') next[node.name] = node.checked;
    else if (node instanceof HTMLInputElement && node.type === 'radio') {
      if (node.checked) next[node.name] = node.value;
    } else next[node.name] = node.value;
  });
  settings = normalizeRuleFileSettings(next);
}

function writeForm(): void {
  const values = settings as unknown as Record<string, unknown>;
  Array.from(formEl().elements).forEach((node) => {
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) || !(node.name in values)) return;
    const v = values[node.name];
    if (node instanceof HTMLInputElement && node.type === 'checkbox') node.checked = v === true;
    else if (node instanceof HTMLInputElement && node.type === 'radio') node.checked = node.value === v;
    else node.value = typeof v === 'string' ? v : '';
  });
}

function render(): void {
  const info = TARGETS[settings.target];
  const text = buildRuleFile(settings);
  $('rulefile-preview').textContent = text;
  $('rulefile-preview-label').textContent = info.fileName ? `${info.fileName} の内容` : 'プロジェクトの指示に貼る内容';
  $('btn-rulefile-download').classList.toggle('hidden', !info.fileName);
  const steps = $('rulefile-steps');
  steps.replaceChildren();
  info.steps.forEach((s) => steps.appendChild(textEl('li', 'setup-steps__item', s)));
  $('rulefile-steps-title').textContent = `${info.label}での設定のしかた`;
}

function download(): void {
  const name = TARGETS[settings.target].fileName;
  if (!name) return;
  try {
    const blob = new Blob([`${buildRuleFile(settings)}\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`${name} を保存しました`);
  } catch {
    showToast('保存できませんでした。「コピー」から貼り付けてください');
  }
}

export function initRulesTab(): void {
  settings = load();
  writeForm();
  render();
  const update = () => {
    readForm();
    save();
    render();
  };
  formEl().addEventListener('input', update);
  formEl().addEventListener('change', update);
  formEl().addEventListener('submit', (e) => e.preventDefault());
  $('btn-rulefile-copy').addEventListener('click', async () => {
    const ok = await copyText(buildRuleFile(settings));
    showToast(ok ? 'ルール設定をコピーしました' : 'コピーできませんでした。プレビューを選択してコピーしてください');
  });
  $('btn-rulefile-download').addEventListener('click', download);
}
