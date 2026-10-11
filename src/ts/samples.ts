import { SnippetData } from './types';

/** 「サンプルを入れてみる」で登録する定番スニペット */
export const SAMPLE_SNIPPETS: SnippetData[] = [
  {
    title: 'ヘッダー（BEM・ハンバーガー付き）',
    lang: 'html',
    memo: 'header__inner でラップ。メニューの開閉は aria-expanded で管理',
    code: `<header class="header">
  <div class="header__inner">
    <a class="header__logo" href="/">
      <img src="img/logo.png" srcset="img/logo.png 1x, img/logo@2x.png 2x" width="160" height="40" alt="サイト名">
    </a>
    <button class="header__btn" type="button" aria-expanded="false" aria-controls="global-nav" aria-label="メニューを開く">
      <span class="header__btn-line"></span>
    </button>
    <nav class="header__nav" id="global-nav">
      <ul class="header__list">
        <li class="header__item"><a class="header__item-link" href="#about">私たちについて</a></li>
        <li class="header__item"><a class="header__item-link" href="#service">サービス</a></li>
        <li class="header__item"><a class="header__item-link" href="#contact">お問い合わせ</a></li>
      </ul>
    </nav>
  </div>
</header>`,
  },
  {
    title: 'メディアクエリ mixin（mq）',
    lang: 'scss',
    memo: '_variables.scss に置く。@include mq(md) { ... } で使う',
    code: `$breakpoints: (
  sm: 480px,
  md: 768px,
  lg: 1024px,
);

@mixin mq($key) {
  @media (min-width: map-get($breakpoints, $key)) {
    @content;
  }
}

// hover はマウス環境だけに効かせる
@mixin hover {
  @media (hover: hover) {
    &:hover {
      @content;
    }
  }
}`,
  },
  {
    title: 'ハンバーガーメニューの開閉',
    lang: 'ts',
    memo: 'main.ts から initHamburger() を呼ぶ。Esc キーでも閉じる',
    code: `export function initHamburger(): void {
  const btn: HTMLButtonElement | null = document.querySelector('.header__btn');
  const nav: HTMLElement | null = document.querySelector('.header__nav');
  if (!btn || !nav) return;

  // 開閉状態を aria-expanded と class の両方に反映する
  const setOpen = (open: boolean): void => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('is-fixed', open);
  };

  btn.addEventListener('click', () => {
    setOpen(btn.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  });
}`,
  },
  {
    title: '画像（1x / 2x・PC / SP 切り替え）',
    lang: 'html',
    memo: 'キービジュアル以外は loading="lazy" を付ける',
    code: `<picture class="mv__img">
  <source media="(min-width: 768px)" srcset="img/mv_pc.jpg 1x, img/mv_pc@2x.jpg 2x" width="1440" height="720">
  <img src="img/mv_sp.jpg" srcset="img/mv_sp.jpg 1x, img/mv_sp@2x.jpg 2x" width="375" height="500" alt="">
</picture>`,
  },
  {
    title: 'スクロールでふわっと表示',
    lang: 'ts',
    memo: '.js-fade に is-show を付ける。CSS 側で opacity / transform を指定',
    code: `export function initFadeIn(): void {
  const targets: NodeListOf<HTMLElement> = document.querySelectorAll('.js-fade');
  if (!targets.length) return;

  // 動きを減らす設定の人には最初から表示する
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((el: HTMLElement) => el.classList.add('is-show'));
    return;
  }

  const observer: IntersectionObserver = new IntersectionObserver((entries: IntersectionObserverEntry[]) => {
    entries.forEach((entry: IntersectionObserverEntry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-show');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });

  targets.forEach((el: HTMLElement) => observer.observe(el));
}`,
  },
];
