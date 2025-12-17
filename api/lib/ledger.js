// api/lib/ledger.js
// Epic 6.2: Ledger Helper Functions
// Utility functions for creating and updating ledger entries

const { createClient } = require("@supabase/supabase-js");

/**
 * Create a ledger entry for any transaction type
 * @param {Object} params - Ledger entry parameters
 * @returns {Promise<string>} Ledger entry ID
 */
async function createLedgerEntry(params) {
  const {
    user_id,
    entry_type,
    amount,
    currency = 'USDC',
    direction, // 'credit' or 'debit'
    status = 'pending',
    metadata = {},
    deposit_id = null,
    withdrawal_id = null,
    trade_id = null
  } = params;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase not configured');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Use the database function for consistency
    const { data, error } = await supabase.rpc('create_ledger_entry', {
      p_user_id: user_id,
      p_entry_type: entry_type,
      p_amount: amount,
      p_currency: currency,
      p_direction: direction,
      p_status: status,
      p_metadata: metadata,
      p_deposit_id: deposit_id,
      p_withdrawal_id: withdrawal_id,
      p_trade_id: trade_id
    });

    if (error) {
      // If RPC fails, try direct insert
      console.warn('[ledger] RPC function not available, using direct insert');
      
      // Get current balance
      const { data: balance } = await supabase
        .from("user_balances")
        .select("usdc_available")
        .eq("user_id", user_id)
        .single();

      const balanceBefore = balance?.usdc_available || 0;
      const balanceAfter = direction === 'credit' 
        ? balanceBefore + amount 
        : balanceBefore - amount;

      const { data: entry, error: insertError } = await supabase
        .from("ledger_entries")
        .insert({
          user_id,
          entry_type,
          amount,
          currency,
          direction,
          status,
          metadata,
          deposit_id,
          withdrawal_id,
          trade_id,
          balance_before: balanceBefore,
          balance_after: balanceAfter
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      return entry.id;
    }

    return data;

  } catch (err) {
    console.error("[ledger] Error creating ledger entry:", err);
    throw err;
  }
}

/**
 * Update ledger entry status
 * @param {string} entryId - Ledger entry ID
 * @param {string} status - New status
 * @param {string} txHash - Transaction hash (optional)
 * @param {string} errorMessage - Error message if failed (optional)
 */
async function updateLedgerEntryStatus(entryId, status, txHash = null, errorMessage = null) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('Supabase not configured');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Use database function
    const { error } = await supabase.rpc('update_ledger_entry_status', {
      p_entry_id: entryId,
      p_status: status,
      p_tx_hash: txHash,
      p_error_message: errorMessage
    });

    if (error) {
      // Fallback to direct update
      console.warn('[ledger] RPC function not available, using direct update');
      
      const updateData = {
        status: status
      };

      if (txHash) {
        if (status === 'completed') {
          updateData.destination_tx_hash = txHash;
        } else {
          updateData.source_tx_hash = txHash;
        }
      }

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (status === 'failed') {
        updateData.failed_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from("ledger_entries")
        .update(updateData)
        .eq("id", entryId);

      if (updateError) {
        throw updateError;
      }
    }

  } catch (err) {
    console.error("[ledger] Error updating ledger entry:", err);
    throw err;
  }
}

module.exports = {
  createLedgerEntry,
  updateLedgerEntryStatus
};
