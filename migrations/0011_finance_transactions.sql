-- Migration 0011: finance_transactions
-- Apply: paste into Cloudflare D1 console (Connor is on work machine, no terminal)
-- Manual/CSV-imported financial transactions (AI spend + revenue come from existing tables)

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  direction TEXT NOT NULL DEFAULT 'out',
  category TEXT,
  source TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_tx_date ON finance_transactions(date);
CREATE INDEX IF NOT EXISTS idx_finance_tx_dir ON finance_transactions(direction);
