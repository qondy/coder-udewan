/** 指示プロンプトでチェックして選べる、よく使う機能（動き）と実装時の注意点 */
export interface FeatureDef {
  id: string;
  label: string;
  spec: string;
}

export const FEATURES: FeatureDef[] = [
  {
    id: 'hamburger',
    label: 'ハンバーガーメニュー',
    spec: 'SP時にボタンでナビを開閉する。aria-expanded / aria-controls で状態を伝え、Esc キーとリンクのクリックで閉じ、開いている間は背面のスクロールを止める',
  },
  {
    id: 'infinite',
    label: 'インフィニティースクロール',
    spec: 'IntersectionObserver で一覧の末尾を監視し、到達したら次のアイテムを追加で読み込む。読み込み中の表示を出し、最後まで読んだら監視を止める',
  },
  {
    id: 'modal',
    label: 'モーダル',
    spec: 'dialog 要素（または role="dialog" と aria-modal）で実装する。閉じるボタン・背景クリック・Esc キーで閉じ、開いている間はフォーカスをモーダル内に留めて背面のスクロールを止める。閉じたら開いたボタンへフォーカスを戻す',
  },
  {
    id: 'accordion',
    label: 'アコーディオン',
    spec: '見出しのボタンで内容を開閉する。aria-expanded で状態を伝え、開閉は高さのアニメーションで滑らかにする（JS が無効でも内容が読めるようにする）',
  },
  {
    id: 'fadein',
    label: 'フェードイン',
    spec: 'IntersectionObserver で画面に入った要素に is-show を付けてふわっと表示する。prefers-reduced-motion が reduce の場合は最初から表示する',
  },
  {
    id: 'floating',
    label: 'フローティングバナー',
    spec: '一定量スクロールしたら画面下に固定のバナーを表示する。閉じるボタンを付け、閉じた状態は sessionStorage で覚える。フッター付近では重ならないよう隠す',
  },
  {
    id: 'carousel',
    label: 'カルーセル',
    spec: '前へ・次へボタン、ドット（現在位置）、スワイプに対応する。自動再生する場合は一時停止できるようにし、ホバー・フォーカス中は止める。ライブラリを使う場合は事前に相談する',
  },
  {
    id: 'pagination',
    label: 'ページネーション',
    spec: '一覧を一定件数ずつ表示し、前へ・次へと番号で切り替える。現在のページは aria-current="page" で示し、URL のクエリ（?page=）と連動させる',
  },
  {
    id: 'smooth',
    label: 'スムーススクロール',
    spec: 'ページ内リンクで目的の位置まで滑らかにスクロールする。固定ヘッダーの高さ分は scroll-margin-top でずらし、prefers-reduced-motion の場合はアニメーションしない',
  },
  {
    id: 'tabs',
    label: 'タブ機能',
    spec: 'role="tablist" / "tab" / "tabpanel" と aria-selected で実装し、矢印キーでもタブを移動できるようにする',
  },
  {
    id: 'storage',
    label: 'Webストレージ',
    spec: 'localStorage / sessionStorage で状態を保存・復元する。読み書きは try / catch で囲み、使えない環境（プライベートモード等）でも表示が崩れないようにする',
  },
  {
    id: 'device',
    label: 'デバイス判定',
    spec: 'matchMedia（画面幅・hover・pointer）で判定し、ユーザーエージェントでの判定は使わない。画面幅が変わったときも再判定する',
  },
  {
    id: 'filter',
    label: 'アイテム出し分けフィルター',
    spec: 'カテゴリーのボタンで一覧を絞り込む。アイテムは data 属性で分類し、選択中のボタンは aria-pressed で示す。該当がないときはその旨を表示する',
  },
  {
    id: 'contact',
    label: 'お問い合わせフォーム',
    spec: '必須・メール形式などの入力チェックとエラー表示、二重送信の防止、送信完了の表示を行う。各項目に label を付ける。送信先（PHP・Formspree 等）は着手前に確認する',
  },
];

export const FEATURE_IDS = FEATURES.map((f) => f.id);
