/**
 * Live preview and canvas bridge. The site is rendered into a sandboxed iframe
 * (`srcdoc`) that cannot be accessed directly, so the two sides talk with
 * postMessage. The message list is documented in canvas-assets.js.
 *
 * Inline text edits are applied to the project here (through WB.content, so they
 * are validated) without re-rendering the iframe, which would drop the caret.
 */
(function (WB) {
  const REFRESH_DELAY_MS = 150;
  const SITE_TARGET = 'site';
  const EDITABLE_SITE_FIELDS = ['name', 'footer'];

  let frame;
  let handlers = {};
  let refreshTimer;
  let isReady = false;
  let lastScrollY = 0;
  let pendingSectionId = null;
  let selectedId = null;

  function post(message) {
    frame.contentWindow.postMessage(message, '*');
  }

  function refresh() {
    isReady = false;
    frame.srcdoc = WB.render(WB.store.project, { preview: true });
  }

  /** Apply one inline edit. `target` is "<sectionId>:<path>" or "site:<field>". */
  function applyEdit({ target, value }) {
    if (typeof target !== 'string' || typeof value !== 'string') return;
    const separator = target.indexOf(':');
    const id = target.slice(0, separator);
    const path = target.slice(separator + 1);
    const project = WB.store.project;

    if (id === SITE_TARGET) {
      if (!EDITABLE_SITE_FIELDS.includes(path)) return;
      project.site[path] = value.slice(0, 200);
    } else {
      const section = WB.store.findSection(id);
      if (!section || !WB.content.setPath(section, path, value)) return;
    }
    WB.store.touch({ canvas: true, skipPreview: true });
  }

  function onMessage(event) {
    if (event.source !== frame.contentWindow) return;
    const msg = event.data || {};

    if (typeof msg.wbScrollY === 'number') lastScrollY = msg.wbScrollY;
    if (msg.wbEdit) applyEdit(msg.wbEdit);

    if (typeof msg.wbSelect === 'string') {
      selectedId = msg.wbSelect;
      if (handlers.onSelect) handlers.onSelect(selectedId);
    }
    if (msg.wbAction && typeof msg.wbAction.type === 'string' && handlers.onAction) handlers.onAction(msg.wbAction);

    if (msg.wbReady) {
      isReady = true;
      post({ highlight: selectedId });
      if (pendingSectionId) {
        post({ scrollToId: pendingSectionId });
        pendingSectionId = null;
      } else {
        post({ scrollY: lastScrollY });
      }
    }
  }

  WB.preview = {
    /**
     * @param {HTMLIFrameElement} iframe
     * @param {{onSelect?: (id: string) => void, onAction?: (action: {type: string, id?: string}) => void}} callbacks
     */
    init(iframe, callbacks = {}) {
      frame = iframe;
      handlers = callbacks;
      window.addEventListener('message', onMessage);
      WB.store.subscribe((_project, meta) => {
        if (meta.skipPreview) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, REFRESH_DELAY_MS);
      });
      refresh();
    },

    /** Scroll the preview to a section, waiting for a re-render if one is in flight. */
    scrollToSection(sectionId) {
      if (isReady) post({ scrollToId: sectionId });
      else pendingSectionId = sectionId;
    },

    /** Mark a section as selected in the preview (and remember it across re-renders). */
    select(sectionId) {
      selectedId = sectionId;
      if (isReady) post({ highlight: sectionId });
    },

    setWidth(width) { frame.style.width = width; },
  };
})(window.WB);
