// Reverse of tree assembly: turn a design document read from the database into
// the files that represent it in the tree. This is a one-way adoption aid — it
// reformats what it finds, so a freshly pulled tree may show cosmetic diffs on
// the first plan. Review, commit, and treat the tree as the source of truth.

const STRING_GROUPS = ["filters", "updates", "shows", "lists"];

function withNewline(s) {
  return s.endsWith("\n") ? s : `${s}\n`;
}
function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Decompose one design document into tree files (paths relative to the design
 * document's directory).
 *
 * @param {Record<string, any>} doc
 * @returns {Array<{ rel: string, content: string }>}
 */
export function decomposeDdoc(doc) {
  /** @type {Array<{ rel: string, content: string }>} */
  const files = [];
  const meta = {};

  if (doc.language !== undefined) meta.language = doc.language;
  if (doc.options !== undefined) meta.options = doc.options;
  if (doc.autoupdate !== undefined) meta.autoupdate = doc.autoupdate;

  for (const [name, view] of Object.entries(doc.views ?? {})) {
    if (typeof view.map === "string") {
      files.push({ rel: `views/${name}/map.js`, content: withNewline(view.map) });
    }
    if (view.reduce !== undefined) {
      // A builtin reduce ("_count", "_sum", …) belongs in meta.json; a custom
      // reduce function goes to reduce.js.
      if (typeof view.reduce === "string" && view.reduce.startsWith("_")) {
        (meta.views ??= {})[name] = { reduce: view.reduce };
      } else {
        files.push({
          rel: `views/${name}/reduce.js`,
          content: withNewline(String(view.reduce)),
        });
      }
    }
  }

  for (const [name, index] of Object.entries(doc.indexes ?? {})) {
    if (typeof index.index === "string") {
      files.push({ rel: `indexes/${name}/index.js`, content: withNewline(index.index) });
    }
    const im = {};
    if (index.analyzer !== undefined) im.analyzer = index.analyzer;
    if (index.default_analyzer !== undefined) im.default_analyzer = index.default_analyzer;
    if (Object.keys(im).length) {
      files.push({ rel: `indexes/${name}/meta.json`, content: json(im) });
    }
  }

  for (const group of STRING_GROUPS) {
    for (const [name, fn] of Object.entries(doc[group] ?? {})) {
      if (typeof fn === "string") {
        files.push({ rel: `${group}/${name}.js`, content: withNewline(fn) });
      }
    }
  }

  if (typeof doc.validate_doc_update === "string") {
    files.push({ rel: "validate_doc_update.js", content: withNewline(doc.validate_doc_update) });
  }
  if (doc.rewrites !== undefined) {
    files.push({ rel: "rewrites.json", content: json(doc.rewrites) });
  }

  if (Object.keys(meta).length) {
    files.push({ rel: "meta.json", content: json(meta) });
  }

  return files;
}
