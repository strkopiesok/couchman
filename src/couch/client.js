import { createRequire } from "node:module";
import { CouchmanError } from "../errors.js";

// nano is CJS; load through require for reliable interop.
const require = createRequire(import.meta.url);
const nano = require("nano");

/**
 * @param {unknown} err
 * @param {string} ctx
 */
function wrap(err, ctx) {
  const message = err && typeof err === "object" && "message" in err ? err.message : String(err);
  return new CouchmanError(`${ctx}: ${message}`);
}

/**
 * A thin CouchDB client over nano, scoped to what couchman needs. Credentials
 * are re-embedded into the URL for nano (resolveEnvironment stripped them).
 *
 * @param {import("../config/load.js").ResolvedEnvironment} env
 */
export function createClient(env) {
  const u = new URL(env.url);
  if (env.user) {
    u.username = encodeURIComponent(env.user);
    u.password = encodeURIComponent(env.password ?? "");
  }
  const server = nano(u.toString());

  return {
    /**
     * @param {string} db
     * @returns {Promise<boolean>}
     */
    async databaseExists(db) {
      try {
        await server.db.get(db);
        return true;
      } catch (err) {
        if (err && err.statusCode === 404) return false;
        throw wrap(err, `checking database "${db}"`);
      }
    },

    /**
     * Fetch all `_design/*` documents from a database.
     * @param {string} db
     * @returns {Promise<Record<string, any>[]>}
     */
    async listDesignDocs(db) {
      try {
        const res = await server.use(db).list({
          startkey: "_design/",
          endkey: "_design0",
          include_docs: true,
        });
        return res.rows.map((r) => r.doc).filter(Boolean);
      } catch (err) {
        throw wrap(err, `listing design documents in "${db}"`);
      }
    },

    /**
     * Create a database. A no-op if it already exists.
     * @param {string} db
     */
    async createDatabase(db) {
      try {
        await server.db.create(db);
      } catch (err) {
        if (err && err.statusCode === 412) return; // already exists
        throw wrap(err, `creating database "${db}"`);
      }
    },

    /**
     * Write a design document. The doc carries the `_rev` from the plan; a
     * mismatch is a conflict (the document changed since the plan was made) and
     * an error, never a silent retry with a fresh revision.
     *
     * @param {string} db
     * @param {Record<string, any>} doc
     */
    async putDesignDoc(db, doc) {
      try {
        return await server.use(db).insert(doc);
      } catch (err) {
        if (err && err.statusCode === 409) {
          throw new CouchmanError(
            `conflict writing ${doc._id} in "${db}": it changed since the ` +
              `plan was made — re-run plan`,
          );
        }
        throw wrap(err, `writing ${doc._id} in "${db}"`);
      }
    },

    /**
     * Delete a design document by id and revision.
     * @param {string} db
     * @param {string} id
     * @param {string} rev
     */
    async deleteDesignDoc(db, id, rev) {
      try {
        return await server.use(db).destroy(id, rev);
      } catch (err) {
        if (err && err.statusCode === 409) {
          throw new CouchmanError(
            `conflict deleting ${id} in "${db}": it changed since the plan — re-run plan`,
          );
        }
        throw wrap(err, `deleting ${id} in "${db}"`);
      }
    },

    /**
     * Read a document by id, or null if it does not exist.
     * @param {string} db @param {string} id
     * @returns {Promise<Record<string, any>|null>}
     */
    async getDocument(db, id) {
      try {
        return await server.use(db).get(id);
      } catch (err) {
        if (err && err.statusCode === 404) return null;
        throw wrap(err, `reading ${id} in "${db}"`);
      }
    },

    /**
     * Write a plain (non-design) document, carrying `_rev` for updates.
     * @param {string} db @param {Record<string, any>} doc
     */
    async putDocument(db, doc) {
      try {
        return await server.use(db).insert(doc);
      } catch (err) {
        if (err && err.statusCode === 409) {
          throw new CouchmanError(
            `conflict writing ${doc._id} in "${db}": it changed meanwhile — retry`,
          );
        }
        throw wrap(err, `writing ${doc._id} in "${db}"`);
      }
    },

    /**
     * Is Clouseau reachable? Probes the search-analyze endpoint, which only
     * answers when the Clouseau service is attached. Any failure is treated as
     * "not reachable" so push can refuse before writing a search index that
     * would only fail later, at the first query.
     *
     * @returns {Promise<boolean>}
     */
    async searchReachable() {
      try {
        await server.request({
          method: "POST",
          path: "_search_analyze",
          body: { analyzer: "keyword", text: "couchman" },
        });
        return true;
      } catch {
        return false;
      }
    },

    /**
     * Query a view with `limit=0` to trigger its build.
     * @param {string} db @param {string} ddoc @param {string} view
     */
    async warmView(db, ddoc, view) {
      try {
        await server.request({ db, path: `_design/${ddoc}/_view/${view}`, qs: { limit: 0 } });
      } catch (err) {
        throw wrap(err, `warming view ${ddoc}/${view} in "${db}"`);
      }
    },

    /**
     * Query a search index with `q=*:*&limit=0` to trigger its Lucene build.
     * @param {string} db @param {string} ddoc @param {string} index
     */
    async warmSearch(db, ddoc, index) {
      try {
        await server.request({
          db,
          path: `_design/${ddoc}/_search/${index}`,
          qs: { q: "*:*", limit: 0 },
        });
      } catch (err) {
        throw wrap(err, `warming index ${ddoc}/${index} in "${db}"`);
      }
    },

    /**
     * Fetch Clouseau's info for a search index (size, doc count, build status).
     * @param {string} db @param {string} ddoc @param {string} index
     */
    async searchInfo(db, ddoc, index) {
      try {
        return await server.request({ db, path: `_design/${ddoc}/_search_info/${index}` });
      } catch (err) {
        throw wrap(err, `reading info for index ${ddoc}/${index} in "${db}"`);
      }
    },
  };
}
