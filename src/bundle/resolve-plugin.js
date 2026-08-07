import path from "node:path";

/**
 * Is `child` inside directory `parent`?
 * @param {string} child
 * @param {string} parent
 */
function within(child, parent) {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * A bare specifier (`lodash`, `@scope/pkg`) — not relative, not absolute.
 * @param {string} spec
 */
function isBare(spec) {
  return !spec.startsWith(".") && !path.isAbsolute(spec);
}

/**
 * An import is allowed only if it resolves inside `shared/` (global shared code)
 * or a `_lib/` directory (per-database shared code). There is no `node_modules`
 * in a query server, so anything reaching outside the tree is a build error.
 *
 * @param {string} resolved  Absolute path the import resolves to.
 * @param {string} treeRoot  Absolute path to the project tree root.
 */
function isSharedOrLib(resolved, treeRoot) {
  if (within(resolved, path.join(treeRoot, "shared"))) return true;
  const rel = path.relative(treeRoot, resolved);
  return rel.split(path.sep).includes("_lib");
}

/**
 * esbuild plugin that restricts imports to `_lib/` and `shared/` within the
 * tree. Rejections are returned as esbuild errors so they carry the source
 * location of the offending import statement.
 *
 * @param {string} treeRoot  Absolute path to the project tree root.
 */
export function restrictImports(treeRoot) {
  return {
    name: "couchman-restrict-imports",
    /** @param {import("esbuild").PluginBuild} build */
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return null;

        if (isBare(args.path)) {
          return {
            errors: [
              {
                text:
                  `import "${args.path}" is not allowed: a query server has no ` +
                  `node_modules. Import from _lib/ or shared/ instead.`,
              },
            ],
          };
        }

        const resolved = path.resolve(args.resolveDir, args.path);
        if (!within(resolved, treeRoot)) {
          return {
            errors: [
              {
                text: `import "${args.path}" resolves outside the project tree`,
              },
            ],
          };
        }
        if (!isSharedOrLib(resolved, treeRoot)) {
          return {
            errors: [
              {
                text:
                  `import "${args.path}" must resolve inside _lib/ or shared/ ` +
                  `(resolved to ${path.relative(treeRoot, resolved)})`,
              },
            ],
          };
        }
        return null; // allow esbuild's default resolver to load it
      });
    },
  };
}
