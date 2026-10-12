/* Turns a project state into a complete, standalone HTML document string. */
(function (global) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => {
    u = String(u || '').trim();
    return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,)/i.test(u) ? u : '';
  };
  const safeLink = (u) => {
    u = String(u || '').trim();
    return /^(https?:\/\/|mailto:|tel:|#)/i.test(u) ? u : '';
  };
  const color = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(c) ? c : fallback);
  const font = (f) => (global.WB.FONTS.includes(f) ? f : 'Inter');
  const paras = (t) => String(t || '').split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const lines = (t) => esc(t).replace(/\n/g, '<br>');

  function onColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.45 ? '#111111' : '#ffffff';
  }

  const img = (url, alt, cls) => {
    const u = safeUrl(url);
    return u ? `<img class="${cls}" src="${esc(u)}" alt="${esc(alt)}" loading="lazy">` : '';
  };

  const sid = (s) => `s-${s.id}`;
  const label = (s) => s.navLabel || s.data.title || global.WB.SCHEMA[s.type].label;

  const renderers = {
    hero(s, ctx) {
      const d = s.data;
      const target = ctx.sections.find((x) => x.id === d.ctaTarget) ||
        ctx.sections.find((x) => x.type === 'menu') || ctx.sections.find((x) => x.type === 'reservations');
      return `<header class="hero hero--${d.layout === 'left' ? 'left' : 'center'}" id="${sid(s)}">
  ${img(d.image, '', 'hero-bg') || '<div class="hero-bg hero-bg--grad"></div>'}
  <div class="hero-shade"></div>
  <div class="container hero-inner">
    <h1>${esc(d.heading)}</h1>
    ${d.subheading ? `<p class="lead">${lines(d.subheading)}</p>` : ''}
    ${d.ctaText && target ? `<a class="btn" href="#${sid(target)}">${esc(d.ctaText)}</a>` : ''}
  </div>
</header>`;
    },
    about(s) {
      const d = s.data; const im = img(d.image, d.title, 'about-img');
      return `<section class="section" id="${sid(s)}"><div class="container ${im ? 'split' : 'narrow'}">
  <div><h2>${esc(d.title)}</h2>${paras(d.text)}</div>${im}
</div></section>`;
    },
    menu(s) {
      const d = s.data;
      const cats = (d.categories || []).map((c) => `<div class="menu-cat"><h3>${esc(c.name)}</h3>
${(c.items || []).map((i) => `<div class="dish"><div class="dish-top"><span class="dish-name">${esc(i.name)}${i.tag ? `<em class="tag">${esc(i.tag)}</em>` : ''}</span><span class="dish-line"></span><span class="dish-price">${esc(i.price)}</span></div>${i.desc ? `<p class="dish-desc">${esc(i.desc)}</p>` : ''}</div>`).join('\n')}
</div>`).join('\n');
      return `<section class="section alt" id="${sid(s)}"><div class="container">
  <div class="section-head"><h2>${esc(d.title)}</h2>${d.intro ? `<p class="lead">${lines(d.intro)}</p>` : ''}</div>
  <div class="menu-grid">${cats}</div>
</div></section>`;
    },
    gallery(s) {
      const d = s.data;
      const items = (d.images || []).map((g) => {
        const im = img(g.url, g.caption, 'g-img');
        return `<figure class="g-item">${im || '<div class="g-ph">🍽️</div>'}${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}</figure>`;
      }).join('\n');
      return `<section class="section" id="${sid(s)}"><div class="container"><div class="section-head"><h2>${esc(d.title)}</h2></div><div class="gallery">${items}</div></div></section>`;
    },
    testimonials(s) {
      const d = s.data;
      return `<section class="section alt" id="${sid(s)}"><div class="container"><div class="section-head"><h2>${esc(d.title)}</h2></div>
<div class="quotes">${(d.items || []).map((q) => `<blockquote class="card"><p>“${esc(q.quote)}”</p><footer>— ${esc(q.author)}</footer></blockquote>`).join('')}</div></div></section>`;
    },
    hours(s) {
      const d = s.data;
      return `<section class="section" id="${sid(s)}"><div class="container narrow"><div class="section-head"><h2>${esc(d.title)}</h2></div>
<table class="hours">${(d.rows || []).map((r) => `<tr><th>${esc(r.day)}</th><td>${esc(r.time)}</td></tr>`).join('')}</table>
${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}</div></section>`;
    },
    reservations(s) {
      const d = s.data;
      return `<section class="section alt" id="${sid(s)}"><div class="container narrow">
  <div class="section-head"><h2>${esc(d.title)}</h2>${d.text ? `<p class="lead">${lines(d.text)}</p>` : ''}</div>
  <form class="resv card" data-success="${esc(d.success)}">
    <label>Name<input name="name" required></label>
    <label>Email<input name="email" type="email" required></label>
    <label>Phone<input name="phone" type="tel"></label>
    <label>Guests<input name="guests" type="number" min="1" max="30" value="2" required></label>
    <label>Date<input name="date" type="date" required></label>
    <label>Time<input name="time" type="time" required></label>
    <label class="full">Notes<textarea name="notes" rows="3"></textarea></label>
    <button class="btn full" type="submit">${esc(d.button)}</button>
    <p class="resv-ok full" hidden></p>
  </form>
</div></section>`;
    },
    contact(s) {
      const d = s.data;
      const rows = [
        d.address && `<div><h3>Address</h3><p>${lines(d.address)}</p></div>`,
        d.phone && `<div><h3>Phone</h3><p><a href="tel:${esc(d.phone.replace(/[^\d+]/g, ''))}">${esc(d.phone)}</a></p></div>`,
        d.email && `<div><h3>Email</h3><p><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></p></div>`,
      ].filter(Boolean).join('');
      const social = (d.social || []).filter((x) => safeLink(x.url) && safeLink(x.url) !== '#')
        .map((x) => `<a href="${esc(safeLink(x.url))}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join('');
      return `<section class="section" id="${sid(s)}"><div class="container"><div class="section-head"><h2>${esc(d.title)}</h2></div>
<div class="contact-grid">${rows}</div>${social ? `<div class="social">${social}</div>` : ''}</div></section>`;
    },
  };

  const CSS = `*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:64px}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body),system-ui,sans-serif;line-height:1.65;font-size:17px}
