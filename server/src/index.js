import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 4000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not configured.');
}

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? process.env.CLIENT_ORIGIN || true
        : true,
  })
);

app.use(express.json({ limit: '1mb' }));

const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(
    /^Bearer\s+/i,
    ''
  );

  if (!token) {
    return res.status(401).json({ error: 'Please sign in.' });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Authentication is not configured.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res
      .status(401)
      .json({ error: 'Session expired. Please sign in again.' });
  }
}

async function getAccount(client, userId) {
  const result = await client.query(
    `SELECT *
     FROM user_accounts
     WHERE user_id = $1
     ORDER BY account_id
     LIMIT 1`,
    [userId]
  );

  if (!result.rowCount) {
    throw Object.assign(new Error('Trading account not found.'), {
      status: 404,
    });
  }

  return result.rows[0];
}

function mapMarketStock(stock) {
  return {
    ...stock,
    current_price: Number(stock.current_price),
    previous_close: stock.previous_close == null
      ? null
      : Number(stock.previous_close),
    change: stock.change == null ? null : Number(stock.change),
    change_pct:
      stock.change_pct == null ? null : Number(stock.change_pct),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ApexTrade API' });
});

/* -------------------- REGISTER -------------------- */

app.post(
  '/api/auth/register',
  asyncRoute(async (req, res) => {
    const { username, email, password, role = 'Retail' } = req.body || {};

    if (
      !username?.trim() ||
      !email?.trim() ||
      !password ||
      password.length < 8
    ) {
      return res.status(400).json({
        error:
          'Enter username, email, and a password of at least 8 characters.',
      });
    }

    if (!['Retail', 'Portfolio Manager', 'Auditor'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: 'Authentication is not configured.',
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query(
        `INSERT INTO users(username, email, role, password_hash)
         VALUES($1, $2, $3, $4)
         RETURNING user_id, username, email, role, created_at`,
        [username.trim(), email.trim().toLowerCase(), role, hash]
      );

      const user = userResult.rows[0];

      const accountResult = await client.query(
        `INSERT INTO user_accounts(user_id, cash_balance, currency)
         VALUES($1, 100000.00, $2)
         RETURNING account_id, cash_balance, currency`,
        [user.user_id, 'USD']
      );

      const account = accountResult.rows[0];

      await client.query(
        `INSERT INTO balance_history(
           account_id, change_amount, balance_after, reason
         )
         VALUES($1, $2, $3, $4)`,
        [
          account.account_id,
          100000,
          account.cash_balance,
          'Initial paper-trading balance',
        ]
      );

      await client.query('COMMIT');

      const token = jwt.sign(
        {
          user_id: user.user_id,
          username: user.username,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
      );

      res.status(201).json({ token, user });
    } catch (error) {
      await client.query('ROLLBACK');

      if (error.code === '23505') {
        return res.status(409).json({
          error: 'An account with this email already exists.',
        });
      }

      throw error;
    } finally {
      client.release();
    }
  })
);

/* -------------------- LOGIN -------------------- */

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error: 'Authentication is not configured.',
      });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [String(email || '').trim().toLowerCase()]
    );

    if (
      !result.rowCount ||
      !(await bcrypt.compare(password || '', result.rows[0].password_hash))
    ) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    const user = result.rows[0];

    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  })
);


/* -------------------- MARKET -------------------- */

