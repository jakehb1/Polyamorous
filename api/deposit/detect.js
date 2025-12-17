// api/deposit/detect.js
// Epic 3.1: TON Deposit Detection Endpoint
// This endpoint can be called by an indexer/webhook when a TON deposit is detected
// Or can be polled to check for new deposits

const { createClient } = require("@supabase/supabase-js");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
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
    const {
      ton_tx_hash,
      ton_address,
      amount_ton,
      confirmations,
      block_number,
      timestamp
    } = req.body;

    if (!ton_tx_hash || !ton_address || !amount_ton) {
      return res.status(400).json({
        error: "missing_required_fields",
        message: "ton_tx_hash, ton_address, and amount_ton are required"
      });
    }

    // Find user by TON address
    const { data: wallet, error: walletError } = await supabase
      .from("custody_wallets")
      .select("user_id, ton_address")
      .eq("ton_address", ton_address)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({
        error: "user_not_found",
        message: "No user found with this TON address"
      });
    }

    // Check if deposit already exists
    const { data: existing, error: checkError } = await supabase
      .from("ton_deposits")
      .select("id, status")
      .eq("ton_tx_hash", ton_tx_hash)
      .single();

    if (existing) {
      // Update confirmations if needed
      if (confirmations > existing.confirmations) {
        await supabase
          .from("ton_deposits")
          .update({
            confirmations: confirmations,
            status: confirmations >= 1 ? 'confirmed' : existing.status
          })
          .eq("id", existing.id);
      }
      return res.status(200).json({
        success: true,
        deposit_id: existing.id,
        status: existing.status,
        message: "Deposit already recorded"
      });
    }

    // Create deposit record
    const depositData = {
      user_id: wallet.user_id,
      ton_address: ton_address,
      ton_tx_hash: ton_tx_hash,
      amount_ton: parseFloat(amount_ton),
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations: confirmations || 0,
      required_confirmations: 1
    };

    const { data: deposit, error: insertError } = await supabase
      .from("ton_deposits")
      .insert(depositData)
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // If confirmed, trigger bridge process
    if (deposit.status === 'confirmed') {
      // Update status to bridging
      await supabase
        .from("ton_deposits")
        .update({ 
          status: 'bridging',
          confirmed_at: new Date().toISOString()
        })
        .eq("id", deposit.id);

      // TODO: Call bridge service to convert TON -> Polygon USDC
      // For now, we'll simulate the bridge completion
      // In production, this would call an actual bridge service
      
      // Simulate bridge completion after a delay
      setTimeout(async () => {
        try {
          // Calculate USDC amount (mock conversion rate: 1 TON = ~$2.50 USDC)
          const conversionRate = 2.5; // TODO: Get real conversion rate
          const amountUSDC = deposit.amount_ton * conversionRate;
          
          // Update user balance
          const { error: balanceError } = await supabase.rpc('increment_balance', {
            p_user_id: wallet.user_id,
            p_amount: amountUSDC
          });

          // If RPC doesn't exist, use update
          if (balanceError) {
            const { data: currentBalance } = await supabase
              .from("user_balances")
              .select("usdc_available")
              .eq("user_id", wallet.user_id)
              .single();

            await supabase
              .from("user_balances")
              .update({
                usdc_available: (currentBalance?.usdc_available || 0) + amountUSDC
              })
              .eq("user_id", wallet.user_id);
          }

          // Update deposit status
          await supabase
            .from("ton_deposits")
            .update({
              status: 'completed',
              amount_usdc: amountUSDC,
              completed_at: new Date().toISOString()
            })
            .eq("id", deposit.id);

        } catch (bridgeError) {
          console.error("[deposit/detect] Bridge error:", bridgeError);
          await supabase
            .from("ton_deposits")
            .update({
              status: 'failed',
              error_message: bridgeError.message
            })
            .eq("id", deposit.id);
        }
      }, 5000); // Simulate 5 second bridge delay
    }

    return res.status(200).json({
      success: true,
      deposit_id: deposit.id,
      status: deposit.status,
      message: "Deposit detected and recorded"
    });

  } catch (err) {
    console.error("[deposit/detect] Error:", err);
    return res.status(500).json({
      error: "deposit_detection_failed",
      message: err.message
    });
  }
};
