import { RULES_BASIC, RULES_FULL } from './rules';
import { RuleMode } from './types';

export type RuleTarget = 'claude' | 'claude-code' | 'copilot' | 'cursor' | 'chatgpt';

export interface RuleFileSettings {
  target: RuleTarget;
  ruleMode: RuleMode;
  scale: '2x' | '1x';
  askFirst: boolean;
  noInvent: boolean;
  adjustFlow: boolean;
  extra: string;
}

export const MAX_EXTRA = 2000;

interface TargetInfo {
  label: string;
  /** ファイルとして保存するときのファイル名（コピーして貼るだけの場合は null） */
  fileName: string | null;
  /** 設定のしかた（固定文言） */
  steps: string[];
}

export const TARGETS: Record<RuleTarget, TargetInfo> = {
  claude: {
    label: 'Claude（プロジェクト）',
    fileName: null,
    steps: [
      'claude.ai で「プロジェクト」を作成します（例：コーディング）',
      'プロジェクトの「指示を設定」を開き、下の内容を貼り付けて保存します',
      '以降はそのプロジェクトのチャットで、カンプ画像を添付して「コーディングして」と送るだけです',
    ],
  },
  'claude-code': {
    label: 'Claude Code',
    fileName: 'CLAUDE.md',
    steps: [
      '「ファイルを保存」で CLAUDE.md をダウンロードします',
      '案件フォルダ（package.json がある場所）の直下に置きます。すでに CLAUDE.md がある場合は、内容を末尾に追記します',
      '以降はそのフォルダで Claude Code を開き、カンプ画像を貼って「コーディングして」と送るだけです',
    ],
  },
  copilot: {
    label: 'GitHub Copilot',
    fileName: 'copilot-instructions.md',
    steps: [
      '「ファイルを保存」で copilot-instructions.md をダウンロードします',
      '案件フォルダの .github/ フォルダの中に置きます（.github/copilot-instructions.md）',
      'VS Code の Copilot Chat に画像を添付して「コーディングして」と送るだけです',
    ],
  },
  cursor: {
    label: 'Cursor',
    fileName: 'coding.mdc',
    steps: [
      '「ファイルを保存」で coding.mdc をダウンロードします',
      '案件フォルダの .cursor/rules/ フォルダの中に置きます（.cursor/rules/coding.mdc）',
      'Cursor のチャットに画像を添付して「コーディングして」と送るだけです',
    ],
  },
  chatgpt: {
    label: 'ChatGPT',
    fileName: null,
    steps: [
      'ChatGPT で「プロジェクト」を作成し、「指示」を開きます（カスタム GPT の「指示」でも使えます）',
      '下の内容を貼り付けて保存します',
      '以降はそのプロジェクトのチャットで、カンプ画像を添付して「コーディングして」と送るだけです',
    ],
  },
};

export function defaultRuleFileSettings(): RuleFileSettings {
  return {
    target: 'claude',
    ruleMode: 'basic',
    scale: '2x',
    askFirst: true,
    noInvent: true,
    adjustFlow: true,
    extra: '',
  };
}

export function normalizeRuleFileSettings(raw: unknown): RuleFileSettings {
  const d = defaultRuleFileSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb);
  return {
    target: typeof r.target === 'string' && r.target in TARGETS ? (r.target as RuleTarget) : d.target,
    ruleMode: r.ruleMode === 'full' ? 'full' : 'basic',
    scale: r.scale === '1x' ? '1x' : '2x',
    askFirst: bool(r.askFirst, d.askFirst),
    noInvent: bool(r.noInvent, d.noInvent),
    adjustFlow: bool(r.adjustFlow, d.adjustFlow),
    extra: typeof r.extra === 'string' ? r.extra.slice(0, MAX_EXTRA) : '',
  };
}

/** 「画像を貼って『コーディングして』」だけでルールが効くよう、AIに常に読ませておく指示文を作る */
export function buildRuleFile(s: RuleFileSettings): string {
  const lines: string[] = [];
  if (s.target === 'cursor') {
    lines.push('---', 'description: デザインカンプからコーディングするときのルール', 'alwaysApply: true', '---', '');
  }
  lines.push(
    '# コーディングのルール',
    '',
    'デザインカンプの画像が添付されて「コーディングして」と依頼されたら、毎回以下のルールで実装してください。',
    '',
    '## ルール',
    ...(s.ruleMode === 'basic' ? RULES_BASIC : RULES_FULL).map((r) => `- ${r}`),
    '',
    '## 画像の読み取り',
    s.scale === '2x'
      ? '- 画像は2倍（@2x）で書き出されている前提で、実寸px = 画像のpx ÷ 2 で読み取る（依頼文に「1倍」とある場合はそれに従う）'
      : '- 画像は1倍で書き出されている前提で、画像のpx = 実寸px として読み取る',
    '- PC版とSP版の画像がある場合は、両方に対応したレスポンシブで実装する',
  );
  if (s.noInvent) {
    lines.push('- 画像内のテキストはそのまま転記し、要約・言い換え・創作はしない。判読できない箇所は ＊＊＊＊＊＊＊＊＊＊＊ に置き換えて、最後にまとめて報告する');
  }
  lines.push('', '## 進め方');
  if (s.askFirst) {
    lines.push('- 画像と依頼文から読み取れない点（SP版の有無・ページ名・ブレークポイント等）があれば、コードを書く前にまとめて質問する。すべて揃っていれば質問せずに着手する');
  }
  lines.push('- 完成したら npm run build が warning なく通ることを確認する');
  if (s.adjustFlow) {
    lines.push('- スクリーンショットを添えて調整を頼まれたら、指定箇所以外のレイアウトを崩さないよう最小限の変更で直し、変更したファイルと箇所を報告する');
  }
  if (s.extra.trim()) lines.push('', '## 追加のルール', s.extra.trim());
  return lines.join('\n');
}
