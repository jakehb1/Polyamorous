// api/tonconnect-manifest.js
// Serve TON Connect manifest file with proper CORS headers

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();

  const appUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.APP_URL || "https://polygram-7f6t.vercel.app";

  const manifest = {
    url: appUrl,
    name: "Polygram",
    iconUrl: `${appUrl}/icon.png`,
    termsOfUseUrl: `${appUrl}/terms`,
    privacyPolicyUrl: `${appUrl}/privacy`
  };

  return res.status(200).json(manifest);
};
