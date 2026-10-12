/**
 * Schema-driven form controls.
 *
 * Every builder takes the field definition (see schema.js), the object the
 * field edits, and an `onChange` callback fired after the object was mutated.
 * Inputs write straight into the object, so no form-state layer is needed.
 */
(function (WB) {
  const { h } = WB;

  const MAX_IMAGE_SIDE_PX = 1600;
  const JPEG_QUALITY = 0.82;
  const EMBEDDED_IMAGE_LABEL = '(embedded image)';

  /** Remembers which <details> elements are expanded, so redraws keep them open. */
  const expanded = new WeakSet();

  /**
   * Keep a <details> element's open state tied to `owner` across redraws.
   * @param {HTMLDetailsElement} details
   * @param {object} owner  the data object the <details> represents
   */
  function rememberOpenState(details, owner) {
    details.open = expanded.has(owner);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(owner);
      else expanded.delete(owner);
    });
  }

  /** Shrink big photos so projects stay small enough for localStorage. */
  function downscaleImage(dataUrl) {
    return new Promise((resolve) => {
      if (dataUrl.startsWith('data:image/svg')) return resolve(dataUrl);

      const image = new Image();
      image.onerror = () => resolve(dataUrl);
      image.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_SIDE_PX / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      image.src = dataUrl;
    });
  }

  /** Options for fields whose `options` is the string 'sections'. */
  function sectionLinkOptions() {
    const targets = WB.store.project.sections.filter((s) => s.type !== 'hero');
    return [['', '(automatic)'], ...targets.map((s) => [s.id, WB.sectionLabel(s)])];
  }

  const bindInput = (input, obj, key, onChange, event = 'input') =>
    input.addEventListener(event, () => { obj[key] = input.value; onChange(); });

  function textareaControl(field, obj, onChange) {
    const input = h('textarea', { rows: field.rows || 3 }, obj[field.key] ?? '');
    bindInput(input, obj, field.key, onChange);
    return input;
  }

  function selectControl(field, obj, onChange) {
    const options = field.options === 'sections' ? sectionLinkOptions() : field.options;
    const current = obj[field.key] ?? '';
    const input = h('select', {}, options.map(([value, label]) =>
      h('option', { value, selected: value === current }, label)));
    bindInput(input, obj, field.key, onChange, 'change');
    return input;
  }

  function colorControl(field, obj, onChange) {
    const input = h('input', { type: 'color', value: obj[field.key] });
    bindInput(input, obj, field.key, onChange);
    return input;
  }

  function textControl(field, obj, onChange) {
    const input = h('input', { type: 'text', value: obj[field.key] ?? '' });
    bindInput(input, obj, field.key, onChange);
    return input;
  }

  /** URL text box + thumbnail + native file picker + clear button. */
  function imageControl(field, obj, onChange) {
    const isImageValue = (v) => /^(https?:|data:image)/.test(v || '');
    const text = h('input', { type: 'text', placeholder: 'https://… or choose a file' });
    const thumb = h('img', { alt: '' });

    const syncDisplay = () => {
      const value = obj[field.key] || '';
      text.value = value.startsWith('data:') ? EMBEDDED_IMAGE_LABEL : value;
      thumb.style.display = isImageValue(value) ? '' : 'none';
      if (isImageValue(value)) thumb.src = value;
    };
    const setValue = (value) => { obj[field.key] = value; syncDisplay(); onChange(); };

    text.addEventListener('input', () => {
      obj[field.key] = text.value.trim();
      thumb.style.display = isImageValue(obj[field.key]) ? '' : 'none';
      if (isImageValue(obj[field.key])) thumb.src = obj[field.key];
      onChange();
    });
    text.addEventListener('focus', () => { if (text.value === EMBEDDED_IMAGE_LABEL) text.select(); });

    const browse = h('button', {
      type: 'button',
      onclick: async () => {
        const dataUrl = await window.desktop.pickImage();
        if (dataUrl) setValue(await downscaleImage(dataUrl));
      },
    }, 'Browse');
    const clear = h('button', { type: 'button', class: 'icon', title: 'Clear', onclick: () => setValue('') }, '✕');

    syncDisplay();
    return h('div', { class: 'img-row' }, thumb, text, browse, clear);
  }

  const CONTROLS = {
    text: textControl,
    textarea: textareaControl,
    select: selectControl,
    color: colorControl,
    image: imageControl,
  };

  /**
   * A repeatable group of sub-forms with add / move / delete controls.
   * Redraws itself locally on structural changes; typing never redraws.
   */
  function listField(field, obj, onChange) {
    const root = h('div', { class: 'field list' });

    const draw = () => {
      const items = obj[field.key] || (obj[field.key] = []);
      root.replaceChildren(h('span', { class: 'lbl' }, field.label));

      items.forEach((item, index) => {
        const title = h('span', { class: 't' });
        const refreshTitle = () => {
          title.textContent = item[field.itemLabel] || `${field.itemName} ${index + 1}`;
        };
        refreshTitle();

        /** Wrap a structural change: stop the <summary> toggling, apply, redraw. */
        const action = (apply) => (event) => {
          event.preventDefault();
          event.stopPropagation();
          apply();
          draw();
          onChange();
        };
        const moveBy = (delta) => () => {
          const target = index + delta;
          if (target >= 0 && target < items.length) [items[index], items[target]] = [items[target], items[index]];
        };

        const details = h('details', { class: 'item' },
          h('summary', {},
            title,
            h('span', { class: 'btns' },
              h('button', { class: 'icon', title: 'Move up', onclick: action(moveBy(-1)) }, '↑'),
              h('button', { class: 'icon', title: 'Move down', onclick: action(moveBy(1)) }, '↓'),
              h('button', { class: 'icon danger', title: 'Delete', onclick: action(() => items.splice(index, 1)) }, '✕'))),
          h('div', { class: 'details-body' },
            fieldsEl(field.itemFields, item, () => { refreshTitle(); onChange(); })));

        rememberOpenState(details, item);
        root.append(details);
      });

      root.append(h('button', {
        class: 'add',
        onclick: () => {
          const item = field.newItem();
          items.push(item);
          expanded.add(item);
          draw();
          onChange();
        },
      }, `+ Add ${field.itemName.toLowerCase()}`));
    };

    draw();
    return root;
  }

  /** Build the labelled control for one field definition. */
  function fieldEl(field, obj, onChange) {
    if (field.type === 'list') return listField(field, obj, onChange);

    const control = (CONTROLS[field.type] || textControl)(field, obj, onChange);
    // Images contain several focusable controls, so a <label> wrapper would mis-target clicks.
    const wrapperTag = field.type === 'image' ? 'div' : 'label';
    return h(wrapperTag, { class: 'field' }, h('span', { class: 'lbl' }, field.label), control);
  }

  function fieldsEl(fields, obj, onChange) {
    return h('div', {}, fields.map((field) => fieldEl(field, obj, onChange)));
  }

  WB.fields = { fieldEl, fieldsEl, rememberOpenState, markOpen: (owner) => expanded.add(owner) };
})(window.WB);
