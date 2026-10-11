# ApexTrade — SQL paper-trading platform

A full-stack starter matching your ER diagram and database design document:
- React + Vite responsive trading dashboard
- Express API + PostgreSQL
- Register/login with bcrypt password hashing and JWT
- Watchlist/market page for 15 symbols, portfolio, paper BUY/SELL orders, order history, execution ledger, balance history
- TradingView Advanced Chart widget for chart visualization
- Deployment configuration for Render (public URL) + managed PostgreSQL

> This is a **paper-trading/educational project**, not a broker. Orders are simulated in your own database. TradingView's public chart widget does not expose a supported API for importing/exporting a user's TradingView Paper Trading account orders. Therefore, TradingView charts are embedded, while ApexTrade's own paper orders and history are stored in PostgreSQL.

## 1. Prerequisites
- Node.js 20+
- PostgreSQL database (local for development, or a hosted DB such as Render PostgreSQL / Neon)
- Optional: a Finnhub API token for market quotes. Create one at https://finnhub.io/ and set `FINNHUB_API_KEY`. Without it, the app displays clearly labeled sample prices, not live quotes.

## 2. Run in VS Code
Open this folder in VS Code, then in the terminal:

```bash
# Terminal 1
cd server
cp .env.example .env
# Edit .env and set DATABASE_URL, JWT_SECRET, and optionally FINNHUB_API_KEY
npm install
npm run db:init
npm run dev

# Terminal 2 (new terminal)
cd client
npm install
npm run dev
```

For a local PostgreSQL database, `DATABASE_URL` may look like:
`postgresql://postgres:YOUR_PASSWORD@localhost:5432/apextrade`

The Vite dev server is just for development. To make the app public, follow the deployment section below; your production site will have a public HTTPS URL.

## 3. Public deployment (Render)
1. Push this project to a GitHub repository.
2. In Render, create a **PostgreSQL** database. Copy its **Internal Database URL** if the web service is in the same region.
3. Create a **Web Service** from the GitHub repository:
   - Root Directory: leave blank
   - Build Command: `npm install --prefix server && npm install --prefix client && npm run build --prefix client`
   - Start Command: `npm start --prefix server`
4. Add environment variables to the Render service:
   - `DATABASE_URL` = Render PostgreSQL Internal Database URL
   - `JWT_SECRET` = long random secret (at least 32 characters)
   - `NODE_ENV` = `production`
   - `FINNHUB_API_KEY` = your optional Finnhub token
   - `CLIENT_ORIGIN` = your Render service URL, e.g. `https://apextrade-example.onrender.com` (update after the first deploy if needed)
5. Run database initialization once from Render Shell: `npm run db:init --prefix server`.
6. Redeploy. Render provides a public HTTPS URL. Do not commit `.env` or API keys.

For a managed DB from Neon instead, set `DATABASE_URL` to the Neon connection string and enable SSL as required by your provider.

## 4. Data model notes
The six core tables align with your design document: `users`, `user_accounts`, `stocks_master`, `user_portfolios`, `order_book`, `trade_execution_ledger`. Two practical additions are included:
- `users.password_hash`: authentication needs a stored password hash; never store plain-text passwords.
- `balance_history`: needed to display balance history and is not one of the six original ER entities.
The app also includes `order_type`, `executed_quantity`, and `executed_at` as described in the written database document.

## 5. Market data / TradingView
- The watchlist has 15 US symbols. Finnhub quotes need a valid API token and may be subject to rate limits/plan limits. Configure it in server `.env` or your host environment.
- The embedded TradingView chart is for visualization only. It is not a data extraction bridge to TradingView Paper Trading.
- To connect real order flow to an external provider, use a documented broker/API integration and its authorization process. Never scrape private account data or store provider passwords.

## 6. Important security notes before real-world use
This is a project/demo baseline. Before production use, add email verification, password reset, rate limiting, CSRF protection if using cookies, stricter audit logs, monitoring, automated tests, and review transaction/market-data licensing. It must not be used for real-money trading without professional security, legal, and financial review.
