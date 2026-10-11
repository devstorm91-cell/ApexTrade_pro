CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(255) NOT NULL DEFAULT 'Retail' CHECK (role IN ('Retail','Portfolio Manager','Auditor')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_accounts (
  account_id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  cash_balance NUMERIC(18,2) NOT NULL DEFAULT 100000.00 CHECK (cash_balance >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD'
);
CREATE TABLE IF NOT EXISTS stocks_master (
  stock_id BIGSERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  company_name VARCHAR(255) NOT NULL,
  current_price NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (current_price > 0)
);
CREATE TABLE IF NOT EXISTS user_portfolios (
  portfolio_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES user_accounts(account_id) ON DELETE CASCADE,
  stock_id BIGINT NOT NULL REFERENCES stocks_master(stock_id),
  quantity_held INTEGER NOT NULL DEFAULT 0 CHECK (quantity_held >= 0),
  average_buy_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  UNIQUE(account_id, stock_id)
);
CREATE TABLE IF NOT EXISTS order_book (
  order_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES user_accounts(account_id) ON DELETE CASCADE,
  stock_id BIGINT NOT NULL REFERENCES stocks_master(stock_id),
  order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('BUY','SELL')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  target_price NUMERIC(18,4) NOT NULL CHECK (target_price > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','EXECUTED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS trade_execution_ledger (
  execution_id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL UNIQUE REFERENCES order_book(order_id) ON DELETE CASCADE,
  execution_price NUMERIC(18,4) NOT NULL,
  executed_quantity INTEGER NOT NULL,
  total_value NUMERIC(18,2) NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS balance_history (
  balance_history_id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES user_accounts(account_id) ON DELETE CASCADE,
  change_amount NUMERIC(18,2) NOT NULL,
  balance_after NUMERIC(18,2) NOT NULL CHECK (balance_after >= 0),
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id BIGINT,
  action VARCHAR(20) NOT NULL,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_account_created ON order_book(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_executed_at ON trade_execution_ledger(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_account_created ON balance_history(account_id, created_at DESC);
