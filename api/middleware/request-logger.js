// api/middleware/request-logger.js
// Epic 7.1: Request logging middleware
// Logs all incoming requests with context

const { logRequest } = require("../lib/logger");

module.exports = logRequest;
