/**
 * Applies the operations returned by the AI assistant to a project.
 *
 * The model's output is treated as untrusted input: every operation is checked
 * and every value goes through WB.content. Invalid operations are skipped and
 * reported rather than aborting the whole batch.
 */
(function (WB) {
  const { SCHEMA, FONTS } = WB;

  const MAX_OPERATIONS = 80;
  const MAX_SECTIONS = 24;
  const SITE_FIELDS = { name: 80, tagline: 120, logo: 8, description: 300, footer: 200 };
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  const sectionName = (section) => WB.sectionLabel(section);

  function findIndex(project, id) {
    return project.sections.findIndex((s) => s.id === id);
  }

  /** Insert `section` after `afterId` ('FIRST' = top, unknown/omitted = end). */
  function insertSection(project, section, afterId) {
    if (afterId === 'FIRST') project.sections.unshift(section);
    else {
      const index = findIndex(project, afterId);
      if (index >= 0) project.sections.splice(index + 1, 0, section);
      else project.sections.push(section);
    }
  }

  const handlers = {
    set(project, op) {
      const section = project.sections[findIndex(project, op.id)];
      if (!section) throw new Error(`no section "${op.id}"`);
      if (!WB.content.setPath(section, String(op.path), op.value)) throw new Error(`cannot set ${op.path}`);
      return `Edited ${sectionName(section)}`;
    },

    update_section(project, op) {
      const section = project.sections[findIndex(project, op.id)];
      if (!section) throw new Error(`no section "${op.id}"`);
      if (!op.data || typeof op.data !== 'object') throw new Error('missing data');
      const changed = WB.content.mergeData(section, op.data);
      if (!changed.length) throw new Error(`nothing valid to change in ${sectionName(section)}`);
      return `Updated ${sectionName(section)}`;
    },

    add_section(project, op) {
      if (!SCHEMA[op.type]) throw new Error(`unknown section type "${op.type}"`);
      if (project.sections.length >= MAX_SECTIONS) throw new Error('too many sections');
      const section = WB.newSection(op.type);
      section.data = WB.content.buildData(op.type, op.data || {});
      insertSection(project, section, op.after_id);
      return `Added ${SCHEMA[op.type].label} section`;
    },

    remove_section(project, op) {
      const index = findIndex(project, op.id);
      if (index < 0) throw new Error(`no section "${op.id}"`);
      const [removed] = project.sections.splice(index, 1);
      return `Removed ${sectionName(removed)}`;
    },

    move_section(project, op) {
      const index = findIndex(project, op.id);
      if (index < 0) throw new Error(`no section "${op.id}"`);
      const [section] = project.sections.splice(index, 1);
      insertSection(project, section, op.after_id);
      return `Moved ${sectionName(section)}`;
    },

    set_visibility(project, op) {
      const section = project.sections[findIndex(project, op.id)];
      if (!section || typeof op.enabled !== 'boolean') throw new Error('bad visibility change');
      section.enabled = op.enabled;
      return `${op.enabled ? 'Showed' : 'Hid'} ${sectionName(section)}`;
    },

    set_site(project, op) {
      const values = op.values || {};
      let changed = 0;
      for (const [key, max] of Object.entries(SITE_FIELDS)) {
        if (typeof values[key] === 'string') { project.site[key] = values[key].slice(0, max); changed += 1; }
      }
      if (!changed) throw new Error('no valid site fields');
      return 'Updated site details';
    },

    set_theme(project, op) {
      const values = op.values || {};
      const theme = project.theme;
      let changed = 0;
      for (const key of ['primary', 'accent', 'bg', 'text']) {
        if (typeof values[key] === 'string' && HEX_COLOR.test(values[key])) { theme[key] = values[key]; changed += 1; }
      }
      for (const key of ['headingFont', 'bodyFont']) {
        if (FONTS.includes(values[key])) { theme[key] = values[key]; changed += 1; }
      }
      const radius = Number(values.radius);
      if (values.radius !== undefined && Number.isFinite(radius)) { theme.radius = Math.min(40, Math.max(0, radius)); changed += 1; }
      if (!changed) throw new Error('no valid theme values');
      return 'Updated colours and fonts';
    },

    replace_all_sections(project, op) {
      if (!Array.isArray(op.sections) || !op.sections.length) throw new Error('no sections given');
      const sections = op.sections
        .filter((s) => s && SCHEMA[s.type])
        .slice(0, MAX_SECTIONS)
        .map((s) => {
          const section = WB.newSection(s.type);
          section.data = WB.content.buildData(s.type, s.data || {});
          return section;
        });
      if (!sections.length) throw new Error('no valid sections');
      project.sections = sections;
      return `Rebuilt the page with ${sections.length} sections`;
    },
  };

  /**
   * @param {Object} project mutated in place
   * @param {Array} operations raw operations from the model
   * @returns {{done: string[], skipped: string[]}} human-readable results
   */
  function applyOperations(project, operations) {
    const done = [];
    const skipped = [];

    for (const op of (Array.isArray(operations) ? operations : []).slice(0, MAX_OPERATIONS)) {
      const handler = op && Object.prototype.hasOwnProperty.call(handlers, op.op) ? handlers[op.op] : null;
      if (!handler) { skipped.push(`Unknown operation "${op && op.op}"`); continue; }
      try {
        const message = handler(project, op);
        if (!done.includes(message)) done.push(message);
      } catch (error) {
        skipped.push(`${op.op}: ${error.message}`);
      }
    }
    return { done, skipped };
  }

  WB.aiOps = { applyOperations };
})(window.WB);
