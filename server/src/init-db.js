import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
try {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  const seeds = [
    ['AAPL','Apple Inc.',227.50],['MSFT','Microsoft Corporation',510.20],['NVDA','NVIDIA Corporation',182.30],
    ['AMZN','Amazon.com Inc.',221.40],['GOOGL','Alphabet Inc.',191.70],['META','Meta Platforms Inc.',721.50],
    ['TSLA','Tesla Inc.',350.60],['NFLX','Netflix Inc.',1210.00],['AMD','Advanced Micro Devices',158.20],
    ['INTC','Intel Corporation',24.30],['ORCL','Oracle Corporation',242.10],['JPM','JPMorgan Chase & Co.',295.40],
    ['KO','The Coca-Cola Company',70.20],['DIS','The Walt Disney Company',112.80],['UBER','Uber Technologies Inc.',94.10]
  ];
  for (const [symbol,name,price] of seeds) {
    await pool.query(`INSERT INTO stocks_master(symbol,company_name,current_price) VALUES($1,$2,$3)
      ON CONFLICT(symbol) DO NOTHING`, [symbol,name,price]);
  }
  console.log('Database schema created and stock watchlist seeded.');
} finally { await pool.end(); }
