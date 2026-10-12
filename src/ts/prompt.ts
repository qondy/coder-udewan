import { AdjustItem, PromptForm, PromptKind } from './types';
import { DELIVERY_CHECKLIST, RULES_BASIC, RULES_FULL } from './rules';

export const MAX_SHORT = 80;
export const MAX_LONG = 2000;
export const MAX_ADJUST_ITEMS = 10;

export const KIND_LABELS: Record<PromptKind, string> = {
  new: '新規コーディング',
  adjust: 'スクショで調整依頼',
  feature: '機能（動き）の追加',
  review: '納品前レビュー',
};

export function emptyAdjustItem(): AdjustItem {
  return { place: '', now: '', want: '' };
}

export function defaultForm(): PromptForm {
  return {
    kind: 'new',
    ruleMode: 'basic',
    project: '',
    page: '',
    hasPc: true,
    hasSp: true,
    scale: '2x',
    pcWidth: '1440',
    spWidth: '375',
    breakpoint: '768',
    font: '',
    siteType: 'static',
    motion: '',
    device: 'both',
    adjustItems: [emptyAdjustItem()],
    featureName: '',
    featureTarget: '',
    featureDesc: '',
    reviewTarget: 'src',
    note: '',
  };
}

const str = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.slice(0, max) : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback);

/** Firestore・localStorage から読み込んだ値を、安全な PromptForm に正規化する */
export function normalizeForm(raw: unknown): PromptForm {
  const d = defaultForm();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.adjustItems)
    ? r.adjustItems.slice(0, MAX_ADJUST_ITEMS).map((it) => {
      const o = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      return { place: str(o.place, MAX_SHORT), now: str(o.now, MAX_LONG), want: str(o.want, MAX_LONG) };
    })
    : [];
  return {
    kind: oneOf(r.kind, ['new', 'adjust', 'feature', 'review'] as const, d.kind),
    ruleMode: oneOf(r.ruleMode, ['basic', 'full'] as const, d.ruleMode),
    project: str(r.project, MAX_SHORT),
    page: str(r.page, MAX_SHORT),
    hasPc: typeof r.hasPc === 'boolean' ? r.hasPc : d.hasPc,
    hasSp: typeof r.hasSp === 'boolean' ? r.hasSp : d.hasSp,
    scale: oneOf(r.scale, ['2x', '1x'] as const, d.scale),
    pcWidth: str(r.pcWidth, 6, d.pcWidth),
    spWidth: str(r.spWidth, 6, d.spWidth),
    breakpoint: str(r.breakpoint, 6, d.breakpoint),
    font: str(r.font, MAX_SHORT),
    siteType: oneOf(r.siteType, ['static', 'wp'] as const, d.siteType),
    motion: str(r.motion, MAX_LONG),
    device: oneOf(r.device, ['both', 'pc', 'sp'] as const, d.device),
    adjustItems: items.length ? items : [emptyAdjustItem()],
    featureName: str(r.featureName, MAX_SHORT),
    featureTarget: str(r.featureTarget, MAX_SHORT),
    featureDesc: str(r.featureDesc, MAX_LONG),
    reviewTarget: oneOf(r.reviewTarget, ['src', 'dist'] as const, d.reviewTarget),
    note: str(r.note, MAX_LONG),
  };
}

/** 「トップページ」のような入力から page-〇〇 用のクラス名を作る（英数字以外なら空） */
export function pageSlug(page: string): string {
  const s = page.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
  return s.replace(/^-+|-+$/g, '');
}

const or = (v: string, fallback: string): string => (v.trim() ? v.trim() : fallback);
const DEVICE_LABELS = { both: 'PC・SPの両方', pc: 'PCのみ', sp: 'SPのみ' } as const;

function pageLine(f: PromptForm): string {
  const name = f.page.trim();
  if (!name) return '- ページ：（未記入）';
  const slug = pageSlug(name);
  return `- ページ：${name}${slug ? `（body に class="page-${slug}"）` : ''}`;
}

function rulesBlock(f: PromptForm): string[] {
  if (f.ruleMode === 'basic') return ['## ルール', ...RULES_BASIC.map((r) => `- ${r}`)];
  return ['## コーディングルール', ...RULES_FULL.map((r) => `- ${r}`)];
}

/** 複数行の自由入力を、箇条書きの下に読みやすく差し込む */
function indent(text: string, prefix = '   '): string {
  return text.trim().split(/\r?\n/).map((l) => `${prefix}${l}`).join('\n');
}

/** 1行ならラベルの後ろに続け、複数行ならラベルの下に字下げして入れる */
function labeled(label: string, text: string, prefix: string): string {
  const t = text.trim();
  return t.includes('\n') ? `${label}\n${indent(t, prefix)}` : `${label}${t}`;
}

