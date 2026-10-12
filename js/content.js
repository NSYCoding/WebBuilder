/**
 * Schema-aware reading and writing of section content.
 *
 * Every edit that does not come from a form (inline canvas edits, AI
 * operations) goes through here, so values are always checked against the
 * section schema before they touch the project.
 */
(function (WB) {
  const { SCHEMA, FONTS } = WB;

  const MAX_TEXT = 2000;
  const MAX_LONG_TEXT = 6000;
  const MAX_LIST_ITEMS = 60;
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  const emptyValueFor = (field) => (field.type === 'list' ? [] : '');

  /**
   * Return a cleaned copy of `value` for `field`, or `undefined` if it is not acceptable.
   * `previous` is the current value; list items keep their existing images by position.
   */
  function sanitizeValue(field, value, previous) {
    switch (field.type) {
      case 'text':
      case 'textarea': {
        if (typeof value !== 'string' && typeof value !== 'number') return undefined;
        return String(value).slice(0, field.type === 'textarea' ? MAX_LONG_TEXT : MAX_TEXT);
      }
      case 'select': {
        if (typeof value !== 'string') return undefined;
        if (field.options === 'sections') {
          const exists = WB.store.project.sections.some((s) => s.id === value);
          return value === '' || exists ? value : undefined;
        }
        return field.options.some(([optionValue]) => optionValue === value) ? value : undefined;
      }
      case 'color':
        return typeof value === 'string' && HEX_COLOR.test(value) ? value : undefined;
      case 'image':
        // Images are chosen by the owner, never by AI or inline editing. Clearing is allowed.
        return value === '' ? '' : undefined;
      case 'list': {
        if (!Array.isArray(value)) return undefined;
        const before = Array.isArray(previous) ? previous : [];
        return value
          .slice(0, MAX_LIST_ITEMS)
          .filter((item) => item && typeof item === 'object')
          .map((item, index) => sanitizeItem(field.itemFields, item, before[index]));
      }
      default:
        return undefined;
    }
  }

  /** Clean one list item; fields that are missing or invalid fall back to the old value or empty. */
  function sanitizeItem(fields, item, previous = {}) {
    const clean = {};
    for (const field of fields) {
      const value = sanitizeValue(field, item[field.key], previous[field.key]);
      if (value !== undefined) clean[field.key] = value;
      else if (field.type === 'image') clean[field.key] = typeof previous[field.key] === 'string' ? previous[field.key] : '';
      else clean[field.key] = emptyValueFor(field);
    }
    return clean;
  }

  /** Section data for a new section: schema defaults overlaid with valid values from `data`. */
  function buildData(type, data = {}) {
    const result = SCHEMA[type].defaults();
    for (const field of SCHEMA[type].fields) {
      if (!(field.key in data)) continue;
      const value = sanitizeValue(field, data[field.key], result[field.key]);
      if (value !== undefined) result[field.key] = value;
    }
    return result;
  }

  /** Merge only the keys present in `data` into an existing section. Returns the keys changed. */
  function mergeData(section, data) {
    const changed = [];
    for (const field of SCHEMA[section.type].fields) {
      if (!(field.key in data)) continue;
      const value = sanitizeValue(field, data[field.key], section.data[field.key]);
      if (value === undefined) continue;
      section.data[field.key] = value;
      changed.push(field.key);
    }
    return changed;
  }

  /**
   * Set one value by dot path inside a section, e.g. 'categories.1.items.0.price'.
   * Also accepts 'navLabel'. Returns true if the value was valid and stored.
   */
  function setPath(section, pathString, value) {
    if (pathString === 'navLabel') {
      if (typeof value !== 'string') return false;
      section.navLabel = value.slice(0, 80);
      return true;
    }

    const segments = String(pathString).split('.');
    let fields = SCHEMA[section.type].fields;
    let owner = section.data;

    for (let i = 0; i < segments.length; i++) {
      const field = fields.find((f) => f.key === segments[i]);
      if (!field) return false;

      if (i === segments.length - 1) {
        const clean = sanitizeValue(field, value, owner[field.key]);
        if (clean === undefined) return false;
        owner[field.key] = clean;
        return true;
      }

      // Not the last segment: must be a list, followed by an item index.
      if (field.type !== 'list') return false;
      const index = Number(segments[i + 1]);
      const list = owner[field.key];
      if (!Array.isArray(list) || !Number.isInteger(index) || !list[index]) return false;

      if (i + 1 === segments.length - 1) { // path ends at the item itself: replace it
        if (!value || typeof value !== 'object') return false;
        list[index] = sanitizeItem(field.itemFields, value, list[index]);
        return true;
      }
      owner = list[index];
      fields = field.itemFields;
      i += 1; // consume the index segment
    }
    return false;
  }

  /** Short description of every section type, for the AI prompt. */
  function describeSchema() {
    const describeFields = (fields) => fields.map((field) => {
      if (field.type === 'list') return `${field.key}: list of { ${describeFields(field.itemFields)} }`;
      if (field.type === 'image') return `${field.key} (image, never set)`;
      if (field.type === 'select') {
        const options = field.options === 'sections' ? 'a section id or ""' : field.options.map(([v]) => `"${v}"`).join(' | ');
        return `${field.key}: ${options}`;
      }
      return field.key;
    }).join(', ');

    const sections = Object.entries(SCHEMA)
      .map(([type, schema]) => `- ${type}: ${describeFields(schema.fields)}`)
      .join('\n');

    return [
      'Section types and their data fields (text unless noted):',
      sections,
      '',
      'site fields: name, tagline, logo (one emoji), description, footer',
      'theme fields: primary, accent, bg, text (hex colours); headingFont, bodyFont (one of: ' + FONTS.join(', ') + '); radius (0-40 number)',
    ].join('\n');
  }

  /* ---------------- Retrieval helpers (for the AI assistant) ---------------- */

  const CHUNK_FIELD_CHARS = 240;
  const MAX_CHUNKS = 400;

  /** "key=value; key=value" for the plain-text fields of one object. */
  function textSummary(fields, obj) {
    return fields
      .filter((f) => (f.type === 'text' || f.type === 'textarea') && obj[f.key])
      .map((f) => `${f.key}=${String(obj[f.key]).replace(/\s+/g, ' ').slice(0, CHUNK_FIELD_CHARS)}`)
      .join('; ');
  }

  /**
   * Split the project into small addressable pieces: the site details, each
   * section, and each list item (dish, review, hours row...). The AI embeds these
   * and retrieves only the ones related to a request.
   * Each chunk: { address: "id=<section> path=<path>", text }.
   */
  function chunkProject(project) {
    const chunks = [{
      address: 'site',
      text: `Site details: name=${project.site.name}; tagline=${project.site.tagline}; description=${project.site.description}`,
    }];

    const walkLists = (section, fields, obj, prefix, trail) => {
      for (const field of fields.filter((f) => f.type === 'list')) {
        (obj[field.key] || []).forEach((item, index) => {
          const path = `${prefix}${field.key}.${index}`;
          const name = item[field.itemLabel] || `${field.itemName} ${index + 1}`;
          chunks.push({
            address: `id=${section.id} path=${path}`,
            text: `${[...trail, name].join(' > ')}: ${textSummary(field.itemFields, item)}`,
          });
          walkLists(section, field.itemFields, item, `${path}.`, [...trail, name]);
        });
      }
    };

    for (const section of project.sections) {
      const schema = SCHEMA[section.type];
      const label = WB.sectionLabel(section);
      chunks.push({
        address: `id=${section.id}`,
        text: `${label} section (${section.type}${section.enabled ? '' : ', hidden'}): ${textSummary(schema.fields, section.data)}`,
      });
      walkLists(section, schema.fields, section.data, '', [label]);
    }
    return chunks.slice(0, MAX_CHUNKS);
  }

  /** One line per section: id, type, label, visibility. Always shown to the model. */
  function outline(project) {
    return project.sections
      .map((s) => `- id=${s.id} type=${s.type} "${WB.sectionLabel(s)}"${s.enabled ? '' : ' (hidden)'}`)
      .join('\n');
  }

  WB.content = { sanitizeValue, buildData, mergeData, setPath, describeSchema, chunkProject, outline };
})(window.WB);