h1,h2,h3{font-family:var(--head),serif;line-height:1.15;margin:0 0 .5em}
a{color:var(--primary)}img{max-width:100%;display:block}
.container{max-width:1100px;margin:0 auto;padding:0 24px}.narrow{max-width:760px}
.nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.nav .container{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-family:var(--head),serif;font-size:1.35rem;text-decoration:none;color:var(--text);font-weight:700}
.nav ul{display:flex;gap:22px;list-style:none;margin:0;padding:0}.nav li a{text-decoration:none;color:var(--text);font-size:.95rem;opacity:.8}.nav li a:hover{opacity:1;color:var(--primary)}
.burger{display:none;background:none;border:1px solid var(--line);color:var(--text);border-radius:var(--r);padding:6px 10px;font-size:1.1rem;cursor:pointer}
.btn{display:inline-block;background:var(--primary);color:var(--on-primary);padding:.8em 1.6em;border:0;border-radius:var(--r);text-decoration:none;font:600 1rem var(--body),sans-serif;cursor:pointer}.btn:hover{filter:brightness(1.1)}
.hero{position:relative;min-height:78vh;display:flex;align-items:center;color:#fff;overflow:hidden}
.hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hero-bg--grad{background:linear-gradient(135deg,var(--primary),var(--accent))}
.hero-shade{position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.6))}
.hero-inner{position:relative;padding-top:60px;padding-bottom:60px}.hero--center .hero-inner{text-align:center}
.hero h1{font-size:clamp(2.4rem,6vw,4.4rem);max-width:16ch}.hero--center h1{margin-inline:auto}
.hero .lead{font-size:1.25rem;max-width:44ch;opacity:.95}.hero--center .lead{margin-inline:auto}.hero .btn{margin-top:1rem;background:var(--accent);color:var(--on-accent)}
.section{padding:84px 0}.alt{background:var(--surface)}
.section-head{text-align:center;margin-bottom:44px}.section-head h2,.section h2{font-size:clamp(1.9rem,4vw,2.7rem)}.section-head .lead{max-width:56ch;margin:0 auto;opacity:.8}
.split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}.about-img{border-radius:var(--r);width:100%;aspect-ratio:4/3;object-fit:cover}
.menu-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:48px 56px}
.menu-cat h3{font-size:1.5rem;color:var(--primary);border-bottom:2px solid var(--accent);padding-bottom:.3em;margin-bottom:1em}
.dish{margin-bottom:1.1em}.dish-top{display:flex;align-items:baseline;gap:8px}.dish-name{font-weight:600}.dish-line{flex:1;border-bottom:1px dotted color-mix(in srgb,var(--text) 40%,transparent);transform:translateY(-4px)}.dish-price{font-weight:700;color:var(--primary)}
.dish-desc{margin:.1em 0 0;opacity:.7;font-size:.93rem}.tag{font-style:normal;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;background:var(--accent);color:var(--on-accent);padding:2px 8px;border-radius:99px;margin-left:8px;vertical-align:middle}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.g-item{margin:0}.g-img,.g-ph{width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r)}.g-ph{display:grid;place-items:center;font-size:3rem;background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 30%,var(--bg)),color-mix(in srgb,var(--accent) 35%,var(--bg)))}
figcaption{font-size:.88rem;opacity:.7;margin-top:6px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--r);padding:28px}.alt .card{background:var(--bg)}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}blockquote{margin:0}blockquote p{font-size:1.1rem;font-style:italic;margin-top:0}blockquote footer{opacity:.7;font-size:.9rem}
.hours{width:100%;border-collapse:collapse}.hours th,.hours td{padding:14px 4px;border-bottom:1px solid var(--line);text-align:left}.hours td{text-align:right}.note{text-align:center;opacity:.7;margin-top:1.2em}
.resv{display:grid;grid-template-columns:1fr 1fr;gap:16px}.resv label{display:flex;flex-direction:column;gap:4px;font-size:.88rem;font-weight:600}.resv .full{grid-column:1/-1}
.resv input,.resv textarea{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:calc(var(--r)/2);background:var(--bg);color:var(--text)}
.resv-ok{background:color-mix(in srgb,var(--accent) 25%,var(--bg));padding:12px 16px;border-radius:calc(var(--r)/2);margin:0}
.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:32px;text-align:center}.contact-grid h3{font-size:1.1rem;color:var(--primary)}
.social{display:flex;justify-content:center;gap:20px;margin-top:32px}
footer.site{padding:32px 0;text-align:center;font-size:.9rem;opacity:.7;border-top:1px solid var(--line)}
@media(max-width:760px){.split{grid-template-columns:1fr}.resv{grid-template-columns:1fr}.section{padding:56px 0}
.burger{display:block}.nav ul{display:none;position:absolute;top:64px;left:0;right:0;flex-direction:column;gap:0;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 24px}.nav ul.open{display:flex}.nav li a{display:block;padding:12px 0}}`;

  const SCRIPT = `(function(){
var b=document.querySelector('.burger'),u=document.querySelector('.nav ul');
if(b)b.onclick=function(){u.classList.toggle('open')};
if(u)u.onclick=function(e){if(e.target.tagName==='A')u.classList.remove('open')};
document.querySelectorAll('.resv').forEach(function(f){f.onsubmit=function(e){e.preventDefault();var o=f.querySelector('.resv-ok');o.textContent=f.dataset.success;o.hidden=false;f.reset()}});
})();`;

  const PREVIEW_SCRIPT = `(function(){
window.addEventListener('message',function(e){var m=e.data||{};
if(m.scrollToId){var el=document.getElementById(m.scrollToId);if(el)el.scrollIntoView({behavior:'smooth'})}
if(typeof m.scrollY==='number')window.scrollTo(0,m.scrollY)});
var t;window.addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){parent.postMessage({wbScrollY:window.scrollY},'*')},80)});
parent.postMessage({wbReady:true},'*');
})();`;

  function render(project, opts = {}) {
    const { site, theme } = project;
    const sections = project.sections.filter((s) => s.enabled);
    const primary = color(theme.primary, '#7a2e2e'); const accent = color(theme.accent, '#c9a15a');
    const bg = color(theme.bg, '#ffffff'); const text = color(theme.text, '#111111');
    const hf = font(theme.headingFont); const bf = font(theme.bodyFont);
    const families = [...new Set([hf, bf])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700`).join('&');
    const vars = `:root{--primary:${primary};--accent:${accent};--bg:${bg};--text:${text};--on-primary:${onColor(primary)};--on-accent:${onColor(accent)};--head:'${hf}';--body:'${bf}';--r:${Math.min(40, Math.max(0, +theme.radius || 0))}px;--surface:color-mix(in srgb,var(--text) 5%,var(--bg));--line:color-mix(in srgb,var(--text) 14%,transparent)}`;
    const navItems = sections.filter((s) => global.WB.SCHEMA[s.type].nav !== false)
      .map((s) => `<li><a href="#${sid(s)}">${esc(label(s))}</a></li>`).join('');
    const ctx = { sections };
    const body = sections.map((s) => renderers[s.type](s, ctx)).join('\n');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(site.name)}</title><meta name="description" content="${esc(site.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">
<style>${vars}${CSS}</style></head><body>
<nav class="nav"><div class="container"><a class="brand" href="#">${esc(site.logo)} ${esc(site.name)}</a>
<button class="burger" aria-label="Menu">☰</button><ul>${navItems}</ul></div></nav>
${body}
<footer class="site"><div class="container">${esc(site.footer)}</div></footer>
<script>${SCRIPT}${opts.preview ? PREVIEW_SCRIPT : ''}</script></body></html>`;
  }

  global.WB.render = render;
  global.WB.sectionId = sid;
  global.WB.sectionLabel = label;
})(window);
