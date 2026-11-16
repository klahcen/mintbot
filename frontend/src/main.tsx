import { ResearchPanel } from "./research";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CircleHelp,
  CircleStop,
  FlaskConical,
  Globe,
  LayoutDashboard,
  LockKeyhole,
  Play,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import "./style.css";
type Row = Record<string, any>;
type State = {
  mode: string;
  running: boolean;
  killed: boolean;
  balanceSol: number;
  strategies: Row[];
  launches: Row[];
  discoveries: Row[];
  positions: Row[];
  trades: Row[];
  alerts: Row[];
  metrics: Row;
  rpc: Row;
  realizedPnlSol: number;
};
const initial: State = {
  mode: "paper",
  running: false,
  killed: false,
  balanceSol: 0,
  strategies: [],
  launches: [],
  discoveries: [],
  positions: [],
  trades: [],
  alerts: [],
  metrics: {},
  rpc: { status: "offline" },
  realizedPnlSol: 0,
};
const fmt = (value: unknown, digits = 3) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: digits });
const short = (value: unknown) => {
  const s = String(value || "—");
  return s.length > 16 ? `${s.slice(0, 7)}…${s.slice(-5)}` : s;
};
const time = (value: unknown) =>
  value
    ? new Date(value as string).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
const tokenName = (r: Row) =>
  r.symbol || r.tokenSymbol || r.name || short(r.mint);
