/* Editor UI: state, schema-driven forms, live preview, file actions. */
(function () {
  const { SCHEMA, FONTS, PRESETS, render, sectionId, sectionLabel } = window.WB;
  const STORE_KEY = 'webbuilder:project:v1';
  const $ = (s) => document.querySelector(s);

  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  };

  /* ---------- state ---------- */
  let project = load() || WB.blankProject();
  let tab = 'sections';
  const openSet = new WeakSet(); // remembers which cards/items are expanded across redraws

  function load() {
    try { const p = JSON.parse(localStorage.getItem(STORE_KEY)); return valid(p) ? p : null; } catch { return null; }
  }
  function valid(p) {
    return p && p.site && p.theme && Array.isArray(p.sections) &&
      p.sections.every((s) => s && SCHEMA[s.type] && s.data && typeof s.id === 'string');
  }
  let saveT, previewT;
  function changed() {
    clearTimeout(saveT); clearTimeout(previewT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(project)); $('#status').textContent = 'Saved'; }
      catch { $('#status').textContent = 'Could not autosave (images too large?)'; }
    }, 300);
    previewT = setTimeout(refreshPreview, 150);
    $('#status').textContent = 'Editing…';
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- preview ---------- */
  const frame = $('#preview');
  let scrollY = 0, pendingScrollId = null, frameReady = false;
  function refreshPreview() {
    frameReady = false;
    frame.srcdoc = render(project, { preview: true });
  }
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const m = e.data || {};
    if (typeof m.wbScrollY === 'number') scrollY = m.wbScrollY;
    if (m.wbReady) {
      frameReady = true;
      if (pendingScrollId) { frame.contentWindow.postMessage({ scrollToId: pendingScrollId }, '*'); pendingScrollId = null; }
      else frame.contentWindow.postMessage({ scrollY }, '*');
    }
  });
  function scrollPreviewTo(id) {
    if (frameReady) frame.contentWindow.postMessage({ scrollToId: id }, '*'); else pendingScrollId = id;
  }

  /* ---------- fields ---------- */
  function downscale(dataUrl, max = 1600) {
    return new Promise((resolve) => {
      if (dataUrl.startsWith('data:image/svg')) return resolve(dataUrl);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = () => resolve(dataUrl);
      im.src = dataUrl;
    });
  }

  function sectionOptions() {
    return [['', '(automatic)'], ...project.sections.filter((s) => s.type !== 'hero').map((s) => [s.id, sectionLabel(s)])];
  }

  function fieldEl(f, obj, notify) {
    if (f.type === 'list') return listEl(f, obj, notify);
    const val = obj[f.key] ?? '';
    let input;
    if (f.type === 'textarea') {
      input = h('textarea', { rows: f.rows || 3 }, val);
      input.addEventListener('input', () => { obj[f.key] = input.value; notify(); });
    } else if (f.type === 'select') {
      const opts = f.options === 'sections' ? sectionOptions() : f.options;
      input = h('select', {}, opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
      input.addEventListener('change', () => { obj[f.key] = input.value; notify(); });
    } else if (f.type === 'image') {
      const text = h('input', { type: 'text', placeholder: 'https://… or choose a file', value: val });
      const thumb = h('img', { alt: '' });
      const setThumb = () => { thumb.style.display = /^(https?:|data:image)/.test(obj[f.key] || '') ? '' : 'none'; if (thumb.style.display === '') thumb.src = obj[f.key]; };
      text.addEventListener('input', () => { obj[f.key] = text.value.trim(); setThumb(); notify(); });
      const pick = h('button', { type: 'button', onclick: async () => {
        const url = await window.desktop.pickImage();
        if (!url) return;
        obj[f.key] = await downscale(url); text.value = obj[f.key].startsWith('data:') ? '(embedded image)' : obj[f.key];
        setThumb(); notify();
      } }, 'Browse');
      if (val.startsWith('data:')) text.value = '(embedded image)';
      text.addEventListener('focus', () => { if (text.value === '(embedded image)') text.select(); });
      setThumb();
      input = h('div', { class: 'img-row' }, thumb, text, pick, h('button', { type: 'button', class: 'icon', title: 'Clear', onclick: () => { obj[f.key] = ''; text.value = ''; setThumb(); notify(); } }, '✕'));
    } else if (f.type === 'color') {
      input = h('input', { type: 'color', value: val });
      input.addEventListener('input', () => { obj[f.key] = input.value; notify(); });
    } else {
      input = h('input', { type: 'text', value: val });
      input.addEventListener('input', () => { obj[f.key] = input.value; notify(); });
    }
    return h(f.type === 'image' ? 'div' : 'label', { class: 'field' }, h('span', { class: 'lbl' }, f.label), input);
  }

  function fieldsEl(fields, obj, notify) {
    return h('div', {}, fields.map((f) => fieldEl(f, obj, notify)));
  }

  function bind(details, ref) {
    details.open = openSet.has(ref);
    details.addEventListener('toggle', () => { details.open ? openSet.add(ref) : openSet.delete(ref); });
  }

  function listEl(f, obj, notify) {
    const root = h('div', { class: 'field list' });
    const draw = () => {
      const arr = obj[f.key] || (obj[f.key] = []);
      root.replaceChildren(h('span', { class: 'lbl' }, f.label));
      arr.forEach((it, i) => {
        const title = h('span', { class: 't' });
        const setTitle = () => { title.textContent = it[f.itemLabel] || `${f.itemName} ${i + 1}`; };
        setTitle();
        const act = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); draw(); notify(); };
        const move = (d) => () => { const j = i + d; if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; };
        const d = h('details', { class: 'item' },
          h('summary', {}, title, h('span', { class: 'btns' },
            h('button', { class: 'icon', title: 'Move up', onclick: act(move(-1)) }, '↑'),
            h('button', { class: 'icon', title: 'Move down', onclick: act(move(1)) }, '↓'),
            h('button', { class: 'icon danger', title: 'Delete', onclick: act(() => arr.splice(i, 1)) }, '✕'))),
          h('div', { class: 'details-body' }, fieldsEl(f.itemFields, it, () => { setTitle(); notify(); })));
        bind(d, it);
        root.append(d);
      });
      root.append(h('button', { class: 'add', onclick: () => { const n = f.newItem(); arr.push(n); openSet.add(n); draw(); notify(); } }, `+ Add ${f.itemName.toLowerCase()}`));
    };
    draw();
    return root;
  }

  /* ---------- panels ---------- */
  function sectionsPanel() {
    const body = $('#panel-body');
    body.replaceChildren();
    project.sections.forEach((s, i) => {
      const sc = SCHEMA[s.type];
      const title = h('span', { class: 't' }, `${sc.icon} ${sectionLabel(s)}`);
      const act = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); changed(); sectionsPanel(); };
      const move = (d) => () => { const j = i + d; if (j >= 0 && j < project.sections.length) [project.sections[i], project.sections[j]] = [project.sections[j], project.sections[i]]; };
      const d = h('details', { class: 'sec' + (s.enabled ? '' : ' off') },
        h('summary', {}, title, h('span', { class: 'btns' },
          h('button', { class: 'icon', title: s.enabled ? 'Hide section' : 'Show section', onclick: act(() => { s.enabled = !s.enabled; }) }, s.enabled ? '👁' : '🚫'),
          h('button', { class: 'icon', title: 'Move up', onclick: act(move(-1)) }, '↑'),
          h('button', { class: 'icon', title: 'Move down', onclick: act(move(1)) }, '↓'),
          h('button', { class: 'icon danger', title: 'Delete section', onclick: act(() => { if (confirm(`Delete the ${sc.label} section?`)) project.sections.splice(i, 1); }) }, '✕'))),
        h('div', { class: 'details-body' },
          fieldsEl(sc.fields, s.data, () => { title.textContent = `${sc.icon} ${sectionLabel(s)}`; changed(); }),
          sc.nav === false ? null : fieldEl({ key: 'navLabel', type: 'text', label: 'Navigation label (optional)' }, s, () => { title.textContent = `${sc.icon} ${sectionLabel(s)}`; changed(); })));
      bind(d, s);
      d.addEventListener('toggle', () => { if (d.open) scrollPreviewTo(sectionId(s)); });
      body.append(d);
    });
    const sel = h('select', {}, h('option', { value: '' }, '+ Add section…'),
      Object.entries(SCHEMA).map(([k, v]) => h('option', { value: k }, `${v.icon} ${v.label}`)));
    sel.addEventListener('change', () => {
      if (!sel.value) return;
      const s = WB.newSection(sel.value); openSet.add(s); project.sections.push(s);
      changed(); sectionsPanel(); scrollPreviewTo(sectionId(s));
    });
    body.append(h('div', { class: 'field' }, sel));
  }

  function designPanel() {
    const t = project.theme; const n = changed;
    const body = $('#panel-body');
    const fontOpts = (k) => ({ key: k, type: 'select', options: FONTS.map((f) => [f, f]) });
    body.replaceChildren(
      h('h4', {}, 'Colours'),
      h('div', { class: 'cols' },
        fieldEl({ key: 'primary', type: 'color', label: 'Primary' }, t, n),
        fieldEl({ key: 'accent', type: 'color', label: 'Accent' }, t, n),
        fieldEl({ key: 'bg', type: 'color', label: 'Background' }, t, n),
        fieldEl({ key: 'text', type: 'color', label: 'Text' }, t, n)),
      h('h4', {}, 'Typography'),
      fieldEl({ ...fontOpts('headingFont'), label: 'Heading font' }, t, n),
      fieldEl({ ...fontOpts('bodyFont'), label: 'Body font' }, t, n),
      h('h4', {}, 'Shape'),
      (() => {
        const sel = fieldEl({ key: 'radius', type: 'select', label: 'Corners', options: [['0', 'Square'], ['4', 'Subtle'], ['12', 'Rounded'], ['16', 'Soft'], ['28', 'Pill-ish']] }, { radius: String(t.radius) }, () => {});
        sel.querySelector('select').addEventListener('change', (e) => { t.radius = +e.target.value; n(); });
        return sel;
      })());
  }

  function sitePanel() {
    const s = project.site; const n = changed;
    $('#panel-body').replaceChildren(
      fieldEl({ key: 'name', type: 'text', label: 'Restaurant name' }, s, n),
      fieldEl({ key: 'tagline', type: 'text', label: 'Tagline' }, s, n),
      fieldEl({ key: 'logo', type: 'text', label: 'Logo emoji / symbol' }, s, n),
      fieldEl({ key: 'description', type: 'textarea', label: 'SEO description', rows: 3 }, s, n),
      fieldEl({ key: 'footer', type: 'text', label: 'Footer text' }, s, n));
  }

  function showTab(name) {
    tab = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    ({ sections: sectionsPanel, design: designPanel, site: sitePanel })[name]();
  }

  /* ---------- actions ---------- */
  const slug = () => (project.site.name || 'restaurant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurant';

  async function saveFile(kind, name, content, msg) {
    const p = await window.desktop.saveFile(kind, name, content);
    if (p) toast(`${msg}: ${p}`);
  }

  $('#btn-export').onclick = () => saveFile('html', `${slug()}.html`, render(project), 'Exported');
  $('#btn-save').onclick = () => saveFile('project', `${slug()}.wbproj`, JSON.stringify(project, null, 2), 'Saved');
  $('#btn-browser').onclick = () => window.desktop.previewInBrowser(render(project));
  $('#btn-open').onclick = async () => {
    const r = await window.desktop.openProject();
    if (!r) return;
    try {
      const p = JSON.parse(r.content);
      if (!valid(p)) throw new Error('bad');
      project = p; showTab('sections'); refreshPreview(); changed(); toast('Project opened');
    } catch { toast('That file is not a valid WebBuilder project'); }
  };

  const dlg = $('#templates-dialog');
  $('#tpl-grid').append(...Object.values(PRESETS).map((p) => {
    const b = p.build();
    return h('button', { class: 'tpl', onclick: () => {
      project = p.build(); dlg.close(); showTab('sections'); refreshPreview(); changed(); toast(`Loaded ${p.name}`);
    } },
    h('div', { class: 'sw' }, [b.theme.primary, b.theme.accent, b.theme.bg, b.theme.text].map((c) => h('i', { style: `background:${c}` }))),
    h('div', { class: 'meta' }, h('b', {}, `${p.emoji} ${p.name}`), h('span', { class: 'muted' }, p.blurb)));
  }));
  $('#btn-templates').onclick = () => dlg.showModal();

  $('#tabs').onclick = (e) => { if (e.target.dataset.tab) showTab(e.target.dataset.tab); };
  $('#devices').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#devices button').forEach((x) => x.classList.toggle('on', x === b));
    frame.style.width = b.dataset.w;
  };

  showTab('sections');
  refreshPreview();
})();
