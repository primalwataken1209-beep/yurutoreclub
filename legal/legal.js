/* ═══════════════════════════════════════════════════════════════════════════
   ゆるトレ倶楽部 v50 — 公開リーガルページ共通スクリプト

   役割は2つだけです。
     1. 運営者名 / 問い合わせ先を「1か所」で管理する（下の YT_LEGAL_CONFIG）
     2. 日本語 / English の表示切替（アプリ本体と同じ yurutore_language を使う）

   ★ 公開前に必ず YT_LEGAL_CONFIG の2つの値を差し替えてください。
     詳細は README_v50_legal_safety.md を参照。

   アプリ本体（index.html / app.js）は読み込みません。
   リーガルページは軽量・静的・ログイン不要のままにするためです。
   ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────
   ★★★ 公開前に必ず書き換える設定はここだけ ★★★
   OPERATOR_NAME : サービス運営者の正式名称（法人名または個人名）
   SUPPORT_EMAIL : 実際に受信できる問い合わせ用メールアドレス
   ─────────────────────────────────────────────────────────────── */
var YT_LEGAL_CONFIG = {
  OPERATOR_NAME: '[OPERATOR_NAME]',
  SUPPORT_EMAIL: '[SUPPORT_EMAIL]',
  EFFECTIVE_DATE_JA: '2026年9月8日',
  EFFECTIVE_DATE_EN: 'September 8, 2026'
};

(function () {
  var LANG_KEY = 'yurutore_language';   // アプリ本体と共通のキー（新規キーは増やさない）
  var LANGS = ['ja', 'en'];

  function detectLang() {
    try {
      var q = new URLSearchParams(location.search).get('lang');
      if (q && LANGS.indexOf(q) >= 0) return q;
    } catch (e) {}
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && LANGS.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    try {
      var nav = (navigator.languages && navigator.languages[0]) || navigator.language || '';
      if (/^ja/i.test(nav)) return 'ja';
    } catch (e) {}
    return 'en';
  }

  function applyLang(lang) {
    var root = document.documentElement;
    root.setAttribute('data-yt-lang', lang);
    root.setAttribute('lang', lang);
    try {
      var titleEl = document.querySelector('[data-title-' + lang + ']');
      if (titleEl) document.title = titleEl.getAttribute('data-title-' + lang);
      var pageTitle = document.body && document.body.getAttribute('data-title-' + lang);
      if (pageTitle) document.title = pageTitle;
    } catch (e) {}
    var btns = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute('data-set-lang') === lang) b.classList.add('on');
      else b.classList.remove('on');
    }
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0) return;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyLang(lang);
  }

  /* [SUPPORT_EMAIL] / [OPERATOR_NAME] の差し込み。
     ページ側では <span data-legal="SUPPORT_EMAIL"></span> と書くだけでよい。 */
  function fillConfig() {
    var nodes = document.querySelectorAll('[data-legal]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-legal');
      var val = YT_LEGAL_CONFIG[key];
      if (val === undefined) continue;
      if (key === 'SUPPORT_EMAIL' && nodes[i].tagName === 'A') {
        nodes[i].textContent = val;
        /* PLACEHOLDER のままのときは mailto: を作らない（誤送信の防止） */
        if (String(val).indexOf('[') !== 0) nodes[i].setAttribute('href', 'mailto:' + val);
        else nodes[i].removeAttribute('href');
      } else {
        nodes[i].textContent = val;
      }
    }
  }

  function init() {
    fillConfig();
    applyLang(detectLang());
    var btns = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang')); });
      })(btns[i]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
