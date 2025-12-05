// api/test.js
// Health check and setup verification endpoint

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const checks = {
    timestamp: new Date().toISOString(),
    ok: true,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
    },
    supabase: {
      configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
      url: process.env.SUPABASE_URL ? 'set' : 'missing',
      serviceKey: process.env.SUPABASE_SERVICE_KEY ? 'set' : 'missing',
    },
    encryption: {
      keySet: !!process.env.ENCRYPTION_KEY,
      keyLength: process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.length : 0,
      valid: process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.length === 64 : false,
    },
    polygon: {
      rpc: process.env.POLYGON_RPC || 'default (polygon-rpc.com)',
    },
  };

  // Test Supabase connection if configured
  if (checks.supabase.configured) {
    try {
      const { createClient } = require("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
      
      // Try a simple query
      const { error } = await supabase
        .from("custody_wallets")
        .select("id")
        .limit(1);
      
      checks.supabase.connected = !error;
      checks.supabase.error = error ? error.message : null;
    } catch (err) {
      checks.supabase.connected = false;
      checks.supabase.error = err.message;
    }
  } else {
    checks.supabase.connected = false;
    checks.supabase.error = "Not configured";
  }

  // Overall status
  checks.ok = checks.supabase.configured && 
              checks.encryption.valid && 
              (checks.supabase.connected !== false);

  const status = checks.ok ? 200 : 503;
  
  return res.status(status).json(checks);
};

