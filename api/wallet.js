// api/wallet.js - Simple wallet generator (backup for client-side)

const { Wallet } = require("@ethersproject/wallet");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const wallet = Wallet.createRandom();
    
    return res.status(200).json({
      success: true,
      wallet: {
        address: wallet.address.toLowerCase(),
        created: new Date().toISOString(),
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
