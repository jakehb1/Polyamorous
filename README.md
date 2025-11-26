# Polysight – Polymarket Telegram Mini App

This is a minimal Vercel project for a Telegram WebApp (Mini App) that connects to Polymarket.

Features:

- Auto-creates Polygon + Solana wallets on first load (stored in `localStorage` – demo only, not production secure).
- Shows USDC.e balance and open positions value for the Polygon wallet (via Polymarket Data API).
- Fetches Polymarket markets via the Gamma API and renders a "New Markets" list.
- Portfolio card with Positions / Orders / History, backed by Data API.
- Stubbed trading endpoint that posts orders to the Polymarket CLOB via `@polymarket/clob-client` once you provide credentials.

## Structure

- `public/index.html` – the Telegram Mini App UI (static).
- `api/balances.js` – returns USDC.e balance & portfolio value for an address.
- `api/deposit.js` – fetches Polymarket bridge deposit addresses for an address.
- `api/markets.js` – proxies Gamma markets API.
- `api/positions.js` – proxies Data API `/positions`.
- `api/trades.js` – proxies Data API `/trades`.
- `api/activity.js` – proxies Data API `/activity`.
- `api/trade.js` – posts an order via CLOB client (requires env vars).

## Environment variables

Set these in Vercel (Project → Settings → Environment Variables) or in a local `.env` file when running `vercel dev`:

```bash
# Optional custom Polygon RPC (default: https://polygon-rpc.com)
POLYGON_RPC=https://polygon-rpc.com

# Data API base URL
POLYMARKET_DATA_URL=https://data-api.polymarket.com

# CLOB trading (optional – required only if you want BUY YES / BUY NO to actually post orders)
CLOB_HOST=https://clob.polymarket.com
CLOB_CHAIN_ID=137
CLOB_FUNDER=0xYourPolygonAddress
CLOB_PK=0xyour_private_key_here
CLOB_API_KEY=your_api_key
CLOB_API_SECRET=your_api_secret
CLOB_API_PASSPHRASE=your_api_passphrase
```

## Local development

```bash
npm install
npx vercel dev
# or
npm run dev
```

Then open `http://localhost:3000` in a browser or Telegram WebApp.

## Deploying to Vercel

1. Push this directory to a GitHub repository.
2. Import the repo in Vercel.
3. Set the environment variables as above.
4. Deploy – Vercel will serve:
   - `public/index.html` at the root URL.
   - `api/*.js` as serverless functions.

Use the production URL as your Telegram Mini App URL in `@BotFather` or in your bot's `web_app` button.
