/**
 * Static assets embedded into every generated site: the stylesheet and the
 * small scripts. Theme values arrive as CSS custom properties set by the
 * renderer (--primary, --accent, --bg, --text, --head, --body, --r, ...).
 */
(function (WB) {
  const CSS = `
/* ---- Base ---- */
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 64px; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.65 var(--body), system-ui, sans-serif;
}
h1, h2, h3 { font-family: var(--head), serif; line-height: 1.15; margin: 0 0 0.5em; }
a { color: var(--primary); }
img { max-width: 100%; display: block; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
.narrow { max-width: 760px; }

/* ---- Navigation ---- */
.nav {
  position: sticky; top: 0; z-index: 10;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.nav .container { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.brand { font: 700 1.35rem var(--head), serif; text-decoration: none; color: var(--text); }
.nav ul { display: flex; gap: 22px; list-style: none; margin: 0; padding: 0; }
.nav li a { text-decoration: none; color: var(--text); font-size: 0.95rem; opacity: 0.8; }
.nav li a:hover { opacity: 1; color: var(--primary); }
.burger {
  display: none;
  background: none; color: var(--text);
  border: 1px solid var(--line); border-radius: var(--r);
  padding: 6px 10px; font-size: 1.1rem; cursor: pointer;
}

/* ---- Buttons ---- */
.btn {
  display: inline-block;
  background: var(--primary); color: var(--on-primary);
  padding: 0.8em 1.6em; border: 0; border-radius: var(--r);
  font: 600 1rem var(--body), sans-serif; text-decoration: none; cursor: pointer;
}
.btn:hover { filter: brightness(1.1); }

/* ---- Hero ---- */
.hero { position: relative; min-height: 78vh; display: flex; align-items: center; color: #fff; overflow: hidden; }
.hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.hero-bg--grad { background: linear-gradient(135deg, var(--primary), var(--accent)); }
.hero-shade { position: absolute; inset: 0; background: linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.6)); }
.hero-inner { position: relative; padding-top: 60px; padding-bottom: 60px; }
.hero--center .hero-inner { text-align: center; }
.hero h1 { font-size: clamp(2.4rem, 6vw, 4.4rem); max-width: 16ch; }
.hero--center h1 { margin-inline: auto; }
.hero .lead { font-size: 1.25rem; max-width: 44ch; opacity: 0.95; }
.hero--center .lead { margin-inline: auto; }
.hero .btn { margin-top: 1rem; background: var(--accent); color: var(--on-accent); }

/* ---- Sections ---- */
.section { padding: 84px 0; }
.alt { background: var(--surface); }
.section-head { text-align: center; margin-bottom: 44px; }
.section h2 { font-size: clamp(1.9rem, 4vw, 2.7rem); }
.section-head .lead { max-width: 56ch; margin: 0 auto; opacity: 0.8; }

/* About */
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
.about-img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--r); }

/* Menu */
.menu-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 48px 56px; }
.menu-cat h3 {
  font-size: 1.5rem; color: var(--primary);
  border-bottom: 2px solid var(--accent);
  padding-bottom: 0.3em; margin-bottom: 1em;
}
.dish { margin-bottom: 1.1em; }
.dish-top { display: flex; align-items: baseline; gap: 8px; }
.dish-name { font-weight: 600; }
.dish-line {
  flex: 1;
  border-bottom: 1px dotted color-mix(in srgb, var(--text) 40%, transparent);
  transform: translateY(-4px);
}
.dish-price { font-weight: 700; color: var(--primary); }
.dish-desc { margin: 0.1em 0 0; opacity: 0.7; font-size: 0.93rem; }
.tag {
  margin-left: 8px; padding: 2px 8px; vertical-align: middle;
  background: var(--accent); color: var(--on-accent); border-radius: 99px;
  font-size: 0.68rem; font-style: normal; text-transform: uppercase; letter-spacing: 0.06em;
}

/* Gallery */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
.g-item { margin: 0; }
.g-img, .g-ph { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--r); }
.g-ph {
  display: grid; place-items: center; font-size: 3rem;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--primary) 30%, var(--bg)),
    color-mix(in srgb, var(--accent) 35%, var(--bg)));
}
figcaption { font-size: 0.88rem; opacity: 0.7; margin-top: 6px; }

/* Cards, reviews */
.card { background: var(--bg); border: 1px solid var(--line); border-radius: var(--r); padding: 28px; }
.quotes { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
blockquote { margin: 0; }
blockquote p { margin-top: 0; font-size: 1.1rem; font-style: italic; }
blockquote footer { opacity: 0.7; font-size: 0.9rem; }

/* Hours */
.hours { width: 100%; border-collapse: collapse; }
.hours th, .hours td { padding: 14px 4px; border-bottom: 1px solid var(--line); text-align: left; }
.hours td { text-align: right; }
.note { text-align: center; opacity: 0.7; margin-top: 1.2em; }

/* Reservations */
.resv { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.resv label { display: flex; flex-direction: column; gap: 4px; font-size: 0.88rem; font-weight: 600; }
.resv .full { grid-column: 1 / -1; }
.resv input, .resv textarea {
  font: inherit; padding: 10px 12px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--line); border-radius: calc(var(--r) / 2);
}
.resv-ok {
  margin: 0; padding: 12px 16px;
  background: color-mix(in srgb, var(--accent) 25%, var(--bg));
  border-radius: calc(var(--r) / 2);
}

/* Contact */
.contact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px; text-align: center; }
.contact-grid h3 { font-size: 1.1rem; color: var(--primary); }
.social { display: flex; justify-content: center; gap: 20px; margin-top: 32px; }

/* Footer */
footer.site { padding: 32px 0; text-align: center; font-size: 0.9rem; opacity: 0.7; border-top: 1px solid var(--line); }

/* ---- Mobile ---- */
@media (max-width: 760px) {
  .split, .resv { grid-template-columns: 1fr; }
  .section { padding: 56px 0; }
  .burger { display: block; }
  .nav ul {
    display: none; position: absolute; top: 64px; left: 0; right: 0;
    flex-direction: column; gap: 0; padding: 8px 24px;
    background: var(--bg); border-bottom: 1px solid var(--line);
  }
  .nav ul.open { display: flex; }
  .nav li a { display: block; padding: 12px 0; }
}`;

  /** Runs in every generated site: mobile menu + front-end-only reservation form. */
  const SITE_SCRIPT = `
(function () {
  var burger = document.querySelector('.burger');
  var menu = document.querySelector('.nav ul');
  if (burger) burger.onclick = function () { menu.classList.toggle('open'); };
  if (menu) menu.onclick = function (e) { if (e.target.tagName === 'A') menu.classList.remove('open'); };

  document.querySelectorAll('.resv').forEach(function (form) {
    form.onsubmit = function (e) {
      e.preventDefault();
      var message = form.querySelector('.resv-ok');
      message.textContent = form.dataset.success;
      message.hidden = false;
      form.reset();
    };
  });
})();`;

  /** Only added to the editor preview: lets the editor scroll and restore the page. See preview.js. */
  const PREVIEW_SCRIPT = `
(function () {
  window.addEventListener('message', function (e) {
    var msg = e.data || {};
    if (msg.scrollToId) {
      var el = document.getElementById(msg.scrollToId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
    if (typeof msg.scrollY === 'number') window.scrollTo(0, msg.scrollY);
  });

  var timer;
  window.addEventListener('scroll', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { parent.postMessage({ wbScrollY: window.scrollY }, '*'); }, 80);
  });
  parent.postMessage({ wbReady: true }, '*');
})();`;

  WB.siteAssets = { CSS, SITE_SCRIPT, PREVIEW_SCRIPT };
})(window.WB);
