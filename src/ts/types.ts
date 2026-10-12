// ============================================================
// 指示プロンプト
// ============================================================
export type PromptKind = 'new' | 'adjust' | 'feature' | 'review';
export type RuleMode = 'basic' | 'full';
export type Device = 'both' | 'pc' | 'sp';

export interface AdjustItem {
  place: string;
  now: string;
  want: string;
}

export interface PromptForm {
  kind: PromptKind;
  ruleMode: RuleMode;
  project: string;
  page: string;
  // 新規コーディング
  hasPc: boolean;
  hasSp: boolean;
  scale: '2x' | '1x';
  pcWidth: string;
  spWidth: string;
  breakpoint: string;
  font: string;
  siteType: 'static' | 'wp';
  motion: string;
  // 調整依頼
  device: Device;
  adjustItems: AdjustItem[];
  // 機能追加
  featureName: string;
  featureTarget: string;
  featureDesc: string;
  // 納品前レビュー
  reviewTarget: 'src' | 'dist';
  // 共通
  note: string;
}

export interface Preset {
  id: string;
  name: string;
  form: PromptForm;
  createdAt: number;
}

// ============================================================
// スニペット
// ============================================================
export type SnippetLang = 'html' | 'scss' | 'ts' | 'js' | 'other';

export interface SnippetData {
  title: string;
  lang: SnippetLang;
  code: string;
  memo: string;
}

export interface Snippet extends SnippetData {
  id: string;
  copyCount: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// 納品前チェック
// ============================================================
export interface CheckItem {
  id: string;
  group: string;
  text: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** 納期（YYYY-MM-DD。未設定は ''） */
  due: string;
  items: CheckItem[];
  createdAt: number;
  updatedAt: number;
}

export type TabKey = 'prompt' | 'rules' | 'snippet' | 'check' | 'memo';

// ============================================================
// メモ
// ============================================================
export interface MemoData {
  title: string;
  body: string;
  /** カテゴリー（'' は未分類） */
  category: string;
  /** 紐付けた案件のID（'' は紐付けなし） */
  projectId: string;
  pinned: boolean;
}

export interface Memo extends MemoData {
  id: string;
  createdAt: number;
  updatedAt: number;
}
