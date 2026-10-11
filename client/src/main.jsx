
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  TrendingUp,
  Wallet,
  ArrowLeftRight
} from 'lucide-react';
import './style.css';

const API = '/api';

const fmt = n =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number.isFinite(Number(n)) ? Number(n) : 0);

const time = s => (s ? new Date(s).toLocaleString() : '—');

function readSavedUser() {
  try {
    return JSON.parse(localStorage.getItem('apex_user') || 'null');
  } catch {
    return null;
  }
}

function App() {
  const [token, setToken] = useState(
    localStorage.getItem('apex_token') || ''
  );

  const [user, setUser] = useState(readSavedUser);

  const [authMode, setAuthMode] = useState('login');
  const [auth, setAuth] = useState({
    username: '',
    email: '',
    password: '',
    role: 'Retail'
  });

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState('Overview');

  const [market, setMarket] = useState([]);
  const [live, setLive] = useState(false);
  const [data, setData] = useState(null);

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('AAPL');
  const [orderType, setOrderType] = useState('BUY');
  const [qty, setQty] = useState('1');
  const [notice, setNotice] = useState('');

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }),
    [token]
  );

  async function request(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: { ...headers, ...opts.headers }
    });

    const j = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(j.error || 'Request failed');
    }

    return j;
  }

  async function loadMarket() {
    try {
      const m = await request('/market');
      setMarket(m.stocks || []);
      setLive(Boolean(m.live));
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadDash() {
    try {
      setData(await request('/dashboard'));
    } catch (e) {
      if (e.message.toLowerCase().includes('sign in')) {
        logout();
      } else {
        setError(e.message);
      }
    }
  }

  useEffect(() => {
    loadMarket();

    const timer = setInterval(loadMarket, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!token) return;

    loadDash();

    const timer = setInterval(loadDash, 15000);
    return () => clearInterval(timer);
  }, [token]);

  function logout() {
    localStorage.removeItem('apex_token');
    localStorage.removeItem('apex_user');

    setToken('');
    setUser(null);
    setData(null);
    setError('');
    setNotice('');
    setPage('Overview');
  }

  async function submitAuth(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const result = await request(
        authMode === 'login' ? '/auth/login' : '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(auth)
        }
      );

      localStorage.setItem('apex_token', result.token);
      localStorage.setItem('apex_user', JSON.stringify(result.user));

      setToken(result.token);
      setUser(result.user);
      setPage('Overview');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder(e) {
    e.preventDefault();
    setError('');
    setNotice('');

    const quantity = Number(qty);

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Please enter a whole number of shares greater than zero.');
      return;
    }

    try {
      const result = await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          symbol: selected,
          type: orderType,
          quantity
        })
      });

      setNotice(result.message || 'Your paper order was submitted.');
      await loadDash();
    } catch (e) {
      setError(e.message);
    }
  }

  const positions = data?.positions || [];
  const orders = data?.orders || [];
  const ledger = data?.ledger || [];
  const balances = data?.balanceHistory || [];

  const stock =
    market.find(s => s.symbol === selected) || market[0];

  const selectedPosition = positions.find(
    p => p.symbol === selected
  );

  const filtered = market.filter(s =>
    `${s.symbol} ${s.company_name || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const estimatedOrderValue =
    Number(stock?.current_price || 0) * Number(qty || 0);

  // Prefer the latest market quote for Trade Analysis.
  // Fall back to the position's saved price if no market quote exists.
 
  // Prefer the latest market quote, then fall back to the saved position price.
  const rawAnalysisPrice =
    stock?.current_price ?? selectedPosition?.current_price;

  const analysisPrice =
    rawAnalysisPrice == null || rawAnalysisPrice === ''
      ? 0
      : Number(rawAnalysisPrice);

  const hasAnalysisPrice =
    Number.isFinite(analysisPrice) && analysisPrice > 0;

  const heldShares = Number(
    selectedPosition?.quantity_held || 0
  );

  const averageBuyPrice = Number(
    selectedPosition?.average_buy_price || 0
  );

  const analysisPositionValue = selectedPosition
    ? hasAnalysisPrice
      ? heldShares * analysisPrice
      : Number(selectedPosition.market_value || 0)
    : 0;

  const savedPnl = Number(selectedPosition?.unrealized_pnl);

  const analysisPnl = selectedPosition
    ? hasAnalysisPrice && averageBuyPrice > 0
      ? (analysisPrice - averageBuyPrice) * heldShares
      : Number.isFinite(savedPnl)
        ? savedPnl
        : 0
    : 0;

  const nav = [
    ['Overview', LayoutDashboard],
    ['Markets', BarChart3],
    ['Portfolio', BriefcaseBusiness],
    ['Orders', ArrowLeftRight],
    ['Balance history', History]
  ];

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-art">
          <div className="brand">
            <div className="brand-icon"><Activity /></div>
            <span>APEX<span className="accent">TRADE</span></span>
          </div>

          <div className="hero-copy">
            <span className="eyebrow">YOUR MARKET. YOUR STRATEGY.</span>
            <h1>Trade smarter.<br /><em>Learn by doing.</em></h1>
            <p>
              A clean paper-trading workspace to track the market,
              test strategies, and understand your portfolio.
            </p>

            <div className="mini-stats">
              <div><strong>15</strong><span>Market symbols</span></div>
              <div><strong>$100K</strong><span>Starting paper cash</span></div>
              <div><strong>24/7</strong><span>Practice workspace</span></div>
            </div>
          </div>

          <div className="auth-foot">
            APEXTRADE · PAPER TRADING ENVIRONMENT
          </div>
        </div>

        <div className="auth-panel">
          <div className="mobile-brand brand">
            <div className="brand-icon"><Activity /></div>
            <span>APEX<span className="accent">TRADE</span></span>
          </div>

          <div className="auth-card">
            <span className="eyebrow">
              {authMode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}
            </span>

            <h2>
              {authMode === 'login'
                ? 'Sign in to ApexTrade'
                : 'Create your account'}
            </h2>

            <p className="muted">
              {authMode === 'login'
                ? 'Pick up where your strategy left off.'
                : 'Set up your paper-trading workspace in seconds.'}
            </p>

            <form onSubmit={submitAuth}>
              {authMode === 'register' && (
                <>
                  <label>Username</label>
                  <input
                    required
                    value={auth.username}
                    onChange={e =>
                      setAuth({ ...auth, username: e.target.value })
                    }
                    placeholder="Your display name"
                  />

                  <label>Trader role</label>
                  <select
                    value={auth.role}
                    onChange={e =>
                      setAuth({ ...auth, role: e.target.value })
                    }
                  >
                    <option>Retail</option>
                    <option>Portfolio Manager</option>
                    <option>Auditor</option>
                  </select>
                </>
              )}

              <label>Email address</label>
              <input
                type="email"
                required
                value={auth.email}
                onChange={e =>
                  setAuth({ ...auth, email: e.target.value })
                }
                placeholder="you@example.com"
              />

              <label>Password</label>
              <input
                type="password"
                minLength="8"
                required
                value={auth.password}
                onChange={e =>
                  setAuth({ ...auth, password: e.target.value })
                }
                placeholder="At least 8 characters"
              />

              {error && <div className="alert">{error}</div>}

              <button className="primary full" disabled={busy}>
                {busy
                  ? 'Please wait…'
                  : authMode === 'login'
                    ? 'Sign in'
                    : 'Create account'}
                {' '}<ArrowUpRight size={17} />
              </button>
            </form>

            <div className="auth-switch">
              {authMode === 'login'
                ? 'New to ApexTrade?'
                : 'Already have an account?'}
              {' '}
              <button
                onClick={() => {
                  setAuthMode(
                    authMode === 'login' ? 'register' : 'login'
                  );
                  setError('');
                }}
              >
                {authMode === 'login' ? 'Create account' : 'Sign in'}
              </button>
            </div>

            <div className="secure-note">
              <ShieldCheck size={15} />
              Passwords are securely hashed. Paper trading only.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Activity /></div>
          <span>APEX<span className="accent">TRADE</span></span>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? 'nav-item active' : 'nav-item'}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              {name}
              {name === 'Orders' && orders.length > 0 && (
                <span className="nav-count">{orders.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="market-status">
            <span className="live-dot" />
            <div>
              <b>{live ? 'Market data connected' : 'Market watch ready'}</b>
              <small>
                {live ? 'Quotes via Finnhub' : 'Sample quotes · add API key'}
              </small>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">
              {(user?.username || 'T').slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-meta">
              <b>{user?.username || 'Trader'}</b>
              <small>{user?.role || 'Retail'}</small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace <span>/</span> {page}</div>
            <h1>{page === 'Overview' ? 'Market overview' : page}</h1>
          </div>

          <div className="top-actions">
            <span className="paper-badge"><span /> PAPER ACCOUNT</span>
            <button className="user-pill" onClick={logout}>
              <div className="avatar small">
                {(user?.username || 'T').slice(0, 1).toUpperCase()}
              </div>
              <span>{user?.username}</span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>

        {error && (
          <div className="alert global-alert">
            {error}
            <button onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        {page === 'Overview' && (
          <>
            <div className="welcome-row">
              <div>
                <h2>
                  Good to see you, {user?.username?.split(' ')[0] || 'Trader'}
                  {' '}<span>✦</span>
                </h2>
                <p className="muted">
                  Here’s how your paper portfolio is performing.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setPage('Markets')}
              >
                <TrendingUp size={16} /> Explore markets
              </button>
            </div>

            <div className="stat-grid">
              <Stat
                icon={Wallet}
                label="Available cash"
                value={fmt(data?.account?.cash_balance)}
                note="Ready to deploy"
              />
              <Stat
                icon={BriefcaseBusiness}
                label="Portfolio value"
                value={fmt(data?.summary?.positions_value)}
                note={`${positions.length} open positions`}
              />
              <Stat
                icon={TrendingUp}
                label="Total paper equity"
                value={fmt(data?.summary?.equity ?? 100000)}
                note="Cash + market value"
              />
              <Stat
                icon={Activity}
                label="Unrealized P&L"
                value={fmt(
                  positions.reduce(
                    (sum, p) => sum + Number(p.unrealized_pnl || 0),
                    0
                  )
                )}
                note="Open positions only"
              />
            </div>

            <div className="content-grid">
              <section className="panel chart-panel">
                <div className="panel-head">
                  <div>
                    <h3>Market snapshot</h3>
                    <p className="muted">
                      Select a symbol to explore its chart
                    </p>
                  </div>

                  <select
                    className="compact-select"
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                  >
                    {market.map(s => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="chart-summary">
                  <div>
                    <strong>
                      {stock ? fmt(stock.current_price) : '—'}
                    </strong>
                    <span className={
                      Number(stock?.change_pct || 0) >= 0
                        ? 'positive'
                        : 'negative'
                    }>
                      <TrendingUp size={14} />
                      {stock?.change_pct != null
                        ? `${Number(stock.change_pct) > 0 ? '+' : ''}${Number(stock.change_pct).toFixed(2)}%`
                        : 'Watchlist'}
                    </span>
                  </div>
                  <span className="muted small-text">
                    {stock?.company_name || ''}
                  </span>
                </div>

                <TradingView symbol={selected} />

                {/* Trade Analysis */}
                <div className="trade-analysis">
                  <div className="trade-analysis-heading">
                    <div className="analysis-title-wrap">
                      <div className="analysis-icon">
                        <Activity size={20} />
                      </div>
                      <div>
                        <h3>Trade Analysis</h3>
                        <p className="muted">
                          Performance breakdown for {selected}
                        </p>
                      </div>
                    </div>

                    <span className="analysis-live-badge">
                      <span className="analysis-live-dot" />
                      PAPER POSITION
                    </span>
                  </div>

                  <div className="analysis-stock-banner">
                    <div className="analysis-stock-info">
                      <div className="analysis-stock-logo">
                        {(selected || '?').slice(0, 1)}
                      </div>
                      <div>
                        <strong>{selected}</strong>
                        <span>{stock?.company_name || 'Selected stock'}</span>
                      </div>
                    </div>

                    <div className="analysis-price-info">
                      <span>Latest price</span>
                      <strong>
                        {hasAnalysisPrice ? fmt(analysisPrice) : '—'}
                      </strong>
                      <small className={
                        stock?.change_pct == null
                          ? 'muted'
                          : Number(stock.change_pct) >= 0
                            ? 'positive'
                            : 'negative'
                      }>
                        {stock?.change_pct != null
                          ? `${Number(stock.change_pct) > 0 ? '+' : ''}${Number(stock.change_pct).toFixed(2)}%`
                          : 'Daily change unavailable'}
                      </small>
                    </div>
                  </div>

                  <div className="trade-analysis-grid">
                    <div className="analysis-metric metric-shares">
                      <span className="metric-label">
                        <BriefcaseBusiness size={15} />
                        Shares held
                      </span>
                      <strong>{heldShares}</strong>
                      <small>Your current position</small>
                    </div>

                    <div className="analysis-metric metric-average">
                      <span className="metric-label">
                        <Wallet size={15} />
                        Average buy price
                      </span>
                      <strong>
                        {selectedPosition
                          ? fmt(averageBuyPrice)
                          : '—'}
                      </strong>
                      <small>Your average entry</small>
                    </div>

                    <div className="analysis-metric metric-value">
                      <span className="metric-label">
                        <BarChart3 size={15} />
                        Position value
                      </span>
                      <strong>
                        {selectedPosition
                          ? fmt(analysisPositionValue)
                          : '$0.00'}
                      </strong>
                      <small>
                        {hasAnalysisPrice
                          ? 'Based on latest available quote'
                          : 'Using saved position value if available'}
                      </small>
                    </div>

                    <div className={
                      `analysis-metric metric-pnl ${
                        analysisPnl < 0
                          ? 'metric-loss'
                          : 'metric-profit'
                      }`
                    }>
                      <span className="metric-label">
                        <TrendingUp size={15} />
                        Unrealized P&amp;L
                      </span>
                      <strong className={
                        !selectedPosition
                          ? ''
                          : analysisPnl >= 0
                            ? 'positive'
                            : 'negative'
                      }>
                        {selectedPosition ? fmt(analysisPnl) : '$0.00'}
                      </strong>
                      <small>
                        {selectedPosition
                          ? 'Current paper profit/loss'
                          : 'No active position'}
                      </small>
                    </div>
                  </div>

                  {!selectedPosition && (
                    <div className="analysis-note">
                      <div className="analysis-note-icon">
                        <TrendingUp size={18} />
                      </div>
                      <div>
                        <strong>No position in {selected} yet</strong>
                        <p>
                          Place a paper BUY order using the Quick Order panel
                          to start tracking your shares, entry price, and P&amp;L here.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="analysis-action"
                        onClick={() => {
                          setOrderType('BUY');
                          setNotice('');
                          document.querySelector('.order-panel')?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                          });
                        }}
                      >
                        Trade <ArrowUpRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel order-panel">
                <div className="panel-head">
                  <div>
                    <h3>Quick order</h3>
                    <p className="muted">Execute a simulated trade</p>
                  </div>
                  <span className="pill">PAPER</span>
                </div>

                <form onSubmit={submitOrder} className="order-form">
                  <div className="switcher">
                    <button
                      type="button"
                      className={orderType === 'BUY' ? 'buy selected' : 'buy'}
                      onClick={() => {
                        setOrderType('BUY');
                        setNotice('');
                      }}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      className={orderType === 'SELL' ? 'sell selected' : 'sell'}
                      onClick={() => {
                        setOrderType('SELL');
                        setNotice('');
                      }}
                    >
                      Sell
                    </button>
                  </div>

                  <label>Stock symbol</label>
                  <select
                    value={selected}
                    onChange={e => {
                      setSelected(e.target.value);
                      setNotice('');
                    }}
                  >
                    {market.map(s => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.symbol} — {s.company_name}
                      </option>
                    ))}
                  </select>

                  <label>Quantity (shares)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                    required
                  />

                  <div className="order-estimate">
                    <span>Estimated order value</span>
                    <b>{fmt(estimatedOrderValue)}</b>
                  </div>

                  <button className="primary full" disabled={!market.length}>
                    {orderType === 'BUY' ? 'Buy shares' : 'Sell shares'}
                    {' '}<ArrowUpRight size={16} />
                  </button>

                  {notice && <div className="success">{notice}</div>}

                  <p className="fine-print">
                    <ShieldCheck size={13} />
                    Orders execute at the latest price available to this app.
                  </p>
                </form>
              </section>
            </div>

            <div className="content-grid lower-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Market watch</h3>
                    <p className="muted">Your daily shortlist</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage('Markets')}
                  >
                    View all <ArrowUpRight size={14} />
                  </button>
                </div>
                <MarketTable
                  rows={market.slice(0, 7)}
                  onSelect={s => {
                    setSelected(s);
                    setNotice('Market selected');
                  }}
                />
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Recent orders</h3>
                    <p className="muted">Your latest activity</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage('Orders')}
                  >
                    View history <ArrowUpRight size={14} />
                  </button>
                </div>
                <OrderTable rows={orders.slice(0, 5)} />
              </section>
            </div>
          </>
        )}

        {page === 'Markets' && (
          <div className="market-layout">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Explore the market</h3>
                  <p className="muted">15 widely followed US stocks</p>
                </div>
                <div className="searchbox">
                  <Search size={15} />
                  <input
                    placeholder="Search symbols or companies"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <MarketTable
                rows={market.slice(0,7)}
                positions={positions}
                onSelect={s =>{
                    setSelected(s);
                    setPage('Markets');
                }}
              />
            
            </section>
          </div>
        )}

        {page === 'Portfolio' && (
          <>
            <div className="stat-grid compact-stats">
              <Stat
                icon={BriefcaseBusiness}
                label="Open positions"
                value={positions.length}
                note="Stocks held"
              />
              <Stat
                icon={Wallet}
                label="Cash balance"
                value={fmt(data?.account?.cash_balance)}
                note="Available cash"
              />
              <Stat
                icon={TrendingUp}
                label="Market value"
                value={fmt(data?.summary?.positions_value)}
                note="Current holdings"
              />
              <Stat
                icon={Activity}
                label="Unrealized P&L"
                value={fmt(
                  positions.reduce(
                    (sum, p) => sum + Number(p.unrealized_pnl || 0),
                    0
                  )
                )}
                note="Open positions"
              />
            </div>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Your holdings</h3>
                  <p className="muted">
                    Average entry compared with current quote
                  </p>
                </div>
              </div>

              {positions.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Shares</th>
                        <th>Avg. buy</th>
                        <th>Market price</th>
                        <th>Market value</th>
                        <th>Unrealized P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(p => (
                        <tr key={p.portfolio_id}>
                          <td>
                            <Asset symbol={p.symbol} name={p.company_name} />
                          </td>
                          <td>{p.quantity_held}</td>
                          <td>{fmt(p.average_buy_price)}</td>
                          <td>{fmt(p.current_price)}</td>
                          <td>{fmt(p.market_value)}</td>
                          <td className={
                            Number(p.unrealized_pnl) >= 0
                              ? 'positive'
                              : 'negative'
                          }>
                            {fmt(p.unrealized_pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Your portfolio is waiting"
                  text="Place a paper BUY order to see holdings here."
                  action={() => setPage('Markets')}
                />
              )}
            </section>
          </>
        )}

        {page === 'Orders' && (
          <>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Order history</h3>
                  <p className="muted">All submitted paper orders</p>
                </div>
                <span className="pill">{orders.length} orders</span>
              </div>
              <OrderTable rows={orders} full />
            </section>

            <section className="panel spaced">
              <div className="panel-head">
                <div>
                  <h3>Trade execution ledger</h3>
                  <p className="muted">
                    Settled executions recorded by the database
                  </p>
                </div>
              </div>

              {ledger.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Execution</th>
                        <th>Order</th>
                        <th>Asset</th>
                        <th>Side</th>
                        <th>Shares</th>
                        <th>Execution price</th>
                        <th>Total value</th>
                        <th>Executed at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map(l => (
                        <tr key={l.execution_id}>
                          <td>EX-{l.execution_id}</td>
                          <td>#{l.order_id}</td>
                          <td><Asset symbol={l.symbol} /></td>
                          <td>
                            <span className={
                              l.order_type === 'BUY'
                                ? 'tag buy-tag'
                                : 'tag sell-tag'
                            }>
                              {l.order_type}
                            </span>
                          </td>
                          <td>{l.executed_quantity}</td>
                          <td>{fmt(l.execution_price)}</td>
                          <td>{fmt(l.total_value)}</td>
                          <td>{time(l.executed_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No executions yet"
                  text="Your completed paper orders will appear here."
                />
              )}
            </section>
          </>
        )}

        {page === 'Balance history' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Balance history</h3>
                <p className="muted">
                  A ledger of cash changes in your trading account
                </p>
              </div>
              <span className="pill">{balances.length} entries</span>
            </div>

            {balances.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Reason</th>
                      <th>Change</th>
                      <th>Balance after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map(b => (
                      <tr key={b.balance_history_id}>
                        <td>{time(b.created_at)}</td>
                        <td>{b.reason}</td>
                        <td className={
                          Number(b.change_amount) >= 0
                            ? 'positive'
                            : 'negative'
                        }>
                          {Number(b.change_amount) >= 0 ? '+' : ''}
                          {fmt(b.change_amount)}
                        </td>
                        <td><b>{fmt(b.balance_after)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No balance activity yet"
                text="Your initial balance and future trades will be recorded here."
              />
            )}
          </section>
        )}

        <footer className="footer">
          <span>© 2026 ApexTrade</span>
          <span>
            <ShieldCheck size={13} />
            Paper trading only · Not financial advice
          </span>
          <span>Market quotes: {live ? 'Finnhub' : 'sample/cached'}</span>
        </footer>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, note }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon"><Icon size={17} /></div>
      </div>
      <strong>{value ?? '—'}</strong>
      <small>{note}</small>
    </div>
  );
}

function Asset({ symbol, name }) {
  return (
    <div className="asset">
      <div className="asset-logo">
        {(symbol || '?').slice(0, 1)}
      </div>
      <div>
        <b>{symbol}</b>
        {name && <small>{name}</small>}
      </div>
    </div>
  );
}


function MarketTable({ rows, onSelect, positions = [] }) {
  const positionBySymbol = new Map(
    positions.map(p => [p.symbol, p])
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Last price</th>
            <th>Change</th>
            <th>Shares owned</th>
            <th>Avg. buy price</th>
            <th>Market value</th>
            <th>Unrealized P&amp;L</th>
            <th>Source</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {rows.map(s => {
            const position = positionBySymbol.get(s.symbol);
            const shares = Number(position?.quantity_held || 0);
            const currentPrice = Number(s.current_price || 0);
            const averagePrice = Number(
              position?.average_buy_price || 0
            );

            const marketValue = shares * currentPrice;
            const pnl = shares > 0
              ? (currentPrice - averagePrice) * shares
              : 0;

            const pnlPercent =
              shares > 0 && averagePrice > 0
                ? ((currentPrice - averagePrice) / averagePrice) * 100
                : null;

            return (
              <tr
                key={s.symbol}
                onClick={() => onSelect?.(s.symbol)}
                className={onSelect ? 'clickable' : ''}
              >
                <td>
                  <Asset
                    symbol={s.symbol}
                    name={s.company_name}
                  />
                </td>

                <td><b>{fmt(currentPrice)}</b></td>

                <td className={
                  Number(s.change_pct || 0) >= 0
                    ? 'positive'
                    : 'negative'
                }>
                  {s.change_pct == null
                    ? '—'
                    : `${Number(s.change_pct) >= 0 ? '+' : ''}${Number(s.change_pct).toFixed(2)}%`}
                </td>

                <td>
                  <b>{shares}</b>
                  {shares > 0 && (
                    <small className="market-owned-label">
                      Owned
                    </small>
                  )}
                </td>

                <td>
                  {shares > 0 ? fmt(averagePrice) : '—'}
                </td>

                <td>
                  {shares > 0 ? fmt(marketValue) : '—'}
                </td>

                <td className={
                  shares === 0
                    ? ''
                    : pnl >= 0
                      ? 'positive'
                      : 'negative'
                }>
                  {shares > 0 ? (
                    <>
                      <b>{pnl > 0 ? '+' : ''}{fmt(pnl)}</b>
                      {pnlPercent !== null && (
                        <small className="market-pnl-percent">
                          {pnlPercent > 0 ? '+' : ''}
                          {pnlPercent.toFixed(2)}%
                        </small>
                      )}
                    </>
                  ) : '—'}
                </td>

                <td>
                  <span className="source-label">
                    {s.source === 'Finnhub'
                      ? 'Live quote'
                      : s.source === 'cached'
                        ? 'Cached'
                        : 'Sample'}
                  </span>
                </td>

                <td><ArrowUpRight size={14} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!rows.length && (
        <div className="empty-inline">
          No matching stocks found.
        </div>
      )}
    </div>
  );
}

function OrderTable({ rows }) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Asset</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.order_id}>
              <td>#{o.order_id}</td>
              <td><Asset symbol={o.symbol} /></td>
              <td>
                <span className={
                  o.order_type === 'BUY'
                    ? 'tag buy-tag'
                    : 'tag sell-tag'
                }>
                  {o.order_type}
                </span>
              </td>
              <td>{o.quantity}</td>
              <td>{fmt(o.target_price)}</td>
              <td><span className="status">{o.status}</span></td>
              <td>{time(o.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No orders yet"
      text="Your order activity will appear here after your first trade."
    />
  );
}

function Empty({ title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <BriefcaseBusiness size={23} />
      </div>
      <b>{title}</b>
      <p>{text}</p>
      {action && (
        <button className="secondary" onClick={action}>
          <Plus size={15} /> Explore stocks
        </button>
      )}
    </div>
  );
}

function TradingView({ symbol }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let script = null;

    container.innerHTML = '';

    const widgetId = `tv_chart_${symbol}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    const widgetContainer = document.createElement('div');
    widgetContainer.id = widgetId;
    widgetContainer.style.width = '100%';
    widgetContainer.style.height = '100%';
    container.appendChild(widgetContainer);

    function createWidget() {
      if (cancelled || !window.TradingView) return;

      new window.TradingView.widget({
        autosize: true,
        symbol: `NASDAQ:${symbol}`,
        interval: 'D',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        allow_symbol_change: true,
        withdateranges: true,
        hide_side_toolbar: false,
        container_id: widgetId
      });
    }

    if (window.TradingView) {
      createWidget();
    } else {
      script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = createWidget;
      script.onerror = () => {
        if (!cancelled) {
          container.innerHTML =
            '<p style="padding:16px;color:#94a3b8">Chart could not load. Check your internet connection.</p>';
        }
      };
      container.appendChild(script);
    }

    return () => {
      cancelled = true;
      container.innerHTML = '';
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
    };
  }, [symbol]);

  return (
    <div
      className="tv-wrap"
      ref={containerRef}
      style={{
        width: '100%',
        height: '420px',
        minHeight: '320px'
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
