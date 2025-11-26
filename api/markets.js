// Simple proxy to Polymarket Gamma /markets endpoint.

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

  const { kind = "new", limit = "10" } = req.query;

  const params = new URLSearchParams();
  params.set("limit", String(limit));

  // You can tune ordering here based on `kind` if desired.

  const url = `https://gamma-api.polymarket.com/markets?${params.toString()}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Gamma error", resp.status, text);
      return res
        .status(resp.status)
        .json({ error: "gamma_error", status: resp.status });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("markets error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
