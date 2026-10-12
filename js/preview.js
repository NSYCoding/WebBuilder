/**
 * Live preview. The site is rendered into a sandboxed iframe (`srcdoc`); the
 * iframe cannot be accessed directly, so we talk to it with postMessage:
 *
 *   iframe -> editor   { wbReady }            page finished loading
 *   iframe -> editor   { wbScrollY }          user scrolled
 *   editor -> iframe   { scrollToId }         bring a section into view
 *   editor -> iframe   { scrollY }            restore scroll after a re-render
 */
(function (WB) {
  const REFRESH_DELAY_MS = 150;

  let frame;
  let refreshTimer;
  let isReady = false;
  let lastScrollY = 0;
  let pendingSectionId = null;

  function post(message) {
    frame.contentWindow.postMessage(message, '*');
  }

  function refresh() {
    isReady = false;
    frame.srcdoc = WB.render(WB.store.project, { preview: true });
  }

  function onMessage(event) {
    if (event.source !== frame.contentWindow) return;
    const msg = event.data || {};

    if (typeof msg.wbScrollY === 'number') lastScrollY = msg.wbScrollY;

    if (msg.wbReady) {
      isReady = true;
      if (pendingSectionId) {
        post({ scrollToId: pendingSectionId });
        pendingSectionId = null;
      } else {
        post({ scrollY: lastScrollY });
      }
    }
  }

  WB.preview = {
    /** @param {HTMLIFrameElement} iframe */
    init(iframe) {
      frame = iframe;
      window.addEventListener('message', onMessage);
      WB.store.subscribe(() => {
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

    setWidth(width) { frame.style.width = width; },
  };
})(window.WB);
