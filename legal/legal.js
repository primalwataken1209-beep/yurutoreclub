/* ═══════════════════════════════════════════════════════════════════════════
   ゆるトレ倶楽部 v50 — 公開リーガルページ共通スクリプト

   役割は2つだけです。
     1. 運営者名 / 問い合わせ先を「1か所」で管理する（下の YT_LEGAL_CONFIG）
     2. 日本語 / English の表示切替（アプリ本体と同じ yurutore_language を使う）

   ★ v51.1で YT_LEGAL_CONFIG の運営者名・問い合わせ先を正式な値に確定済み。
     変更が必要なときはここ1か所だけを書き換えてください。
     詳細は README_v51_1_legal_contact.md を参照。

   アプリ本体（index.html / app.js）は読み込みません。
   リーガルページは軽量・静的・ログイン不要のままにするためです。
   ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────
   ★★★ 運営者名・問い合わせ先の設定はここだけ ★★★
   OPERATOR_NAME_JA / _EN : サービス運営者の表記（日本語版 / 英語版）
   SUPPORT_EMAIL          : 実際に受信できる問い合わせ用メールアドレス
   【v51.1】法人設立前のため、法人名ではなく「運営事務局」表記を使用。
   ─────────────────────────────────────────────────────────────── */
var YT_LEGAL_CONFIG = {
  OPERATOR_NAME_JA: 'ゆるトレ倶楽部運営事務局',
  OPERATOR_NAME_EN: 'Yurutore Club Management Office',
  OPERATOR_NAME: 'ゆるトレ倶楽部運営事務局',   // 言語が判定できなかったときの保険
  SUPPORT_EMAIL: 'support.yurutoreclub@gmail.com',
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
    fillConfig(lang);   /* 【v51.1】運営者名は言語で変わるため、切替のたびに差し込み直す */
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

  /* 運営者名 / 問い合わせ先の差し込み。
     ページ側では <span data-legal="OPERATOR_NAME"></span> と書くだけでよい。
     【v51.1】KEY_JA / KEY_EN があれば表示言語に合わせて選ぶ（無ければ KEY をそのまま使う）。
     HTML側にも正式な値を静的に書いてあるため、JSが動かない環境でも文字は正しく出る。 */
  function fillConfig(lang) {
    var suffix = (lang === 'en') ? '_EN' : '_JA';
    var nodes = document.querySelectorAll('[data-legal]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-legal');
      var val = YT_LEGAL_CONFIG[key + suffix];
      if (val === undefined) val = YT_LEGAL_CONFIG[key];
      if (val === undefined) continue;
      if (key === 'SUPPORT_EMAIL' && nodes[i].tagName === 'A') {
        nodes[i].textContent = val;
        /* 未設定のプレースホルダーが残っていたときだけ mailto: を作らない（誤送信の防止） */
        if (String(val).indexOf('[') !== 0) nodes[i].setAttribute('href', 'mailto:' + val);
        else nodes[i].removeAttribute('href');
      } else {
        nodes[i].textContent = val;
      }
    }
  }

  function init() {
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
