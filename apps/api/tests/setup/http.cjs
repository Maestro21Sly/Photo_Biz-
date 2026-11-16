// Node keeps HTTP connections alive in the global agent by default (>=19).
// supertest binds a fresh ephemeral server for every request and closes it
// again, so a reused port can hand back a pooled socket belonging to a server
// that no longer exists — which surfaces as responses with nonsense statuses
// (407, 501, ...) on unrelated tests. Opt out of pooling for the suite.
const http = require("node:http");
const https = require("node:https");

http.globalAgent = new http.Agent({ keepAlive: false, maxSockets: Infinity });
https.globalAgent = new https.Agent({ keepAlive: false, maxSockets: Infinity });
