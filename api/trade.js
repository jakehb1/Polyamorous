const { Wallet } = require("ethers");

const HOST = process.env.CLOB_HOST || "https://clob.polymarket.com";
const FUND_ADDRESS = process.env.CLOB_FUNDER;
const PK = process.env.CLOB_PK;
const CHAIN_ID = Number(process.env.CLOB_CHAIN_ID || 137);

const CRED_KEY = process.env.CLOB_API_KEY;
const CRED_SECRET = process.env.CLOB_API_SECRET;
const CRED_PASSPHRASE = process.env.CLOB_API_PASSPHRASE;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  if (!PK || !CRED_KEY || !CRED_SECRET || !CRED_PASSPHRASE || !FUND_ADDRESS) {
    return res.status(500).json({
      error: "Trading not configured on server (missing env vars)",
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { tokenId, side, price, size, tickSize = "0.001", negRisk = false } =
    body || {};

  if (!tokenId || !side || price == null || size == null) {
    return res.status(400).json({
      error: "tokenId, side, price, size are required",
    });
  }

  try {
    const clobModule = await import("@polymarket/clob-client");
    const { ClobClient, Side, OrderType } = clobModule;

    const signer = new Wallet(PK);

    const creds = {
      key: CRED_KEY,
      secret: CRED_SECRET,
      passphrase: CRED_PASSPHRASE,
    };

    const client = new ClobClient(
      HOST,
      CHAIN_ID,
      signer,
      creds,
      0,
      FUND_ADDRESS
    );

    const orderSide = side === "SELL" ? Side.SELL : Side.BUY;

    const resp = await client.createAndPostOrder(
      {
        tokenID: String(tokenId),
        price: Number(price),
        size: Number(size),
        side: orderSide,
      },
      { tickSize: String(tickSize), negRisk: !!negRisk },
      OrderType.GTC
    );

    return res.status(200).json({ ok: true, result: resp });
  } catch (err) {
    console.error("Trade error", err);
    return res.status(500).json({
      error: "Failed to place order",
      details: String(err.message || err),
    });
  }
};
