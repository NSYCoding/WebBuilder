/**
 * Minimal DOM helpers shared by the editor modules.
 */
(function (WB) {
  /**
   * Create an element.
   *
   * - `class` sets className
   * - `onxxx` attributes become event listeners (e.g. `onclick`)
   * - `false`/`null` attributes are skipped, `true` becomes a bare attribute
   * - children may be nodes, strings, nested arrays, or falsy (ignored)
   *
   * @param {string} tag
   * @param {Object} [attrs]
   * @param {...(Node|string|Array|null|false)} children
   * @returns {HTMLElement}
   */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);

    for (const [name, value] of Object.entries(attrs)) {
      if (name === 'class') el.className = value;
      else if (name.startsWith('on')) el.addEventListener(name.slice(2), value);
      else if (value !== false && value != null) el.setAttribute(name, value === true ? '' : value);
    }

    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return el;
  }

  const $ = (selector) => document.querySelector(selector);

  WB.h = h;
  WB.$ = $;
})(window.WB);