function buildNew(f: PromptForm): string[] {
  const images = [f.hasPc ? 'PC版' : '', f.hasSp ? 'SP版' : ''].filter(Boolean).join('・') || '（未選択）';
  const lines = [
    '添付のデザインカンプをもとに、コーディングしてください。',
    '',
    '## 案件情報',
    `- 案件名：${or(f.project, '（未記入）')}`,
    pageLine(f),
    `- 添付画像：${images}`,
    f.scale === '2x'
      ? '- 画像の倍率：2倍（@2x）で書き出し。実寸px = 画像のpx ÷ 2 で読み取る'
      : '- 画像の倍率：1倍で書き出し（画像のpx = 実寸px）',
    `- デザイン幅：PC ${or(f.pcWidth, '—')}px / SP ${or(f.spWidth, '—')}px`,
    `- ブレークポイント：${or(f.breakpoint, '—')}px`,
  ];
  if (f.font.trim()) lines.push(`- フォント：${f.font.trim()}`);
  lines.push(f.siteType === 'static'
    ? '- サイト形態：静的HTML一式（dist/ をFTPでアップロード）'
    : '- サイト形態：のちに WordPress テーマ化する予定（テンプレート化しやすい構造にする）');
  if (f.motion.trim()) lines.push('', '## 動き・インタラクション', f.motion.trim());
  lines.push(
    '',
    ...rulesBlock(f),
    '',
    '## 進め方',
    '- 依頼文と画像から読み取れない点があれば、コードを書く前にまとめて質問してください',
    '- 画像内のテキストはそのまま転記し、要約・創作はしないでください。判読できない箇所は ＊＊＊＊＊＊＊＊＊＊＊ に置き換え、最後にまとめて報告してください',
    '- 完成したら npm run build が warning なく通ることを確認してください',
  );
  return lines;
}

function buildAdjust(f: PromptForm): string[] {
  const items = f.adjustItems.filter((it) => it.place.trim() || it.now.trim() || it.want.trim());
  const lines = [
    'コーディング済みのページについて、添付のスクリーンショットをもとに以下を調整してください。',
    '',
    '## 対象',
  ];
  if (f.project.trim()) lines.push(`- 案件名：${f.project.trim()}`);
  lines.push(pageLine(f), `- 対象画面：${DEVICE_LABELS[f.device]}`, '', '## 調整内容');
  if (!items.length) lines.push('（調整内容を入力してください）');
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${or(it.place, '（箇所）')}`);
    if (it.now.trim()) lines.push(labeled('   - 現状：', it.now, '     '));
    if (it.want.trim()) lines.push(labeled('   - 希望：', it.want, '     '));
  });
  lines.push(
    '',
    ...rulesBlock(f),
    '',
    '## 進め方',
    '- 指定した箇所以外のレイアウトが崩れないよう、変更は最小限にしてください',
    ...(f.device === 'both' ? [] : [`- ${f.device === 'pc' ? 'SP' : 'PC'}の表示に影響が出ていないかも確認してください`]),
    '- 変更したファイルと箇所を、最後に一覧で報告してください',
    '- 修正後に npm run build が通ることを確認してください',
  );
  return lines;
}

function buildFeature(f: PromptForm): string[] {
  const lines = ['ページに以下の機能（動き）を追加してください。', '', '## 対象'];
  if (f.project.trim()) lines.push(`- 案件名：${f.project.trim()}`);
  lines.push(pageLine(f));
  lines.push(
    '',
    '## 機能',
    `- 機能名：${or(f.featureName, '（未記入）')}`,
    `- 対象の要素：${or(f.featureTarget, '（未記入）')}`,
  );
  if (f.featureDesc.trim()) lines.push(labeled('- 動作：', f.featureDesc, '  '));
  lines.push(
    '',
    ...rulesBlock(f),
    '',
    '## 進め方',
    '- TypeScriptで実装し、機能ごとにファイル（モジュール）を分けてください',
    '- キーボード操作と aria 属性（aria-expanded など）に配慮してください',
    '- 動きは prefers-reduced-motion を考慮してください',
    '- 修正後に npm run build が通ることを確認してください',
  );
  return lines;
}

function buildReview(f: PromptForm): string[] {
  const target = f.reviewTarget === 'dist' ? 'ビルド後の dist/' : 'ソース（src/ と HTML）';
  const lines = [
    `納品前のチェックをお願いします。${target}を以下のチェックリストに沿って確認し、問題がある項目だけを「箇所・内容・修正案」の一覧にしてください。修正は一覧を見て私が指示するまで行わないでください。`,
    '',
    '## 対象',
  ];
  if (f.project.trim()) lines.push(`- 案件名：${f.project.trim()}`);
  lines.push(pageLine(f), '', '## チェックリスト');
  DELIVERY_CHECKLIST.forEach((g) => {
    lines.push(`### ${g.group}`, ...g.items.map((it) => `- ${it}`));
  });
  lines.push('', ...rulesBlock(f));
  return lines;
}

export function buildPrompt(f: PromptForm): string {
  const builders: Record<PromptKind, (form: PromptForm) => string[]> = {
    new: buildNew,
    adjust: buildAdjust,
    feature: buildFeature,
    review: buildReview,
  };
  const lines = builders[f.kind](f);
  if (f.note.trim()) lines.push('', '## 補足', f.note.trim());
  return lines.join('\n');
}
