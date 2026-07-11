const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "content-type": "application/json",
};

const json = (statusCode, body) => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

const ok = (body) => json(200, body);
const created = (body) => json(201, body);
const badRequest = (message) => json(400, { error: message });
const unauthorized = (message = "Unauthorized") => json(401, { error: message });
const forbidden = (message = "Forbidden") => json(403, { error: message });
const notFound = (message = "Not found") => json(404, { error: message });
const serverError = (message = "Internal error") => json(500, { error: message });

module.exports = { json, ok, created, badRequest, unauthorized, forbidden, notFound, serverError };