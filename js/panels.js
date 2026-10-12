/**
 * The three side-panel tabs: Sections, Design and Site.
 */
(function (WB) {
  const { h, $, SCHEMA, FONTS, store } = WB;
  const { fieldEl, fieldsEl, rememberOpenState, markOpen } = WB.fields;

  const RADIUS_OPTIONS = [['0', 'Square'], ['4', 'Subtle'], ['12', 'Rounded'], ['16', 'Soft'], ['28', 'Pill-ish']];
  const panelBody = () => $('#panel-body');

  /* ---------------- Sections tab ---------------- */

  const cardTitle = (section) => `${SCHEMA[section.type].icon} ${WB.sectionLabel(section)}`;

  function sectionCard(section) {
    const schema = SCHEMA[section.type];
    const title = h('span', { class: 't' }, cardTitle(section));
    const refreshTitle = () => { title.textContent = cardTitle(section); };
    const onFieldChange = () => { refreshTitle(); store.touch(); };

    /** Wrap a store change so the click does not also toggle the <details>. */
    const action = (apply) => (event) => {
      event.preventDefault();
      event.stopPropagation();
      apply();
    };
    const remove = () => {
      if (confirm(`Delete the ${schema.label} section?`)) store.removeSection(section.id);
    };

    const details = h('details', { class: section.enabled ? 'sec' : 'sec off', 'data-section-id': section.id },
      h('summary', {},
        title,
        h('span', { class: 'btns' },
          h('button', {
            class: 'icon',
            title: section.enabled ? 'Hide section' : 'Show section',
            onclick: action(() => store.toggleSection(section.id)),
          }, section.enabled ? '👁' : '🚫'),
          h('button', { class: 'icon', title: 'Move up', onclick: action(() => store.moveSection(section.id, -1)) }, '↑'),
          h('button', { class: 'icon', title: 'Move down', onclick: action(() => store.moveSection(section.id, 1)) }, '↓'),
          h('button', { class: 'icon danger', title: 'Delete section', onclick: action(remove) }, '✕'))),
      h('div', { class: 'details-body' },
        fieldsEl(schema.fields, section.data, onFieldChange),
        schema.nav === false
          ? null
          : fieldEl({ key: 'navLabel', type: 'text', label: 'Navigation label (optional)' }, section, onFieldChange)));

    rememberOpenState(details, section);
    details.addEventListener('toggle', () => {
      if (details.open) WB.preview.scrollToSection(WB.sectionId(section));
    });
    return details;
  }

  function addSectionPicker() {
    const select = h('select', { id: 'add-section' },
      h('option', { value: '' }, '+ Add section…'),
      Object.entries(SCHEMA).map(([type, schema]) => h('option', { value: type }, `${schema.icon} ${schema.label}`)));

    select.addEventListener('change', () => {
      if (!select.value) return;
      const section = WB.newSection(select.value);
      markOpen(section); // before the store notifies, so the redraw shows it expanded
      store.mutate((project) => { project.sections.push(section); });
      WB.preview.scrollToSection(WB.sectionId(section));
    });
    return h('div', { class: 'field' }, select);
  }

  function renderSections() {
    panelBody().replaceChildren(
      ...store.project.sections.map(sectionCard),
      addSectionPicker());
  }

  /* ---------------- Design tab ---------------- */

  function renderDesign() {
    const theme = store.project.theme;
    const touch = () => store.touch();
    const fontField = (key, label) => fieldEl(
      { key, type: 'select', label, options: FONTS.map((font) => [font, font]) }, theme, touch);

    // Radius is stored as a number but <select> values are strings, so convert on change.
    const radiusField = fieldEl(
      { key: 'radius', type: 'select', label: 'Corners', options: RADIUS_OPTIONS },
      { radius: String(theme.radius) }, () => {});
    radiusField.querySelector('select').addEventListener('change', (event) => {
      theme.radius = Number(event.target.value);
      touch();
    });

    panelBody().replaceChildren(
      h('h4', {}, 'Colours'),
      h('div', { class: 'cols' },
        fieldEl({ key: 'primary', type: 'color', label: 'Primary' }, theme, touch),
        fieldEl({ key: 'accent', type: 'color', label: 'Accent' }, theme, touch),
        fieldEl({ key: 'bg', type: 'color', label: 'Background' }, theme, touch),
        fieldEl({ key: 'text', type: 'color', label: 'Text' }, theme, touch)),
      h('h4', {}, 'Typography'),
      fontField('headingFont', 'Heading font'),
      fontField('bodyFont', 'Body font'),
      h('h4', {}, 'Shape'),
      radiusField);
  }

  /* ---------------- Site tab ---------------- */

  function renderSite() {
    const site = store.project.site;
    const touch = () => store.touch();
    panelBody().replaceChildren(
      fieldEl({ key: 'name', type: 'text', label: 'Restaurant name' }, site, touch),
      fieldEl({ key: 'tagline', type: 'text', label: 'Tagline' }, site, touch),
      fieldEl({ key: 'logo', type: 'text', label: 'Logo emoji / symbol' }, site, touch),
      fieldEl({ key: 'description', type: 'textarea', label: 'SEO description', rows: 3 }, site, touch),
      fieldEl({ key: 'footer', type: 'text', label: 'Footer text' }, site, touch));
  }

  /* ---------------- Tabs ---------------- */

  const RENDERERS = {
    sections: renderSections,
    design: renderDesign,
    site: renderSite,
    ai: () => WB.aiPanel.render(panelBody()),
  };
  let currentTab = 'sections';

  WB.panels = {
    get tab() { return currentTab; },

    /** @param {'sections'|'design'|'site'|'ai'} tab */
    show(tab) {
      currentTab = tab;
      document.querySelectorAll('#tabs button').forEach((button) => {
        button.classList.toggle('on', button.dataset.tab === tab);
      });
      RENDERERS[tab]();
    },

    /** Redraw the current tab after the project changed from outside the forms. */
    refresh() {
      if (currentTab !== 'ai') RENDERERS[currentTab](); // the chat keeps its own state
    },

    /** Switch to the Sections tab with one section expanded and scrolled into view. */
    focusSection(id) {
      const section = store.findSection(id);
      if (!section) return;
      markOpen(section);
      this.show('sections');
      const card = panelBody().querySelector(`[data-section-id="${CSS.escape(id)}"]`);
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },

    /** Switch to the Sections tab and open the "add section" menu. */
    focusAddSection() {
      this.show('sections');
      const picker = $('#add-section');
      picker.scrollIntoView({ block: 'nearest' });
      picker.focus();
    },
  };
})(window.WB);
