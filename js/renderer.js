/**
 * Turns a project into a complete, standalone HTML document string.
 *
 * Everything user-supplied goes through `esc` (text), `safeUrl` (images) or
 * `safeLink` (hrefs) so a project file can never inject markup or script.
 */
(function (WB) {
  const { CSS, SITE_SCRIPT, PREVIEW_SCRIPT } = WB.siteAssets;

  /* ---------------- Sanitising helpers ---------------- */

  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

  const IMAGE_URL = /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,)/i;
  const LINK_URL = /^(https?:\/\/|mailto:|tel:|#)/i;
  const safeUrl = (url) => (IMAGE_URL.test(String(url || '').trim()) ? String(url).trim() : '');
  const safeLink = (url) => (LINK_URL.test(String(url || '').trim()) ? String(url).trim() : '');

  /** Plain text -> HTML with line breaks. */
  const withBreaks = (text) => esc(text).replace(/\n/g, '<br>');

  /** Plain text -> <p> per blank-line-separated paragraph. */
  const paragraphs = (text) => String(text || '')
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => `<p>${withBreaks(p)}</p>`)
    .join('');

  /* ---------------- Theme helpers ---------------- */

  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const validColor = (value, fallback) => (HEX_COLOR.test(value) ? value : fallback);
  const validFont = (value) => (WB.FONTS.includes(value) ? value : 'Inter');
  const clampRadius = (value) => Math.min(40, Math.max(0, Number(value) || 0));

  /** Pick black or white text for readable contrast on a hex background. */
  function readableTextOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.45 ? '#111111' : '#ffffff';
  }

  /* ---------------- Section helpers ---------------- */

  const sectionId = (section) => `s-${section.id}`;
  const sectionLabel = (section) =>
    section.navLabel || section.data.title || WB.SCHEMA[section.type].label;

  /** <img> tag, or '' when the URL is missing or unsafe. */
  function imageTag(url, alt, className) {
    const safe = safeUrl(url);
    return safe ? `<img class="${className}" src="${esc(safe)}" alt="${esc(alt)}" loading="lazy">` : '';
  }

  /* ---------------- Section renderers ---------------- */
  // Each takes (section, context) and returns an HTML string.
  // context = { sections: enabled sections, in order }

  const sectionRenderers = {
    hero(section, { sections }) {
      const { data } = section;
      // The button goes to the chosen section, else the menu, else reservations.
      const target =
        sections.find((s) => s.id === data.ctaTarget) ||
        sections.find((s) => s.type === 'menu') ||
        sections.find((s) => s.type === 'reservations');
      const layout = data.layout === 'left' ? 'left' : 'center';
      const background = imageTag(data.image, '', 'hero-bg') || '<div class="hero-bg hero-bg--grad"></div>';

      return `
<header class="hero hero--${layout}" id="${sectionId(section)}">
  ${background}
  <div class="hero-shade"></div>
  <div class="container hero-inner">
    <h1>${esc(data.heading)}</h1>
    ${data.subheading ? `<p class="lead">${withBreaks(data.subheading)}</p>` : ''}
    ${data.ctaText && target ? `<a class="btn" href="#${sectionId(target)}">${esc(data.ctaText)}</a>` : ''}
  </div>
</header>`;
    },

    about(section) {
      const { data } = section;
      const image = imageTag(data.image, data.title, 'about-img');
      return `
<section class="section" id="${sectionId(section)}">
  <div class="container ${image ? 'split' : 'narrow'}">
    <div><h2>${esc(data.title)}</h2>${paragraphs(data.text)}</div>
    ${image}
  </div>
</section>`;
    },

    menu(section) {
      const { data } = section;

      const renderDish = (dish) => `
      <div class="dish">
        <div class="dish-top">
          <span class="dish-name">${esc(dish.name)}${dish.tag ? `<em class="tag">${esc(dish.tag)}</em>` : ''}</span>
          <span class="dish-line"></span>
          <span class="dish-price">${esc(dish.price)}</span>
        </div>
        ${dish.desc ? `<p class="dish-desc">${esc(dish.desc)}</p>` : ''}
      </div>`;

      const renderCategory = (category) => `
    <div class="menu-cat">
      <h3>${esc(category.name)}</h3>
      ${(category.items || []).map(renderDish).join('')}
    </div>`;

      return `
<section class="section alt" id="${sectionId(section)}">
  <div class="container">
    <div class="section-head">
      <h2>${esc(data.title)}</h2>
      ${data.intro ? `<p class="lead">${withBreaks(data.intro)}</p>` : ''}
    </div>
    <div class="menu-grid">${(data.categories || []).map(renderCategory).join('')}</div>
  </div>
</section>`;
    },

    gallery(section) {
      const { data } = section;
      const renderPhoto = (photo) => `
      <figure class="g-item">
        ${imageTag(photo.url, photo.caption, 'g-img') || '<div class="g-ph">🍽️</div>'}
        ${photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ''}
      </figure>`;

      return `
<section class="section" id="${sectionId(section)}">
  <div class="container">
    <div class="section-head"><h2>${esc(data.title)}</h2></div>
    <div class="gallery">${(data.images || []).map(renderPhoto).join('')}</div>
  </div>
</section>`;
    },

    testimonials(section) {
      const { data } = section;
      const renderQuote = (review) => `
      <blockquote class="card">
        <p>“${esc(review.quote)}”</p>
        <footer>— ${esc(review.author)}</footer>
      </blockquote>`;

      return `
<section class="section alt" id="${sectionId(section)}">
  <div class="container">
    <div class="section-head"><h2>${esc(data.title)}</h2></div>
    <div class="quotes">${(data.items || []).map(renderQuote).join('')}</div>
  </div>
</section>`;
    },

    hours(section) {
      const { data } = section;
      const rows = (data.rows || []).map((row) => `<tr><th>${esc(row.day)}</th><td>${esc(row.time)}</td></tr>`).join('');
      return `
<section class="section" id="${sectionId(section)}">
  <div class="container narrow">
    <div class="section-head"><h2>${esc(data.title)}</h2></div>
    <table class="hours">${rows}</table>
    ${data.note ? `<p class="note">${esc(data.note)}</p>` : ''}
  </div>
</section>`;
    },

    // Front-end only: the form shows a confirmation and sends nothing (see SITE_SCRIPT).
    reservations(section) {
      const { data } = section;
      return `
<section class="section alt" id="${sectionId(section)}">
  <div class="container narrow">
    <div class="section-head">
      <h2>${esc(data.title)}</h2>
      ${data.text ? `<p class="lead">${withBreaks(data.text)}</p>` : ''}
    </div>
    <form class="resv card" data-success="${esc(data.success)}">
      <label>Name<input name="name" required></label>
      <label>Email<input name="email" type="email" required></label>
      <label>Phone<input name="phone" type="tel"></label>
      <label>Guests<input name="guests" type="number" min="1" max="30" value="2" required></label>
      <label>Date<input name="date" type="date" required></label>
      <label>Time<input name="time" type="time" required></label>
      <label class="full">Notes<textarea name="notes" rows="3"></textarea></label>
      <button class="btn full" type="submit">${esc(data.button)}</button>
      <p class="resv-ok full" hidden></p>
    </form>
  </div>
</section>`;
    },

    contact(section) {
      const { data } = section;
      const phoneHref = esc(String(data.phone || '').replace(/[^\d+]/g, ''));

      const details = [
        data.address && `<div><h3>Address</h3><p>${withBreaks(data.address)}</p></div>`,
        data.phone && `<div><h3>Phone</h3><p><a href="tel:${phoneHref}">${esc(data.phone)}</a></p></div>`,
        data.email && `<div><h3>Email</h3><p><a href="mailto:${esc(data.email)}">${esc(data.email)}</a></p></div>`,
      ].filter(Boolean).join('');

      const socialLinks = (data.social || [])
        .filter((link) => safeLink(link.url) && safeLink(link.url) !== '#')
        .map((link) => `<a href="${esc(safeLink(link.url))}" target="_blank" rel="noopener">${esc(link.label)}</a>`)
        .join('');

      return `
<section class="section" id="${sectionId(section)}">
  <div class="container">
    <div class="section-head"><h2>${esc(data.title)}</h2></div>
    <div class="contact-grid">${details}</div>
    ${socialLinks ? `<div class="social">${socialLinks}</div>` : ''}
  </div>
</section>`;
    },
  };

  /* ---------------- Document ---------------- */

  /** CSS custom properties that carry the project's theme into the stylesheet. */
  function themeVariables(theme) {
    const primary = validColor(theme.primary, '#7a2e2e');
    const accent = validColor(theme.accent, '#c9a15a');
    return `:root {
  --primary: ${primary};
  --accent: ${accent};
  --bg: ${validColor(theme.bg, '#ffffff')};
  --text: ${validColor(theme.text, '#111111')};
  --on-primary: ${readableTextOn(primary)};
  --on-accent: ${readableTextOn(accent)};
  --head: '${validFont(theme.headingFont)}';
  --body: '${validFont(theme.bodyFont)}';
  --r: ${clampRadius(theme.radius)}px;
  --surface: color-mix(in srgb, var(--text) 5%, var(--bg));
  --line: color-mix(in srgb, var(--text) 14%, transparent);
}`;
  }

  function googleFontsUrl(theme) {
    const families = [...new Set([validFont(theme.headingFont), validFont(theme.bodyFont)])]
      .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;600;700`)
      .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }

  /**
   * @param {Object} project
   * @param {{preview?: boolean}} [options] `preview` adds the editor's scroll-sync script
   * @returns {string} full HTML document
   */
  function render(project, { preview = false } = {}) {
    const { site, theme } = project;
    const sections = project.sections.filter((s) => s.enabled);
    const context = { sections };

    const navLinks = sections
      .filter((s) => WB.SCHEMA[s.type].nav !== false)
      .map((s) => `<li><a href="#${sectionId(s)}">${esc(sectionLabel(s))}</a></li>`)
      .join('');
    const body = sections.map((s) => sectionRenderers[s.type](s, context)).join('\n');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(site.name)}</title>
<meta name="description" content="${esc(site.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${googleFontsUrl(theme)}" rel="stylesheet">
<style>
${themeVariables(theme)}
${CSS}
</style>
</head>
<body>
<nav class="nav">
  <div class="container">
    <a class="brand" href="#">${esc(site.logo)} ${esc(site.name)}</a>
    <button class="burger" aria-label="Menu">☰</button>
    <ul>${navLinks}</ul>
  </div>
</nav>
${body}
<footer class="site"><div class="container">${esc(site.footer)}</div></footer>
<script>${SITE_SCRIPT}${preview ? PREVIEW_SCRIPT : ''}</script>
</body>
</html>`;
  }

  WB.render = render;
  WB.sectionId = sectionId;
  WB.sectionLabel = sectionLabel;
})(window.WB);