app.get(
  '/api/market',
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT stock_id, symbol, company_name, current_price
       FROM stocks_master
       ORDER BY symbol`
    );

    const stocks = result.rows.map((stock) => {
      const price = Number(stock.current_price);

      return {
        ...stock,
        current_price: price,
        previous_close: null,
        change: null,
        change_pct: null,
        source: 'sample',
      };
    });

    res.json({
      stocks: stocks.map(mapMarketStock),
      live: false,
      updated_at: new Date().toISOString(),
    });
  })
);

/* -------------------- DASHBOARD -------------------- */

app.get(
  '/api/dashboard',
  auth,
  asyncRoute(async (req, res) => {
    const client = await pool.connect();

    try {
      const account = await getAccount(client, req.user.user_id);

      const [positionsResult, ordersResult, ledgerResult, historyResult] =
        await Promise.all([
          client.query(
            `SELECT
               p.portfolio_id,
               s.stock_id,
               s.symbol,
               s.company_name,
               p.quantity_held,
               p.average_buy_price,
               s.current_price,
               (p.quantity_held * s.current_price) AS market_value,
               ((s.current_price - p.average_buy_price)
                 * p.quantity_held) AS unrealized_pnl,
               CASE
                 WHEN p.average_buy_price > 0
                 THEN ((s.current_price - p.average_buy_price)
                       / p.average_buy_price) * 100
                 ELSE 0
               END AS unrealized_pnl_pct
             FROM user_portfolios p
             JOIN stocks_master s USING(stock_id)
             WHERE p.account_id = $1 AND p.quantity_held > 0
             ORDER BY market_value DESC`,
            [account.account_id]
          ),

          client.query(
            `SELECT
               o.order_id,
               s.symbol,
               o.order_type,
               o.quantity,
               o.target_price,
               o.status,
               o.created_at
             FROM order_book o
             JOIN stocks_master s USING(stock_id)
             WHERE o.account_id = $1
             ORDER BY o.created_at DESC
             LIMIT 100`,
            [account.account_id]
          ),

          client.query(
            `SELECT
               l.execution_id,
               o.order_id,
               s.symbol,
               o.order_type,
               l.execution_price,
               l.executed_quantity,
               l.total_value,
               l.realized_pnl,
               l.executed_at
             FROM trade_execution_ledger l
             JOIN order_book o USING(order_id)
             JOIN stocks_master s USING(stock_id)
             WHERE o.account_id = $1
             ORDER BY l.executed_at DESC
             LIMIT 100`,
            [account.account_id]
          ),

          client.query(
            `SELECT
               balance_history_id,
               change_amount,
               balance_after,
               reason,
               created_at
             FROM balance_history
             WHERE account_id = $1
             ORDER BY created_at DESC
             LIMIT 100`,
            [account.account_id]
          ),
        ]);

      const positions = positionsResult.rows.map((position) => ({
        ...position,
        quantity_held: Number(position.quantity_held),
        average_buy_price: Number(position.average_buy_price),
        current_price: Number(position.current_price),
        market_value: Number(position.market_value),
        unrealized_pnl: Number(position.unrealized_pnl),
        unrealized_pnl_pct: Number(position.unrealized_pnl_pct),
      }));

      const positionsValue = roundMoney(
        positions.reduce((sum, position) => sum + position.market_value, 0)
      );

      const unrealizedPnl = roundMoney(
        positions.reduce((sum, position) => sum + position.unrealized_pnl, 0)
      );

      const realizedResult = await client.query(
        `SELECT COALESCE(SUM(l.realized_pnl), 0) AS realized_pnl
         FROM trade_execution_ledger l
         JOIN order_book o USING(order_id)
         WHERE o.account_id = $1 AND o.order_type = 'SELL'`,
        [account.account_id]
      );

      const realizedPnl = Number(realizedResult.rows[0].realized_pnl || 0);
      const cashBalance = Number(account.cash_balance);
      const equity = roundMoney(cashBalance + positionsValue);

      res.json({
        account: {
          account_id: account.account_id,
          cash_balance: cashBalance,
          currency: account.currency,
        },

        positions,

        orders: ordersResult.rows,

        ledger: ledgerResult.rows.map((entry) => ({
          ...entry,
          execution_price: Number(entry.execution_price),
          executed_quantity: Number(entry.executed_quantity),
          total_value: Number(entry.total_value),
          realized_pnl:
            entry.realized_pnl == null ? null : Number(entry.realized_pnl),
        })),

        balanceHistory: historyResult.rows,

        summary: {
          positions_value: positionsValue,
          equity,
          unrealized_pnl: unrealizedPnl,
          realized_pnl: roundMoney(realizedPnl),
          total_pnl: roundMoney(realizedPnl + unrealizedPnl),
        },
      });
    } finally {
      client.release();
    }
  })
);

/* -------------------- BUY / SELL -------------------- */

app.post(
  '/api/orders',
  auth,
  asyncRoute(async (req, res) => {
    const { symbol, type, quantity } = req.body || {};
    const normalizedType = String(type || '').toUpperCase();
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();
    const qty = Number(quantity);

    if (
      !['BUY', 'SELL'].includes(normalizedType) ||
      !normalizedSymbol ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      qty > 1000000
    ) {
      return res.status(400).json({
        error:
          'Choose a valid stock, BUY or SELL, and a whole-share quantity greater than zero.',
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const accountResult = await client.query(
        `SELECT *
         FROM user_accounts
         WHERE user_id = $1
         ORDER BY account_id
         LIMIT 1
         FOR UPDATE`,
        [req.user.user_id]
      );

      if (!accountResult.rowCount) {
        throw Object.assign(new Error('Trading account not found.'), {
          status: 404,
        });
      }

      const account = accountResult.rows[0];

      const stockResult = await client.query(
        `SELECT *
         FROM stocks_master
         WHERE symbol = $1
         FOR UPDATE`,
        [normalizedSymbol]
      );

      if (!stockResult.rowCount) {
        throw Object.assign(new Error('Stock not found.'), {
          status: 404,
        });
      }

      const stock = stockResult.rows[0];
      const price = Number(stock.current_price);

      if (!Number.isFinite(price) || price <= 0) {
        throw Object.assign(new Error('The stock price is unavailable.'), {
          status: 400,
        });
      }

      const total = roundMoney(price * qty);

      const portfolioResult = await client.query(
        `SELECT *
         FROM user_portfolios
         WHERE account_id = $1 AND stock_id = $2
         FOR UPDATE`,
        [account.account_id, stock.stock_id]
      );

      const holding = portfolioResult.rows[0];

      if (normalizedType === 'BUY' && Number(account.cash_balance) < total) {
        throw Object.assign(
          new Error('Insufficient cash balance for this paper order.'),
          { status: 400 }
        );
      }

      if (
        normalizedType === 'SELL' &&
        (!holding || Number(holding.quantity_held) < qty)
      ) {
        throw Object.assign(
          new Error('You do not own enough shares to sell.'),
          { status: 400 }
        );
      }

      const oldQty = holding ? Number(holding.quantity_held) : 0;
      const oldAvg = holding ? Number(holding.average_buy_price) : 0;

      const realizedPnl =
        normalizedType === 'SELL'
          ? roundMoney((price - oldAvg) * qty)
          : null;

      const orderResult = await client.query(
        `INSERT INTO order_book(
           account_id, stock_id, order_type, quantity, target_price, status
         )
         VALUES($1, $2, $3, $4, $5, 'EXECUTED')
         RETURNING *`,
        [account.account_id, stock.stock_id, normalizedType, qty, price]
      );

      const order = orderResult.rows[0];

      await client.query(
        `INSERT INTO trade_execution_ledger(
           order_id,
           execution_price,
           executed_quantity,
           total_value,
           realized_pnl
         )
         VALUES($1, $2, $3, $4, $5)`,
        [order.order_id, price, qty, total, realizedPnl]
      );

      const delta = normalizedType === 'BUY' ? -total : total;
      const newBalance = roundMoney(Number(account.cash_balance) + delta);

      await client.query(
        `UPDATE user_accounts
         SET cash_balance = $1
         WHERE account_id = $2`,
        [newBalance, account.account_id]
      );

      await client.query(
        `INSERT INTO balance_history(
           account_id, change_amount, balance_after, reason
         )
         VALUES($1, $2, $3, $4)`,
        [
          account.account_id,
          delta,
          newBalance,
          `${normalizedType} ${qty} ${stock.symbol}`,
        ]
      );

      if (normalizedType === 'BUY') {
        const newQty = oldQty + qty;
        const averageBuyPrice =
          (oldQty * oldAvg + qty * price) / newQty;

        if (holding) {
          await client.query(
            `UPDATE user_portfolios
             SET quantity_held = $1, average_buy_price = $2
             WHERE portfolio_id = $3`,
            [newQty, averageBuyPrice, holding.portfolio_id]
          );
        } else {
          await client.query(
            `INSERT INTO user_portfolios(
               account_id, stock_id, quantity_held, average_buy_price
             )
             VALUES($1, $2, $3, $4)`,
            [account.account_id, stock.stock_id, qty, price]
          );
        }
      } else {
        const remaining = oldQty - qty;

        if (remaining === 0) {
          await client.query(
            'DELETE FROM user_portfolios WHERE portfolio_id = $1',
            [holding.portfolio_id]
          );
        } else {
          await client.query(
            `UPDATE user_portfolios
             SET quantity_held = $1
             WHERE portfolio_id = $2`,
            [remaining, holding.portfolio_id]
          );
        }
      }

      await client.query(
        `INSERT INTO audit_log(
           user_id, entity_name, entity_id, action, after_state
         )
         VALUES($1, $2, $3, $4, $5::jsonb)`,
        [
          req.user.user_id,
          'order_book',
          order.order_id,
          'INSERT',
          JSON.stringify({
            symbol: stock.symbol,
            type: normalizedType,
            quantity: qty,
            price,
            total,
            realized_pnl: realizedPnl,
          }),
        ]
      );

      await client.query('COMMIT');

      res.status(201).json({
        message: `Paper ${normalizedType.toLowerCase()} executed at $${price.toFixed(2)}.`,
        order_id: order.order_id,
        symbol: stock.symbol,
        type: normalizedType,
        quantity: qty,
        execution_price: price,
        total_value: total,
        realized_pnl: realizedPnl,
        cash_balance: newBalance,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

/* -------------------- PRODUCTION FRONTEND -------------------- */

if (process.env.NODE_ENV === 'production') {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const here = path.dirname(fileURLToPath(import.meta.url));

  app.use(express.static(path.resolve(here, '../../client/dist')));

  app.get('*', (_req, res) =>
    res.sendFile(path.resolve(here, '../../client/dist/index.html'))
  );
}

/* -------------------- ERROR HANDLER -------------------- */

app.use((error, _req, res, _next) => {
  console.error(error);

  res.status(error.status || 500).json({
    error:
      error.code === '23505'
        ? 'That value is already in use.'
        : error.status
          ? error.message
          : 'Unexpected server error.',
  });
});

app.listen(PORT, () => {
  console.log(`ApexTrade API listening on port ${PORT}`);
});
