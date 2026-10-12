/**
 * Editor-only CSS and script injected into the preview iframe (never into exports).
 * They turn the rendered site into a Wix-style canvas:
 *
 *   - text marked with data-wb is editable in place
 *   - hovering a section shows a toolbar (move, hide, AI, delete)
 *   - clicking a section selects it
 *
 * The iframe is sandboxed, so everything is reported to the editor with
 * postMessage (handled in preview.js):
 *
 *   iframe -> editor   { wbReady }                       page finished loading
 *   iframe -> editor   { wbScrollY }                     user scrolled
 *   iframe -> editor   { wbEdit: { target, value } }     text edited inline
 *   iframe -> editor   { wbSelect: sectionId }           section clicked
 *   iframe -> editor   { wbAction: { type, id? } }       toolbar button / add bar
 *   editor -> iframe   { scrollToId } | { scrollY } | { highlight: sectionId }
 */
(function (WB) {
  const CSS = `
/* ---- Editor canvas ---- */
[data-wb-section] { position: relative; }
[data-wb-section].wb-hover { outline: 2px solid rgba(255, 138, 61, 0.55); outline-offset: -2px; }
[data-wb-section].wb-selected { outline: 2px solid #ff8a3d; outline-offset: -2px; }
[data-wb] { white-space: pre-wrap; cursor: text; border-radius: 3px; }
[data-wb]:hover { outline: 1px dashed rgba(255, 138, 61, 0.9); outline-offset: 2px; }
[data-wb]:focus { outline: 2px solid #ff8a3d; outline-offset: 2px; }
#wb-toolbar {
  position: fixed; right: 14px; z-index: 1000; display: none; gap: 2px;
  background: #1b1e24; border: 1px solid #3a3f4b; border-radius: 8px; padding: 3px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35); font: 14px system-ui, sans-serif;
}
#wb-toolbar button {
  all: unset; cursor: pointer; padding: 5px 9px; border-radius: 5px; color: #e8eaed; font-size: 14px;
}
#wb-toolbar button:hover { background: #2f3440; }
#wb-toolbar .label { color: #9aa0ab; font-size: 12px; padding: 5px 8px 5px 6px; align-self: center; }
#wb-add {
  margin: 28px auto; max-width: 1052px; padding: 18px; text-align: center; cursor: pointer;
  border: 2px dashed rgba(255, 138, 61, 0.6); border-radius: 12px; color: #ff8a3d; font: 600 15px system-ui, sans-serif;
}
#wb-add:hover { background: rgba(255, 138, 61, 0.08); }`;

  const SCRIPT = `
(function () {
  var post = function (message) { parent.postMessage(message, '*'); };
  var TOOLBAR_MIN_TOP = 72; // keeps the toolbar clear of the sticky nav
  var hoveredSection = null;

  /* ---------- Inline text editing ---------- */
  var EDIT_DEBOUNCE_MS = 250;

  function readValue(el) {
    return el.innerText.replace(/\\n+$/, ''); // contenteditable adds a trailing newline
  }

  document.querySelectorAll('[data-wb]').forEach(function (el) {
    var timer;
    var send = function () { post({ wbEdit: { target: el.dataset.wb, value: readValue(el) } }); };

    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'false');
    el.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(send, EDIT_DEBOUNCE_MS); });
    el.addEventListener('blur', function () { clearTimeout(timer); send(); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey && !el.hasAttribute('data-multi'))) {
        e.preventDefault();
        el.blur();
      }
    });
  });

  // Links must not navigate while editing; in-page nav links still scroll.
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a');
    if (!link) return;
    var inEditable = e.target.closest('[data-wb]');
    var isHash = (link.getAttribute('href') || '').charAt(0) === '#';
    if (inEditable || !isHash) e.preventDefault();
  });

  /* ---------- Section toolbar ---------- */
  var toolbar = document.createElement('div');
  toolbar.id = 'wb-toolbar';
  toolbar.innerHTML =
    '<span class="label"></span>' +
    '<button data-a="ai" title="Edit with AI">✨ AI</button>' +
    '<button data-a="up" title="Move up">↑</button>' +
    '<button data-a="down" title="Move down">↓</button>' +
    '<button data-a="toggle" title="Hide section">👁</button>' +
    '<button data-a="delete" title="Delete section">🗑</button>';
  document.body.appendChild(toolbar);

  function sectionOf(node) { return node.closest && node.closest('[data-wb-section]'); }

  function showToolbar(section) {
    if (hoveredSection) hoveredSection.classList.remove('wb-hover');
    hoveredSection = section;
    section.classList.add('wb-hover');
    placeToolbar();
  }

  function placeToolbar() {
    if (!hoveredSection) return;
    var rect = hoveredSection.getBoundingClientRect();
    if (rect.bottom < TOOLBAR_MIN_TOP || rect.top > window.innerHeight) { toolbar.style.display = 'none'; return; }
    toolbar.style.display = 'flex';
    toolbar.style.top = Math.min(Math.max(rect.top + 8, TOOLBAR_MIN_TOP), rect.bottom - 44) + 'px';
    toolbar.querySelector('.label').textContent = hoveredSection.dataset.wbSection ? sectionTitle(hoveredSection) : '';
  }

  function sectionTitle(section) {
    var heading = section.querySelector('h1, h2');
    return heading ? heading.textContent.slice(0, 24) : 'Section';
  }

  document.addEventListener('mouseover', function (e) {
    if (toolbar.contains(e.target)) return;
    var section = sectionOf(e.target);
    if (section && section !== hoveredSection) showToolbar(section);
  });
  document.documentElement.addEventListener('mouseleave', function () {
    if (hoveredSection) hoveredSection.classList.remove('wb-hover');
    hoveredSection = null;
    toolbar.style.display = 'none';
  });

  toolbar.addEventListener('click', function (e) {
    var button = e.target.closest('button');
    if (button && hoveredSection) post({ wbAction: { type: button.dataset.a, id: hoveredSection.dataset.wbSection } });
  });

  /* ---------- Selection ---------- */
  function highlight(id) {
    document.querySelectorAll('.wb-selected').forEach(function (el) { el.classList.remove('wb-selected'); });
    var section = id && document.querySelector('[data-wb-section="' + id + '"]');
    if (section) section.classList.add('wb-selected');
  }

  document.addEventListener('mousedown', function (e) {
    if (toolbar.contains(e.target)) return;
    var section = sectionOf(e.target);
    if (!section) return;
    highlight(section.dataset.wbSection);
    post({ wbSelect: section.dataset.wbSection });
  });

  /* ---------- Add-section bar ---------- */
  var addBar = document.createElement('div');
  addBar.id = 'wb-add';
  addBar.textContent = '+ Add section';
  addBar.onclick = function () { post({ wbAction: { type: 'add' } }); };
  var footer = document.querySelector('footer.site');
  footer.parentNode.insertBefore(addBar, footer);

  /* ---------- Messages from the editor ---------- */
  window.addEventListener('message', function (e) {
    var msg = e.data || {};
    if (msg.scrollToId) {
      var el = document.getElementById(msg.scrollToId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
    if (typeof msg.scrollY === 'number') window.scrollTo(0, msg.scrollY);
    if ('highlight' in msg) highlight(msg.highlight);
  });

  var scrollTimer;
  window.addEventListener('scroll', function () {
    placeToolbar();
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { post({ wbScrollY: window.scrollY }); }, 80);
  });

  post({ wbReady: true });
})();`;

  WB.canvasAssets = { CSS, SCRIPT };
})(window.WB);
