// api/deposit/ton.js
// Epic 3.1: TON Deposit Handling
// Handles deposit detection, confirmation, and bridging to Polygon USDC

const { createClient } = require("@supabase/supabase-js");
const { validateSession } = require("../middleware/validate-session");
const { handleApiError, ERROR_CODES } = require("../lib/errors");
const crypto = require("crypto");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

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
    if (req.method === "POST") {
      // Record a deposit (called when deposit is detected)
      // Phase 2: Require valid session
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7)
        : req.body?.session_token;

      let userId;
      if (sessionToken) {
        const sessionValidation = await validateSession(sessionToken);
        if (!sessionValidation.isValid) {
          return res.status(401).json({
            error: "invalid_session",
            message: sessionValidation.error || "Invalid or expired session"
          });
        }
        userId = sessionValidation.userId;
      } else {
        userId = req.body?.telegram_id || req.body?.user_id;
        if (!userId) {
          return res.status(401).json({
            error: "authentication_required",
            message: "Session token or user_id required"
          });
        }
      }

      const {
        ton_tx_hash,
        ton_address,
        amount_ton,
        confirmations = 0
      } = req.body;

      if (!ton_tx_hash || !ton_address || !amount_ton) {
        return res.status(400).json({
          error: "missing_required_fields",
          message: "ton_tx_hash, ton_address, and amount_ton are required"
        });
      }

      // Check if deposit already exists
      const { data: existing, error: checkError } = await supabase
        .from("ton_deposits")
        .select("id, status")
        .eq("ton_tx_hash", ton_tx_hash)
        .single();

      if (existing) {
        return res.status(200).json({
          success: true,
          deposit: existing,
          message: "Deposit already recorded"
        });
      }

      // Create deposit record
      const { data: deposit, error: insertError } = await supabase
        .from("ton_deposits")
        .insert({
          user_id: userId,
          ton_address: ton_address,
          ton_tx_hash: ton_tx_hash,
          amount_ton: parseFloat(amount_ton),
          status: confirmations >= 1 ? 'confirmed' : 'pending',
          confirmations: confirmations,
          required_confirmations: 1
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      // If confirmed, start bridge process
      if (deposit.status === 'confirmed') {
        // TODO: Trigger bridge to Polygon USDC
        // For now, update status to bridging
        await supabase
          .from("ton_deposits")
          .update({ 
            status: 'bridging',
            confirmed_at: new Date().toISOString()
          })
          .eq("id", deposit.id);
      }

      return res.status(200).json({
        success: true,
        deposit: deposit,
        message: "Deposit recorded successfully"
      });

    } else if (req.method === "GET") {
      // Get deposit status or list deposits for user
      const authHeader = req.headers.authorization;
      const sessionToken = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7)
        : req.query?.session_token;

      let userId;
      if (sessionToken) {
        const sessionValidation = await validateSession(sessionToken);
        if (!sessionValidation.isValid) {
          return res.status(401).json({
            error: "invalid_session",
            message: sessionValidation.error || "Invalid or expired session"
          });
        }
        userId = sessionValidation.userId;
      } else {
        userId = req.query?.telegram_id || req.query?.user_id;
        if (!userId) {
          return res.status(401).json({
            error: "authentication_required",
            message: "Session token or user_id required"
          });
        }
      }

      const tonTxHash = req.query?.ton_tx_hash;

      if (tonTxHash) {
        // Get specific deposit
        const { data: deposit, error } = await supabase
          .from("ton_deposits")
          .select("*")
          .eq("user_id", userId)
          .eq("ton_tx_hash", tonTxHash)
          .single();

        if (error || !deposit) {
          return res.status(404).json({
            error: "deposit_not_found",
            message: "Deposit not found"
          });
        }

        return res.status(200).json({
          success: true,
          deposit: deposit
        });
      } else {
        // List deposits for user
        const { data: deposits, error } = await supabase
          .from("ton_deposits")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          throw error;
        }

        return res.status(200).json({
          success: true,
          deposits: deposits || [],
          count: deposits?.length || 0
        });
      }
    } else {
      return res.status(405).json({
        error: "method_not_allowed",
        message: `Method ${req.method} not allowed`
      });
    }

  } catch (err) {
    return handleApiError(err, req, res, {
      operation: 'deposit',
      endpoint: '/api/deposit/ton'
    });
  }
};