function App() {
  const [state, setState] = useState<State>(initial),
    [online, setOnline] = useState(false),
    [connectionError, setConnectionError] = useState("Backend unavailable"),
    [loaded, setLoaded] = useState(false),
    [tab, setTab] = useState("Overview"),
    [filter, setFilter] = useState(""),
    [launchFilter, setLaunchFilter] = useState("All launches"),
    [selected, setSelected] = useState<Row | null>(null),
    [panel, setPanel] = useState<"settings" | "auth" | null>(null),
    [apiToken, setApiToken] = useState(""),
    [tokenDraft, setTokenDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [draft, setDraft] = useState<Row>({}),
    [lastUpdated, setLastUpdated] = useState<Date | null>(null),
    [markPosition, setMarkPosition] = useState<Row | null>(null),
    [markDraft, setMarkDraft] = useState({ priceSol: "", liquiditySol: "" });
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", {
        headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
      });
      if (!res.ok)
        throw Error(
          res.status === 401
            ? "API token required"
            : `Backend unavailable (${res.status})`,
        );
      const data = await res.json();
      setState({ ...initial, ...data });
      setOnline(true);
      setLastUpdated(new Date());
    } catch (error) {
      setOnline(false);
      setConnectionError(
        error instanceof Error ? error.message : "Backend unavailable",
      );
    } finally {
      setLoaded(true);
    }
  }, [apiToken]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        setSelected(null);
        setMarkPosition(null);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function mutate(path: string, body: Row = {}) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw Error(
          data.error?.message ||
            data.message ||
            data.error ||
            `Request failed (${res.status})`,
        );
      setNotice(
        data.failed
          ? "Action could not complete. Check the activity feed."
          : data.reasons?.length
            ? `Replay screened: ${data.reasons.join(", ")}`
            : data.message || "Workspace updated",
      );
      await refresh();
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const pnl = Number(state.realizedPnlSol ?? 0);
  const strategy = state.strategies[0] || {};
  const reserve = Number(strategy.reserveSol ?? state.metrics.reserveSol ?? 0);
  const rows = state.launches.filter(
    (r) =>
      `${r.symbol} ${r.name} ${r.mint}`
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (launchFilter === "All launches" ||
        (launchFilter === "Risk passed"
          ? r.reasons?.length === 0
          : r.reasons?.length > 0)),
  );
  function openAuth() {
    setTokenDraft(apiToken);
    setPanel("auth");
  }
  function settings() {
    setDraft({
      name: "Conservative launch",
      kind: "launch",
      enabled: true,
      tradeSol: 0.1,
      maxTradeSol: 0.25,
      maxDailySpendSol: 1,
      maxPositions: 5,
      maxSlippageBps: 100,
      reserveSol: 1,
      maxRiskScore: 30,
      maxFailures: 3,
      minLiquiditySol: 20,
      minMarketCapSol: 0,
      maxMarketCapSol: 100000,
      minVolumeSol: 0,
      minMomentumBps: 0,
      delayMs: 0,
      maxPriceAgeMs: 15000,
      takeProfitBps: 3000,
      stopLossBps: 1500,
      trailingStopBps: 1000,
      maxHoldMs: 3600000,
      creatorAllowlist: [],
      creatorBlocklist: [],
      ...strategy,
    });
    setPanel("settings");
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Overview");
          }}
        >
          <span className="brand-icon">
            <Zap size={21} fill="currentColor" />
          </span>
          mintbot<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">TRADING WORKSPACE</div>
        <nav>
          {[
            { name: "Overview", Icon: LayoutDashboard },
            { name: "Launch monitor", Icon: Radar },
            { name: "Positions", Icon: Activity },
            { name: "Transactions", Icon: ArrowDownLeft },
            { name: "Strategies", Icon: Settings2 },
            { name: "Research", Icon: FlaskConical },
          ].map(({ name, Icon }) => (
            <button
              key={name}
              aria-label={name}
              title={name}
              className={`nav-item ${tab === name ? "active" : ""}`}
              onClick={() => setTab(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Positions" && state.positions.length > 0 && (
                <b>{state.positions.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <FlaskConical size={19} />
            <div>
              <strong>Paper environment</strong>
              <p>Simulated funds. Real insights.</p>
            </div>
          </div>
          <button className="nav-item" onClick={openAuth}>
            <LockKeyhole size={18} />
            API access
            <span className={`tiny-dot ${apiToken ? "on" : ""}`} />
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setNotice(
                "Mintbot uses synthetic paper execution. Start the engine, then run a replay to explore launch screening and simulated fills. No wallet or real funds are connected.",
              );
            }}
          >
            <CircleHelp size={18} />
            Workspace guide
          </button>
          <div className="version">
            <span>Mintbot terminal</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumbs">
            Workspace <ChevronRight size={14} />
            <span>{tab}</span>
          </div>
          <div className="header-status">
            <span className="paper-badge">
              <FlaskConical size={12} /> PAPER MODE
            </span>
            <span className="divider" />
            <span className="connection">
              <i className={`tiny-dot ${online ? "on" : ""}`} />
              {online
                ? "API connected"
                : connectionError === "API token required"
                  ? "API locked"
                  : "API offline"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh state"
              onClick={refresh}
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="avatar"
              title="API access"
              aria-label="API access"
              onClick={openAuth}
            >
              M
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="mint-text">SOLANA</span>
                <span>/</span>TRADING TERMINAL
              </div>
              <h1>{tab === "Overview" ? "Your trading, in focus." : tab}</h1>
              <p>
                {tab === "Overview"
                  ? "Monitor new launches, manage positions, and keep your edge."
                  : tab === "Launch monitor"
                    ? "Inspect launch signals and the checks behind every decision."
                    : tab === "Positions"
                      ? "Track simulated exposure and manage your open positions."
                      : tab === "Transactions"
                        ? "An auditable record of every paper fill."
                        : tab === "Research"
                          ? "Inspect source-attributed read-only research and its limits."
                          : "Define your entry rules and manage trading risk."}
              </p>
            </div>
            {tab !== "Research" && <div className="heading-actions">
              <button className="button secondary" onClick={settings}>
                <Settings2 size={15} /> Configure
              </button>
              <button
                disabled={!online || busy || state.killed}
                className={`button ${state.running ? "secondary" : "primary"}`}
                onClick={() =>
                  mutate("control", {
                    action: state.running ? "stop" : "start",
                  })
                }
              >
                {state.running ? (
                  <Square size={14} />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
                {state.running ? "Stop engine" : "Start engine"}
              </button>
            </div>}
          </div>
          {!online && loaded && (
            <div className="banner warning">
              <Globe size={16} />
              <span>
                {connectionError === "API token required"
                  ? "Enter your API access token to connect this workspace."
                  : "Backend unavailable. Start the local API to load your workspace."}
              </span>
              <button onClick={openAuth}>
                API access
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          {state.killed && (
            <div className="banner warning">
              <CircleStop size={16} />
              Emergency stop is active. Reset the workspace to enable the
              engine.
              <button
                onClick={() => mutate("control", { action: "reset" })}
                disabled={busy}
              >
                Reset
              </button>
            </div>
          )}
          {notice && (
            <div className="banner">
              <Bell size={16} />
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {tab !== "Research" && <div className="metrics">
            <Metric
              label="Paper balance"
              value={`${fmt(state.balanceSol)} SOL`}
              foot="Simulated wallet"
              icon={<Wallet size={17} />}
            />
            <Metric
              label="Realized P&L"
              value={`${pnl > 0 ? "+" : ""}${fmt(pnl, 4)} SOL`}
              foot={`${state.trades.length} recorded transactions`}
              icon={<ArrowUpRight size={17} />}
              positive={pnl > 0}
            />
            <Metric
              label="Open positions"
              value={String(state.positions.length).padStart(2, "0")}
              foot={`${fmt(state.positions.reduce((sum, r) => sum + Number(r.costSol ?? r.amountSol ?? 0), 0))} SOL allocated`}
              icon={<Activity size={17} />}
            />
            <Metric
              label="Launches screened"
              value={fmt(
                state.metrics.launchesScreened ?? state.launches.length,
                0,
              )}
              foot="Current paper session"
              icon={<Radar size={17} />}
            />
          </div>
          }
          <div className={`content-grid ${tab === "Research" ? "research-layout" : ""}`}>
            <section className="primary-content">
              {tab === "Research" && <ResearchPanel apiToken={apiToken}/>} 
              {(tab === "Overview" || tab === "Launch monitor") && (
                <section className="card launch-card">
                  <div className="card-heading">
                    <div>
                      <div className="section-title">
                        <span className="live-dot" />
                        Launch monitor
                        <span className="count">{state.launches.length}</span>
                      </div>
                      <p>Synthetic launches with inspectable risk screening.</p>
                    </div>
                    <button
                      className="button compact secondary"
                      disabled={!online || busy}
                      onClick={() => mutate("replay")}
                    >
                      <Play size={12} />
                      Run replay
                    </button>
                  </div>
                  <div className="table-toolbar">
                    <div className="filter-tabs">
                      {["All launches", "Risk passed", "Filtered"].map(
                        (label) => (
                          <button
                            key={label}
                            className={launchFilter === label ? "selected" : ""}
                            onClick={() => setLaunchFilter(label)}
                          >
                            {label}
                          </button>
                        ),
                      )}
                    </div>
                    <label className="search">
                      <Search size={14} />
                      <input
                        aria-label="Search launches"
                        placeholder="Search token or mint"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Token</th>
                          <th>Liquidity</th>
                          <th>Source</th>
                          <th>Risk checks</th>
                          <th>Detected</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr
                            key={r.id || r.mint || i}
                            onClick={() => setSelected(r)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setSelected(r);
                            }}
                          >
                            <td>
                              <Token row={r} />
                            </td>
                            <td>
                              {fmt(r.liquiditySol ?? r.liquidity)}{" "}
                              <small>SOL</small>
                            </td>
                            <td>
                              <span className="source">
                                {r.platform || r.source || "Replay"}
                              </span>
                            </td>
                            <td>
                              <Status
                                value={
                                  r.reasons?.length
                                    ? "filtered"
                                    : r.riskScore !== undefined
                                      ? "passed"
                                      : "pending"
                                }
                              />
                            </td>
                            <td className="muted">
                              {time(r.detectedAt || r.createdAt || r.timestamp)}
                            </td>
                            <td>
                              <ChevronRight size={15} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length === 0 && (
                      <Empty
                        Icon={Radar}
                        title={
                          filter || launchFilter !== "All launches"
                            ? "No matching launches"
                            : "Waiting for the next opportunity"
                        }
                        description={
                          filter || launchFilter !== "All launches"
                            ? "Adjust your filters to see more launches."
                            : "Run a synthetic replay to see launch screening in action."
                        }
                      />
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      <ShieldCheck size={13} />
                      Synthetic replay data · no mainnet execution
                    </span>
                    <span>
                      {rows.length} launch{rows.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                </section>
              )}
              {tab === "Launch monitor" && (
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <div className="section-title">
                        Chain discoveries
                        <span className="count">
                          {state.discoveries.length}
                        </span>
                      </div>
                      <p>
                        Verified Pump create-event decodes. Observation only.
                      </p>
                    </div>
                    <span className="status-pill">Read only</span>
                  </div>
                  {state.discoveries.length === 0 ? (
                    <Empty
                      Icon={Globe}
                      title="No chain discoveries yet"
                      description="When a configured chain monitor observes a supported launch event, its decoded details appear here."
                      compact
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Token / mint</th>
                            <th>Protocol</th>
                            <th>Slot</th>
                            <th>Price</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.discoveries.map((r, i) => (
                            <tr
                              key={`${r.signature}:${r.mint}:${i}`}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  setSelected({
                                    ...r,
                                    readOnlyDiscovery: true,
                                  });
                              }}
                              onClick={() =>
                                setSelected({ ...r, readOnlyDiscovery: true })
                              }
                            >
                              <td>
                                <Token row={r} />
                              </td>
                              <td>{r.protocol}</td>
                              <td>{fmt(r.slot, 0)}</td>
                              <td className="muted">Unknown</td>
                              <td>
                                <span className="status-pill">Unscreened</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="table-footer">
                    <span>
                      <ShieldCheck size={13} />
                      Prices, liquidity, and trade safety require separate
                      verification.
                    </span>
                  </div>
                </section>
              )}
              {(tab === "Overview" || tab === "Positions") && (
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <div className="section-title">
                        Open positions
                        <span className="count">{state.positions.length}</span>
                      </div>
                      <p>Your active paper trades at a glance.</p>
                    </div>
                    <Activity size={18} className="muted" />
                  </div>
                  {state.positions.length === 0 ? (
                    <Empty
                      Icon={Activity}
                      title="A clean slate"
                      description="Positions appear here when your strategy enters a paper trade."
                      compact
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Token</th>
                            <th>Cost</th>
                            <th>Unrealized P&L</th>
                            <th>Manage position</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.positions.map((r, i) => (
                            <tr key={r.id || i}>
                              <td>
                                <Token row={r} />
                              </td>
                              <td>{fmt(r.costSol ?? r.amountSol)} SOL</td>
                              <td
                                className={
                                  Number(r.priceSol) * Number(r.quantity) -
                                    Number(r.costSol) >
                                  0
                                    ? "mint-text"
                                    : ""
                                }
                              >
                                {fmt(
                                  Number(r.priceSol) * Number(r.quantity) -
                                    Number(r.costSol),
                                  4,
                                )}{" "}
                                SOL
                              </td>
                              <td>
                                <div className="exit-actions">
                                  {[0.25, 0.5, 1].map((fraction) => (
                                    <button
                                      key={fraction}
                                      className="button compact secondary"
                                      disabled={!online || busy}
                                      onClick={() =>
                                        mutate(
                                          `positions/${encodeURIComponent(r.id)}/exit`,
                                          { fraction },
                                        )
                                      }
                                    >
                                      {fraction === 1
                                        ? "Close"
                                        : `${fraction * 100}%`}
                                    </button>
                                  ))}
                                  {r.source === "synthetic" && (
                                    <button
                                      className="button compact secondary"
                                      disabled={!online || busy || state.killed}
                                      onClick={() => {
                                        setMarkPosition(r);
                                        setMarkDraft({
                                          priceSol: String(r.priceSol),
                                          liquiditySol: String(r.liquiditySol),
                                        });
                                        setNotice("");
                                      }}
                                    >
                                      Mark price
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
              {tab === "Transactions" && (
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <div className="section-title">
                        Transaction history{" "}
                        <span className="count">{state.trades.length}</span>
                      </div>
                      <p>Simulated fills from this paper session.</p>
                    </div>
                  </div>
                  {!state.trades.length ? (
                    <Empty
                      Icon={ArrowDownLeft}
                      title="No fills yet"
                      description="Executed paper orders will appear here with their entry and exit details."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Token</th>
                            <th>Side</th>
                            <th>Amount</th>
                            <th>P&L</th>
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {state.trades.map((r, i) => (
                            <tr key={r.id || i}>
                              <td>
                                <Token row={r} />
                              </td>
                              <td>
                                <Status value={r.side || r.type || "fill"} />
                              </td>
                              <td>
                                {fmt(r.amountSol ?? r.proceedsSol ?? r.costSol)}{" "}
                                SOL
                              </td>
                              <td>
                                {fmt(r.realizedPnlSol ?? r.pnlSol, 4)} SOL
                              </td>
                              <td>
                                {time(r.at || r.timestamp || r.createdAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
              {tab === "Strategies" && (
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <div className="section-title">
                        Strategy configuration
                      </div>
                      <p>
                        Entry conditions, exit thresholds, and capital limits.
                      </p>
                    </div>
                    <button
                      className="button secondary compact"
                      onClick={settings}
                    >
                      Edit settings
                    </button>
                  </div>
                  {state.strategies.length ? (
                    state.strategies.map((r, i) => (
                      <div className="strategy-detail" key={r.id || i}>
                        <div className="strategy-top">
                          <span className="strategy-icon">
                            <Zap size={20} />
                          </span>
                          <div>
                            <strong>{r.name || "Launch strategy"}</strong>
                            <p>Rule-based paper execution</p>
                          </div>
                          <Status value={r.enabled ? "enabled" : "disabled"} />
                        </div>
                        <div className="detail-grid">
                          {Object.entries(r)
                            .filter(
                              ([k, v]) =>
                                !["id", "name", "enabled"].includes(k) &&
                                typeof v !== "object",
                            )
                            .map(([k, v]) => (
                              <div key={k}>
                                <span>{k.replace(/([A-Z])/g, " $1")}</span>
                                <strong>{String(v)}</strong>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty
                      Icon={Settings2}
                      title="Build your first strategy"
                      description="Configure your entry size, screening rules, and exit conditions."
                    />
                  )}
                </section>
              )}
              <div className="bottom-note">
                <ShieldCheck size={14} />
                <span>
                  Built for deliberate trading. All activity in this workspace
                  is simulated.
                </span>
              </div>
            </section>
            {tab !== "Research" && <aside className="right-content">
              <section className="card engine-card">
                <div className="card-heading">
                  <div className="section-title">Engine status</div>
                  <span
                    className={`status-pill ${state.running && online ? "good" : ""}`}
                  >
                    <i className="tiny-dot" />
                    {!online
                      ? "Offline"
                      : state.killed
                        ? "Killed"
                        : state.running
                          ? "Running"
                          : "Standby"}
                  </span>
                </div>
                <div className="engine-visual">
                  <div
                    className={`orbit ${state.running && online ? "running" : ""}`}
                  >
                    <Radar size={35} />
                  </div>
                  <strong>
                    {!online
                      ? "Connection needed"
                      : state.killed
                        ? "Emergency stop"
                        : state.running
                          ? "Paper engine ready"
                          : "Ready when you are"}
                  </strong>
                  <p>
                    {state.running
                      ? "Accepting synthetic replay events."
                      : "Start the engine to activate your strategy."}
                  </p>
                </div>
                <div className="status-lines">
                  <div>
                    <span>Environment</span>
                    <span className="mint-text">Paper trading</span>
                  </div>
                  <div>
                    <span>Execution</span>
                    <span>Simulated</span>
                  </div>
                  <div>
                    <span>RPC connection</span>
                    <span>{state.rpc.status || "Not configured"}</span>
                  </div>
                  <div>
                    <span>Last sync</span>
                    <span>
                      {lastUpdated
                        ? lastUpdated.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </div>
                </div>
              </section>
              <section className="card wallet-card">
                <div className="card-heading">
                  <div className="section-title">Capital allocation</div>
                  <Wallet size={16} className="muted" />
                </div>
                <div className="allocation">
                  <span className="allocation-icon">◎</span>
                  <div>
                    <strong>
                      {fmt(state.balanceSol)} <small>SOL</small>
                    </strong>
                    <span>Available paper balance</span>
                  </div>
                </div>
                <div className="allocation-bar">
                  <div
                    style={{
                      width: `${state.balanceSol > 0 ? Math.min(100, (reserve / state.balanceSol) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="allocation-label">
                  <span>
                    <i />
                    Reserve
                  </span>
                  <strong>{fmt(reserve)} SOL</strong>
                </div>
                <button className="text-button" onClick={settings}>
                  Manage risk limits
                  <ArrowUpRight size={14} />
                </button>
              </section>
              <section className="card alerts-card">
                <div className="card-heading">
                  <div className="section-title">Activity feed</div>
                  <Bell size={16} className="muted" />
                </div>
                {state.alerts.length ? (
                  state.alerts.slice(0, 5).map((r, i) => (
                    <div className="alert-row" key={r.id || i}>
                      <span className="alert-dot" />
                      <div>
                        <strong>
                          {r.title || r.type || r.level || "System event"}
                        </strong>
                        <p>{r.message || r.text}</p>
                        <time>{time(r.at || r.timestamp || r.createdAt)}</time>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="quiet-state">
                    <span className="quiet-icon">
                      <Bell size={18} />
                    </span>
                    <p>All quiet for now</p>
                    <small>Engine events and risk alerts appear here.</small>
                  </div>
                )}
              </section>
              <button
                className="kill-button"
                disabled={!online || busy || state.killed}
                onClick={() => mutate("control", { action: "kill" })}
              >
                <CircleStop size={16} />
                Emergency stop
              </button>
              <p className="kill-help">
                Immediately halts the engine and new entries.
              </p>
            </aside>}
          </div>
          <footer>
            <span>
              <span className={`tiny-dot ${online ? "on" : ""}`} />
              {online ? "Backend connected" : "Waiting for backend"}
            </span>
            <span>
              Solana workspace <span className="footer-dot">·</span> Paper
              trading only
            </span>
          </footer>
        </main>
      </div>
      {markPosition && (
        <div className="modal-backdrop" onClick={() => setMarkPosition(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Synthetic paper price update"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">SYNTHETIC PAPER UPDATE</div>
                <h2>Mark {tokenName(markPosition)} price</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close price update"
                onClick={() => setMarkPosition(null)}
              >
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate("paper/mark", {
                    mint: markPosition.mint,
                    priceSol: Number(markDraft.priceSol),
                    liquiditySol: Number(markDraft.liquiditySol),
                  })
                )
                  setMarkPosition(null);
              }}
            >
              <p className="modal-description">
                Supply a synthetic price and liquidity level for this paper
                position. This refreshes the price timestamp and may trigger
                configured take profit, stop loss, trailing stop, or liquidity
                exits while the engine runs.
              </p>
              <div className="mint-address">{markPosition.mint}</div>
              <div className="form-grid">
                <label className="field">
                  Operator-supplied price (SOL / token)
                  <input
                    type="number"
                    autoFocus
                    required
                    min="0.000000000000000001"
                    step="any"
                    value={markDraft.priceSol}
                    onChange={(e) =>
                      setMarkDraft({ ...markDraft, priceSol: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Synthetic liquidity (SOL)
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={markDraft.liquiditySol}
                    onChange={(e) =>
                      setMarkDraft({
                        ...markDraft,
                        liquiditySol: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="modal-note">
                <FlaskConical size={15} />
                Operator-supplied simulation values. No live market price is
                fetched.
              </div>
              {notice && (
                <p role="status" className="mark-feedback">
                  {notice}
                </p>
              )}
              <button
                className="button primary wide"
                type="submit"
                disabled={busy || !online || state.killed}
              >
                <RefreshCw size={14} />
                Apply synthetic mark
              </button>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Token inspection"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">TOKEN INSPECTION</div>
                <h2>{tokenName(selected)}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close inspection"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="mint-address">
              {selected.mint || "Synthetic replay token"}
            </div>
            <div className="detail-grid">
              {Object.entries(selected)
                .filter(
                  ([k, v]) =>
                    ![
                      "mint",
                      "checks",
                      "symbol",
                      "name",
                      "reasons",
                      "readOnlyDiscovery",
                    ].includes(k) && typeof v !== "object",
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <span>{k.replace(/([A-Z])/g, " $1")}</span>
                    <strong>{String(v)}</strong>
                  </div>
                ))}
            </div>
            {selected.reasons?.length > 0 && (
              <>
                <h3>Risk findings</h3>
                <ul className="risk-findings">
                  {selected.reasons.map((reason: string) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </>
            )}
            {selected.checks && (
              <>
                <h3>Screening checks</h3>
                <pre>{JSON.stringify(selected.checks, null, 2)}</pre>
              </>
            )}
            <div className="modal-note">
              <FlaskConical size={15} />
              {selected.readOnlyDiscovery
                ? "Chain observation only. Pricing, liquidity, and trade safety are unverified."
                : "This token belongs to the paper trading environment."}
            </div>
          </section>
        </div>
      )}
      {panel && (
        <div className="modal-backdrop" onClick={() => setPanel(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={panel === "auth" ? "API access" : "Strategy settings"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">WORKSPACE SETTINGS</div>
                <h2>
                  {panel === "auth"
                    ? "Connect your controls"
                    : "Tune your strategy"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setPanel(null)}
              >
                <X size={20} />
              </button>
            </div>
            {panel === "auth" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setApiToken(tokenDraft);
                  setPanel(null);
                  setNotice("API token set for this session.");
                }}
              >
                <p className="modal-description">
                  Enter the API_TOKEN configured on your local backend to
                  authorize engine and strategy controls. This token stays in
                  memory and clears when you reload.
                </p>
                <label className="field">
                  API token
                  <input
                    type="password"
                    autoFocus
                    value={tokenDraft}
                    onChange={(e) => setTokenDraft(e.target.value)}
                    placeholder="Enter your backend API token"
                    autoComplete="off"
                  />
                </label>
                <button className="button primary wide" type="submit">
                  <LockKeyhole size={15} />
                  Save for this session
                </button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await mutate("strategies", draft)) setPanel(null);
                }}
              >
                <p className="modal-description">
                  These rules apply to simulated entries and exits. Stop the
                  engine before saving changes. 100 basis points (bps) equals
                  1%.
                </p>
                <label className="field">
                  Strategy name
                  <input
                    value={draft.name || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Strategy type
                  <select
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft({ ...draft, kind: e.target.value })
                    }
                  >
                    {["launch", "pool", "momentum", "delayed"].map((k) => (
                      <option value={k} key={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  {[
                    {
                      key: "tradeSol",
                      label: "Entry size (SOL)",
                      min: 0.001,
                      step: 0.001,
                    },
                    {
                      key: "maxTradeSol",
                      label: "Max trade (SOL)",
                      min: 0.001,
                      step: 0.001,
                    },
                    {
                      key: "maxDailySpendSol",
                      label: "Daily spend limit (SOL)",
                      min: 0.001,
                      step: 0.001,
                    },
                    {
                      key: "maxPositions",
                      label: "Max positions",
                      min: 1,
                      step: 1,
                    },
                    {
                      key: "minLiquiditySol",
                      label: "Min. liquidity (SOL)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "maxSlippageBps",
                      label: "Max slippage (bps)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "reserveSol",
                      label: "Wallet reserve (SOL)",
                      min: 0,
                      step: 0.1,
                    },
                    {
                      key: "takeProfitBps",
                      label: "Take profit (bps)",
                      min: 1,
                      step: 1,
                    },
                    {
                      key: "stopLossBps",
                      label: "Stop loss (bps)",
                      min: 1,
                      step: 1,
                    },
                    {
                      key: "trailingStopBps",
                      label: "Trailing stop (bps)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "maxHoldMs",
                      label: "Max hold (ms)",
                      min: 1,
                      step: 1,
                    },
                    {
                      key: "maxRiskScore",
                      label: "Max risk score (0–100)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "maxFailures",
                      label: "Failure circuit breaker",
                      min: 1,
                      step: 1,
                    },
                    {
                      key: "minMarketCapSol",
                      label: "Min market cap (SOL)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "maxMarketCapSol",
                      label: "Max market cap (SOL)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "minVolumeSol",
                      label: "Min volume (SOL)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "minMomentumBps",
                      label: "Min momentum (bps)",
                      min: -10000,
                      step: 1,
                    },
                    {
                      key: "delayMs",
                      label: "Entry delay (ms)",
                      min: 0,
                      step: 1,
                    },
                    {
                      key: "maxPriceAgeMs",
                      label: "Max price age (ms)",
                      min: 1,
                      step: 1,
                    },
                  ].map((f) => (
                    <label className="field" key={f.key}>
                      {f.label}
                      <input
                        type="number"
                        required
                        min={f.min}
                        step={f.step}
                        value={draft[f.key] ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [f.key]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                {["creatorAllowlist", "creatorBlocklist"].map((key) => (
                  <label className="field" key={key}>
                    {key === "creatorAllowlist"
                      ? "Allowed creators"
                      : "Blocked creators"}{" "}
                    (comma separated)
                    <input
                      value={(draft[key] || []).join(", ")}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          [key]: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.enabled)}
                    onChange={(e) =>
                      setDraft({ ...draft, enabled: e.target.checked })
                    }
                  />
                  Enable this strategy
                </label>
                <button
                  className="button primary wide"
                  type="submit"
                  disabled={busy || !online || state.running}
                >
                  Save strategy
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  foot,
  icon,
  positive = false,
}: {
  label: string;
  value: string;
  foot: string;
  icon: React.ReactNode;
  positive?: boolean;
}) {
  return (
    <section className="metric card">
      <div className="metric-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className={`metric-value ${positive ? "mint-text" : ""}`}>
        {value}
      </div>
      <div className="metric-foot">{foot}</div>
    </section>
  );
}
function Empty({
  Icon,
  title,
  description,
  compact = false,
}: {
  Icon: typeof Radar;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
function Token({ row }: { row: Row }) {
  const name = tokenName(row);
  return (
    <div className="token">
      <span className="token-icon">
        {String(name).slice(0, 1).toUpperCase()}
      </span>
      <div>
        <strong>{name}</strong>
        <small>{short(row.mint || "Synthetic token")}</small>
      </div>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`status-pill ${["passed", "eligible", "enabled", "buy", "accepted"].includes(String(value).toLowerCase()) ? "good" : ["rejected", "filtered", "disabled", "sell"].includes(String(value).toLowerCase()) ? "neutral" : ""}`}
    >
      {String(value).replace(/_/g, " ")}
    </span>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
