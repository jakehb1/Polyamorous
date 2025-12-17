// api/ledger/history.js
// Epic 6.2: Transaction History / Activity Ledger
// Returns user's transaction history with filtering and pagination

const { createClient } = require("@supabase/supabase-js");
const { validateSession } = require("../middleware/validate-session");
const { handleApiError, ERROR_CODES } = require("../lib/errors");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "method_not_allowed",
      message: `Method ${req.method} not allowed`
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: "database_not_configured",
      message: "Supabase not configured"
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Phase 2: Require valid session
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7)
      : req.query?.session_token;

    if (!sessionToken) {
      return res.status(401).json({
        error: "authentication_required",
        message: "Session token required"
      });
    }

    const sessionValidation = await validateSession(sessionToken);
    if (!sessionValidation.isValid) {
      return res.status(401).json({
        error: "invalid_session",
        message: sessionValidation.error || "Invalid or expired session"
      });
    }

    const userId = sessionValidation.userId;

    // Query parameters
    const entryType = req.query?.type; // Filter by type: 'deposit', 'withdrawal', 'trade', etc.
    const status = req.query?.status; // Filter by status: 'completed', 'pending', 'failed'
    const limit = parseInt(req.query?.limit) || 50;
    const offset = parseInt(req.query?.offset) || 0;
    const startDate = req.query?.start_date;
    const endDate = req.query?.end_date;

    // Build query
    let query = supabase
      .from("ledger_entries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (entryType) {
      query = query.eq("entry_type", entryType);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: entries, error } = await query;

    if (error) {
      throw error;
    }

    // Get total count for pagination
    let countQuery = supabase
      .from("ledger_entries")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", userId);

    if (entryType) {
      countQuery = countQuery.eq("entry_type", entryType);
    }

    if (status) {
      countQuery = countQuery.eq("status", status);
    }

    const { count, error: countError } = await countQuery;

    // Format entries for frontend
    const formattedEntries = (entries || []).map(entry => ({
      id: entry.id,
      type: entry.entry_type,
      amount: parseFloat(entry.amount),
      currency: entry.currency,
      direction: entry.direction,
      status: entry.status,
      timestamp: entry.created_at,
      completed_at: entry.completed_at,
      balance_before: entry.balance_before ? parseFloat(entry.balance_before) : null,
      balance_after: entry.balance_after ? parseFloat(entry.balance_after) : null,
      tx_hashes: {
        source: entry.source_tx_hash,
        destination: entry.destination_tx_hash,
        bridge: entry.bridge_tx_hash
      },
      metadata: entry.metadata || {},
      error: entry.error_message || null
    }));

    return res.status(200).json({
      success: true,
      entries: formattedEntries,
      pagination: {
        total: count || 0,
        limit: limit,
        offset: offset,
        has_more: (count || 0) > offset + limit
      },
      filters: {
        type: entryType || null,
        status: status || null,
        start_date: startDate || null,
        end_date: endDate || null
      }
    });

  } catch (err) {
    return handleApiError(err, req, res, {
      operation: 'ledger_history',
      endpoint: '/api/ledger/history'
    });
  }
};
