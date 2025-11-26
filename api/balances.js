const { ethers } = require("ethers");

// Polygon USDC.e (bridged USDC) contract
// https://polygonscan.com/address/0x2791bca1f2de4661ed88a30c99a7a9449aa84174
const USDC_E_ADDRESS = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";

const POLYGON_RPC =
  process.env.POLYGON_RPC || "https://polygon-rpc.com";

const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const usdcE = new ethers.Contract(USDC_E_ADDRESS, erc20Abi, provider);

const DATA_URL =
  process.env.POLYMARKET_DATA_URL || "https://data-api.polymarket.com";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const address = req.query.address;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: "invalid_address" });
  }

  try {
    const [rawBal, valueResp] = await Promise.all([
      usdcE.balanceOf(address),
      fetch(`${DATA_URL}/value?user=${address}`),
    ]);

    const decimals = 6; // USDC.e has 6 decimals
    const usdc = Number(ethers.formatUnits(rawBal, decimals));

    let openPositionsValue = 0;
    if (valueResp.ok) {
      const json = await valueResp.json(); // [{ user, value }]
      if (Array.isArray(json) && json.length > 0 && json[0].value != null) {
        openPositionsValue = Number(json[0].value) || 0;
      }
    }

    return res.status(200).json({
      address,
      usdcAvailable: usdc,
      openPositionsValue,
      pendingOrdersValue: 0,
    });
  } catch (err) {
    console.error("balances error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
