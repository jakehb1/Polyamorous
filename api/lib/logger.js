// api/lib/logger.js
// Epic 7.1: Comprehensive Error Logging and Monitoring
// Provides structured logging with context for debugging and monitoring

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Structured log entry
 */
function createLogEntry(level, message, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    ...context,
    // Add environment info
    env: process.env.NODE_ENV || 'development',
    service: 'polygram-api'
  };
}

/**
 * Error logging with context
 */
function logError(message, error = null, context = {}) {
  const logEntry = createLogEntry(LOG_LEVELS.ERROR, message, {
    ...context,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    } : null
  });

  // Console output (structured for log aggregation)
  console.error(JSON.stringify(logEntry));

  // TODO: Send to error tracking service (Sentry, Datadog, etc.)
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, { extra: context });
  // }

  return logEntry;
}

/**
 * Warning logging
 */
function logWarning(message, context = {}) {
  const logEntry = createLogEntry(LOG_LEVELS.WARN, message, context);
  console.warn(JSON.stringify(logEntry));
  return logEntry;
}

/**
 * Info logging
 */
function logInfo(message, context = {}) {
  const logEntry = createLogEntry(LOG_LEVELS.INFO, message, context);
  console.log(JSON.stringify(logEntry));
  return logEntry;
}

/**
 * Debug logging (only in development)
 */
function logDebug(message, context = {}) {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
    const logEntry = createLogEntry(LOG_LEVELS.DEBUG, message, context);
    console.debug(JSON.stringify(logEntry));
    return logEntry;
  }
}

/**
 * Request logging middleware
 */
function logRequest(req, res, next) {
  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  // Attach request ID to response
  res.setHeader('X-Request-ID', requestId);

  // Log request start
  logInfo('Request started', {
    request_id: requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    user_agent: req.headers['user-agent'],
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    user_id: req.user?.userId || req.body?.telegram_id || req.query?.telegram_id
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 500 ? LOG_LEVELS.ERROR : 
                  res.statusCode >= 400 ? LOG_LEVELS.WARN : 
                  LOG_LEVELS.INFO;

    const logContext = {
      request_id: requestId,
      method: req.method,
      url: req.url,
      status_code: res.statusCode,
      duration_ms: duration,
      user_id: req.user?.userId || req.body?.telegram_id || req.query?.telegram_id
    };

    if (level === LOG_LEVELS.ERROR) {
      logError('Request failed', null, logContext);
    } else if (level === LOG_LEVELS.WARN) {
      logWarning('Request warning', logContext);
    } else {
      logInfo('Request completed', logContext);
    }
  });

  next();
}

/**
 * Security event logging
 */
function logSecurityEvent(eventType, message, context = {}) {
  const logEntry = createLogEntry(LOG_LEVELS.WARN, `SECURITY: ${message}`, {
    event_type: eventType,
    ...context
  });

  // Security events always go to error tracking
  console.warn(JSON.stringify(logEntry));

  // TODO: Send to security monitoring service
  // if (process.env.SECURITY_WEBHOOK) {
  //   fetch(process.env.SECURITY_WEBHOOK, {
  //     method: 'POST',
  //     body: JSON.stringify(logEntry)
  //   });
  // }

  return logEntry;
}

/**
 * Transaction logging (for audit trail)
 */
function logTransaction(transactionType, details, context = {}) {
  const logEntry = createLogEntry(LOG_LEVELS.INFO, `Transaction: ${transactionType}`, {
    transaction_type: transactionType,
    ...details,
    ...context
  });

  console.log(JSON.stringify(logEntry));
  return logEntry;
}

module.exports = {
  logError,
  logWarning,
  logInfo,
  logDebug,
  logRequest,
  logSecurityEvent,
  logTransaction,
  LOG_LEVELS
};
