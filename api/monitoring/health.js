// api/monitoring/health.js
// Health check endpoint for monitoring and load balancers

const { createClient } = require("@supabase/supabase-js");
const { logInfo, logError } = require("../lib/logger");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "polygram-api",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "unknown",
    checks: {}
  };

  // Check database connection
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      health.checks.database = { status: "error", message: "Database not configured" };
      health.status = "degraded";
    } else {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { error } = await supabase.from("custody_wallets").select("user_id").limit(1);
      
      if (error) {
        health.checks.database = { status: "error", message: error.message };
        health.status = "degraded";
      } else {
        health.checks.database = { status: "ok" };
      }
    }
  } catch (err) {
    logError(err, { endpoint: '/api/monitoring/health', check: 'database' });
    health.checks.database = { status: "error", message: err.message };
    health.status = "degraded";
  }

  // Check environment variables
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missingEnvVars.length > 0) {
    health.checks.environment = {
      status: "error",
      message: `Missing: ${missingEnvVars.join(', ')}`
    };
    health.status = "degraded";
  } else {
    health.checks.environment = { status: "ok" };
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  
  logInfo('Health check', {
    status: health.status,
    checks: Object.keys(health.checks)
  });

  return res.status(statusCode).json(health);
};
