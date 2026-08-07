// Provides a running CouchDB for integration tests. If COUCHMAN_IT_URL is set
// (e.g. http://admin:pass@localhost:5984) it is used as-is; otherwise a
// container is started with testcontainers (requires Docker). testcontainers is
// imported lazily so the external-URL path needs neither Docker nor the dep.

/**
 * @returns {Promise<{ baseUrl: string, user?: string, password?: string, hasSearch: boolean, teardown: () => Promise<void> }>}
 */
export async function startCouch() {
  const external = process.env.COUCHMAN_IT_URL;
  if (external) {
    const u = new URL(external);
    const user = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    u.username = "";
    u.password = "";
    const baseUrl = u.toString().replace(/\/$/, "");
    return { baseUrl, user, password, hasSearch: await probeSearch(baseUrl, user, password), teardown: async () => {} };
  }

  const { GenericContainer, Wait } = await import("testcontainers");
  const container = await new GenericContainer("zachlankton/couchdb-clouseau:3.3.3")
    .withExposedPorts(5984)
    .withEnvironment({ COUCHDB_USER: "admin", COUCHDB_PASSWORD: "password" })
    .withWaitStrategy(Wait.forHttp("/_up", 5984).forStatusCode(200))
    .withStartupTimeout(180_000)
    .start();

  const baseUrl = `http://${container.getHost()}:${container.getMappedPort(5984)}`;
  const user = "admin";
  const password = "password";
  // Ensure a single-node system is set up (creates _users, _replicator, …).
  await fetch(`${baseUrl}/_cluster_setup`, {
    method: "POST",
    headers: authHeaders(user, password),
    body: JSON.stringify({ action: "finish_cluster" }),
  }).catch(() => {});

  return {
    baseUrl,
    user,
    password,
    hasSearch: await probeSearch(baseUrl, user, password),
    teardown: async () => {
      await container.stop();
    },
  };
}

export function authHeaders(user, password) {
  const h = { "Content-Type": "application/json" };
  if (user) {
    h.Authorization =
      "Basic " + Buffer.from(`${user}:${password ?? ""}`).toString("base64");
  }
  return h;
}

async function probeSearch(baseUrl, user, password) {
  try {
    const res = await fetch(`${baseUrl}/_search_analyze`, {
      method: "POST",
      headers: authHeaders(user, password),
      body: JSON.stringify({ analyzer: "keyword", text: "couchman" }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
