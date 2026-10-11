// coding-template/CLAUDE.md（デザインカンプ→FTP納品タイプの案件ルール）をもとにした定型文

/** 指示文に「参照だけ」入れる場合のルール文 */
export const RULES_REF = [
  'coding-template/CLAUDE.md のコーディングルールに従ってください。',
  '（セマンティック+BEM / SCSS / TypeScript / npm run build で dist/ に出力し、FTPで納品）',
];

/** 指示文にルールを全文で入れる場合（CLAUDE.md がない環境や、他のAIに渡す場合） */
export const RULES_FULL = [
  'HTML：セマンティックなタグ（header / nav / main / section / article / footer 等）でアウトラインを組む',
  'クラス名はBEM（Block__Element--Modifier）。body 配下の各セクションを Block にする（例：.mv / .feature / .cv）',
  'Element名は役割で統一：見出し __title / ul・ol __list / 項目 __item（内部は __item-title / __item-text 等）/ まとまり __box / 内側ラッパー __inner / 本文 __text / 画像 __img / ボタン __btn',
  'body に class="page-ページ名" を付け、ページ固有の調整はこのクラスを起点に上書きする',
  'CSS：SCSSで作成し、_variables.scss / _base.scss / セクション単位のパーシャルに分割する。プロパティ順は「レイアウト→タイポグラフィ→色→装飾」',
  'hover はメディアクエリで制御し、hover に transition は付けない。クリッカブルな要素は cursor: pointer',
  'JS：TypeScriptで作成し esbuild でバンドルする。var・グローバル変数は使わず、モジュール単位で完結させ、変数には型を付ける',
  '画像：xxx.png と xxx@2x.png を用意し srcset で 1x, 2x を指定。キービジュアル以外の img は loading="lazy"、width / height / alt を必ず指定',
  'ビルド：npm run dev で監視ビルド、npm run build で dist/ に圧縮出力し、dist/ をそのままFTPで納品する',
  '納品後に別の人が手直しできるよう、過度な抽象化は避けて読みやすさを優先する',
];

export interface ChecklistGroup {
  group: string;
  items: string[];
}

/** コーディング開始前（ヒアリング）チェックリスト */
export const START_CHECKLIST: ChecklistGroup[] = [
  {
    group: '着手前：素材',
    items: [
      'デザイン画像（PC版・SP版）が揃っている',
      '画像の倍率（基本は2倍）を確認した',
      'ページ名（body の page-〇〇）を決めた',
      'ブレークポイントとミックスインの有無を確認した',
    ],
  },
  {
    group: '着手前：体制・仕様',
    items: [
      'やりとりする相手を確認した',
      'コーディングのレギュレーションの有無を確認した',
      '納品形態（公開作業まで／ファイル納品のみ）を確認した',
      '静的HTMLかCMSかを確認した',
      '参考になる過去のLPのURLを確認した',
      'HTTPS化・リダイレクトの有無を確認した',
      'サイトマップ・公開URL（トレイリングスラッシュの有無）を確認した',
      'GTM・GA・ヒートマップの設定をこちらで行うか確認した',
    ],
  },
];

/** 納品前チェックリスト */
export const DELIVERY_CHECKLIST: ChecklistGroup[] = [
  {
    group: '設定',
    items: [
      'README を追記した',
      'JS・CSS を圧縮した',
      'GTM を指定した',
      'OGP画像を指定した',
      'ファビコンを指定した',
      'canonical を指定した',
      '.gitignore に node_modules が入っている',
      '画像圧縮スクリプトの品質設定を確認した',
      '使っていないプラグインを削除した',
      'package.json が "private": true になっている',
      'package.json・README が他案件のコピペのままになっていない',
    ],
  },
  {
    group: '品質',
    items: [
      'hover をメディアクエリで制御している',
      'クリッカブルな要素が cursor: pointer になっている',
      '書き出し画像に不要な余白・劣化がない',
      'インデントに半角スペースとタブが混在していない',
      'hover に transition を設定していない',
      'フォントの指定を head から行っている',
    ],
  },
  {
    group: 'TypeScript',
    items: [
      'key: value（コロンの後に半角スペース）の記法になっている',
      '変数名が適切になっている',
      'var を使っていない',
      'すべての変数に型が付いている',
      '役割ごとにコメントを入れている',
    ],
  },
  {
    group: 'SEO',
    items: [
      'キービジュアル以外の img に loading="lazy" を指定した',
      'img に width / height を指定した',
      'img に alt を入れた',
    ],
  },
  {
    group: 'リンク',
    items: [
      'リンク先をすべて確認した',
      'tel: リンクに target="_blank" を付けていない',
    ],
  },
  {
    group: '表示',
    items: [
      'レスポンシブ表示に不具合がない',
      'フローティング要素の重ね順を確認した',
      'モーダルの z-index が最上位になっている',
      '画像の線・輪郭を調整した',
      '各ブラウザ（Edge / Firefox / Chrome / iOS Safari / Android Chrome）で表示を確認した',
    ],
  },
  {
    group: 'エラー',
    items: [
      'ビルド時に warning が出ていない',
      'HTMLのバリデーションチェックをした',
      'エディタ上で警告が出ていない',
      'console.log 等のデバッグ出力を消した',
    ],
  },
  {
    group: 'FTP納品',
    items: [
      'npm run build を実行し、dist/ を最新にした',
      'アップロード先のディレクトリを確認した',
      'dist/ の中身をアップロードした',
      '本番URLで表示・リンクを確認した',
    ],
  },
];
