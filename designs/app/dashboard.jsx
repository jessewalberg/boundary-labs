/* global React, Page, Panel, Icon, VerdictPill, SevBadge */
// Boundary Labs — Dashboard screen.

const fmtTime = (iso) => new Date(iso).toISOString().replace("T", " ").replace(/\..+/, "Z");
const fmtRel = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

// ---- KPI row ----
const KpiCell = ({ label, value, sub, tone, glow, foot }) => {
  const color = tone === "signal" ? "var(--bl-signal)"
              : tone === "alarm"  ? "var(--bl-alarm)"
              : tone === "amber"  ? "var(--bl-amber)"
              : tone === "cyan"   ? "var(--bl-cyan)"
              : "var(--bl-bone)";
  return (
    <div style={kpi.cell}>
      <div style={kpi.label}>{label}</div>
      <div style={{ ...kpi.value, color, textShadow: glow ? `0 0 14px ${color}` : "none" }}>
        {value}
        {sub && <span style={kpi.sub}>{sub}</span>}
      </div>
      {foot && <div style={kpi.foot}>{foot}</div>}
    </div>
  );
};
const kpi = {
  cell: { padding: "16px 18px", borderRight: "1px solid var(--bl-line)", display: "flex", flexDirection: "column", gap: 6, minHeight: 96 },
  label: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.22em", color: "var(--bl-bone-3)", textTransform: "uppercase" },
  value: { fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 500, lineHeight: 1.0, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "baseline", gap: 8 },
  sub: { fontSize: 12, color: "var(--bl-bone-3)", letterSpacing: 0 },
  foot: { marginTop: "auto", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.12, color: "var(--bl-bone-4)" },
};

// ---- 24h sparkline (SVG bars) ----
const Sparkline = ({ data }) => {
  const W = 480, H = 80, padX = 8;
  const bw = (W - padX*2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {/* grid */}
      <g stroke="var(--bl-line)" strokeWidth="0.5">
        <line x1="0" y1={H-1} x2={W} y2={H-1}/>
        <line x1="0" y1={H/2} x2={W} y2={H/2} strokeDasharray="2 3"/>
      </g>
      {data.map((d, i) => {
        const x = padX + i*bw + 1;
        const w = bw - 2;
        if (d.runs === 0) {
          return <rect key={i} x={x} y={H-6} width={w} height="2" fill="var(--bl-line)"/>;
        }
        const passH = Math.max(2, (d.pass ?? 0) * (H - 14));
        const failH = (1 - (d.pass ?? 0)) * (H - 14);
        const color = d.pass === 1 ? "var(--bl-signal)" : d.pass >= 0.75 ? "var(--bl-amber)" : "var(--bl-alarm)";
        return (
          <g key={i}>
            {failH > 1 && <rect x={x} y={H - 8 - passH - failH} width={w} height={failH} fill="var(--bl-alarm)" opacity="0.85"/>}
            <rect x={x} y={H - 8 - passH} width={w} height={passH} fill={color}/>
          </g>
        );
      })}
      {/* hour ticks every 4h */}
      {data.map((d, i) => i % 4 === 0 && (
        <text key={i} x={padX + i*bw + bw/2} y={H} fontFamily="var(--font-mono)" fontSize="8" fill="var(--bl-bone-4)" textAnchor="middle">{d.h}h</text>
      ))}
    </svg>
  );
};

// ---- Live agent feed ----
const AgentFeed = ({ rows }) => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    {rows.map((r, i) => {
      const color = r.role === "alarm" ? "var(--bl-alarm)"
                  : r.role === "signal" ? "var(--bl-signal)"
                  : r.role === "cyan" ? "var(--bl-cyan)"
                  : "var(--bl-bone-3)";
      return (
        <div key={i} style={feed.row}>
          <span style={feed.t}>{r.t}</span>
          <span style={{ ...feed.dot, background: color, boxShadow: r.role !== "muted" ? `0 0 6px ${color}` : "none" }}/>
          <span style={{ ...feed.agent, color: color === "var(--bl-bone-3)" ? "var(--bl-bone-2)" : color }}>{r.agent}</span>
          <span style={feed.msg}>{r.msg}</span>
          <span style={feed.detail}>{r.detail}</span>
        </div>
      );
    })}
  </div>
);
const feed = {
  row: { display: "grid", gridTemplateColumns: "70px 8px 200px 160px 1fr", gap: 12, alignItems: "center",
    padding: "8px 14px", borderBottom: "1px solid var(--bl-line)" },
  t:    { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bl-bone-4)", letterSpacing: 0 },
  dot:  { width: 6, height: 6, borderRadius: "50%" },
  agent:{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 0 },
  msg:  { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone)", letterSpacing: 0 },
  detail:{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--bl-bone-3)", letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
};

// ---- Active agents ----
const AgentsList = ({ agents }) => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    {agents.map((a, i) => {
      const live = a.status === "live";
      const stripe = a.tone === "alarm" ? "var(--bl-alarm)" : a.tone === "cyan" ? "var(--bl-cyan)" : "var(--bl-signal)";
      return (
        <div key={i} style={agentList.row}>
          <span style={{ ...agentList.bar, background: stripe, boxShadow: live ? `0 0 6px ${stripe}` : "none", opacity: live ? 1 : 0.45 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={agentList.name}>
              {a.name}
              <span style={agentList.role}>{a.role}</span>
            </div>
            <div style={agentList.task}>{a.task}</div>
          </div>
          <div style={agentList.meta}>
            <div style={agentList.metaPair}>
              <span style={agentList.k}>SEEDS</span>
              <span style={agentList.v}>{a.seeds ?? "—"}</span>
            </div>
            <span className={`bl-chip ${live ? "bl-chip--signal" : ""}`} style={{ height: 18 }}>
              <span className="bl-chip-dot"/>{a.status}
            </span>
          </div>
        </div>
      );
    })}
  </div>
);
const agentList = {
  row: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--bl-line)" },
  bar: { width: 3, alignSelf: "stretch", borderRadius: 1 },
  name: { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--bl-bone)", letterSpacing: 0, display: "flex", alignItems: "center", gap: 8 },
  role: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.16, color: "var(--bl-bone-4)", padding: "1px 5px", border: "1px solid var(--bl-line-2)", borderRadius: 2 },
  task: { fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--bl-bone-3)", marginTop: 4, letterSpacing: 0, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" },
  meta: { display: "flex", alignItems: "center", gap: 12, flex: "0 0 auto" },
  metaPair: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 },
  k:    { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.18, color: "var(--bl-bone-4)" },
  v:    { fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--bl-bone)", fontVariantNumeric: "tabular-nums" },
};

// ---- Runs feed (compact, last 6) ----
const RunsFeed = ({ runs }) => (
  <table className="bl-table" style={{ tableLayout: "fixed", margin: 0 }}>
    <colgroup>
      <col style={{ width: 4 }}/>
      <col style={{ width: 76 }}/>
      <col/>
      <col style={{ width: 180 }}/>
      <col style={{ width: 100 }}/>
      <col style={{ width: 70 }}/>
    </colgroup>
    <thead>
      <tr><th></th><th>P/F/Pa</th><th>RUN_ID</th><th>BRANCH</th><th style={{ textAlign: "right" }}>STARTED</th><th style={{ textAlign: "right" }}>WALL</th></tr>
    </thead>
    <tbody>
      {runs.map(r => {
        const tone = r.summary.invalid > 0 ? "invalid" : r.summary.fail > 0 ? "fail" : r.summary.partial > 0 ? "partial" : "pass";
        const bar = tone === "fail" ? "var(--bl-alarm)" : tone === "partial" ? "var(--bl-amber)" : tone === "invalid" ? "var(--bl-bone-3)" : "var(--bl-signal)";
        const glow = tone === "fail" || tone === "pass";
        return (
          <tr key={r.id} style={{ cursor: "pointer" }}
              onClick={() => { window.location.href = `Runs.html#${r.id}`; }}>
            <td style={{ padding: 0 }}>
              <div style={{ width: 3, height: 24, background: bar, boxShadow: glow ? `0 0 6px ${bar}` : "none" }}/>
            </td>
            <td style={{ fontVariantNumeric: "tabular-nums" }}>
              <span style={{ color: "var(--bl-signal)" }}>{r.summary.pass}</span>
              <span style={{ color: "var(--bl-bone-4)" }}>/</span>
              <span style={{ color: r.summary.fail ? "var(--bl-alarm)" : "var(--bl-bone-4)" }}>{r.summary.fail}</span>
              <span style={{ color: "var(--bl-bone-4)" }}>/</span>
              <span style={{ color: r.summary.partial ? "var(--bl-amber)" : "var(--bl-bone-4)" }}>{r.summary.partial}</span>
            </td>
            <td style={{ color: "var(--bl-bone)" }}>{r.id}</td>
            <td style={{ color: "var(--bl-bone-2)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="branch" size={11} color="var(--bl-bone-3)"/>
                {r.branch.length > 22 ? r.branch.slice(0, 22) + "…" : r.branch}
              </span>
            </td>
            <td className="num" style={{ color: "var(--bl-bone-3)", fontSize: 11 }}>{fmtRel(r.startedAt)}</td>
            <td className="num" style={{ color: "var(--bl-bone-2)" }}>{r.duration}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

// ---- Findings list ----
const Findings = ({ findings }) => (
  <div>
    {findings.map(f => {
      const stTone = f.status === "fixed" ? "signal" : f.status === "open" ? "alarm" : f.status === "deferred" ? "" : "amber";
      return (
        <div key={f.id} style={find.row}>
          <div style={find.head}>
            <span style={find.id}>{f.id}</span>
            <SevBadge s={f.severity}/>
            <span className={`bl-chip ${stTone ? `bl-chip--${stTone}` : ""}`} style={{ height: 18, marginLeft: "auto" }}>
              <span className="bl-chip-dot"/>{f.status}
            </span>
          </div>
          <div style={find.title}>{f.title}</div>
          <div style={find.meta}>seed/{f.seed} · last fail {fmtRel(f.lastFail + "Z")}</div>
          <div style={find.note}>{f.note}</div>
        </div>
      );
    })}
  </div>
);
const find = {
  row: { padding: "14px 16px", borderBottom: "1px solid var(--bl-line)", display: "flex", flexDirection: "column", gap: 6 },
  head: { display: "flex", alignItems: "center", gap: 8 },
  id:   { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone)", letterSpacing: 0 },
  title:{ fontSize: 13.5, color: "var(--bl-bone)", lineHeight: 1.4 },
  meta: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bl-bone-3)", letterSpacing: 0 },
  note: { fontSize: 12, color: "var(--bl-bone-2)", lineHeight: 1.5 },
};

// ---- Threat coverage strip ----
const CoverageStrip = ({ rows }) => (
  <div style={cov.root}>
    {rows.map(r => {
      const pct = r.passRate === null ? 0 : Math.round(r.passRate * 100);
      const color = r.status === "deferred" ? "var(--bl-bone-4)"
                  : r.passRate === 1 ? "var(--bl-signal)"
                  : r.passRate >= 0.75 ? "var(--bl-amber)"
                  : "var(--bl-alarm)";
      return (
        <div key={r.section} style={cov.cell}>
          <div style={cov.head}>
            <span style={cov.sec}>{r.section}</span>
            <span className={`bl-chip ${r.status === "covered" ? "bl-chip--signal" : r.status === "deferred" ? "" : r.status === "semantic-only" ? "bl-chip--amber" : "bl-chip--cyan"}`} style={{ height: 18 }}>
              <span className="bl-chip-dot"/>{r.status}
            </span>
          </div>
          <div style={cov.title}>{r.title}</div>
          <div style={{ ...cov.bar, background: r.status === "deferred"
            ? "repeating-linear-gradient(135deg, var(--bl-trough), var(--bl-trough) 4px, var(--bl-panel-2) 4px, var(--bl-panel-2) 8px)"
            : "var(--bl-trough)" }}>
            <div style={{ height: "100%", width: pct + "%", background: color, boxShadow: r.status === "deferred" ? "none" : `0 0 8px ${color}` }}/>
          </div>
          <div style={cov.foot}>
            <span style={{ color: "var(--bl-bone)" }}>{r.passRate === null ? "—" : pct + "%"}</span>
            <span>·</span>
            <span>{r.seedCount} seeds</span>
          </div>
        </div>
      );
    })}
  </div>
);
const cov = {
  root: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0 },
  cell: { padding: "14px 16px", borderRight: "1px solid var(--bl-line)", display: "flex", flexDirection: "column", gap: 8 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  sec:  { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone-3)", letterSpacing: 0.16, textTransform: "uppercase" },
  title:{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--bl-bone)", letterSpacing: -0.005, lineHeight: 1.3 },
  bar:  { height: 6, marginTop: 4 },
  foot: { display: "flex", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bl-bone-3)", letterSpacing: 0 },
};

// ---- Target health ----
const Health = ({ rows }) => (
  <div>
    {rows.map((h, i) => {
      const state = h.state;
      const color = state === "ok" ? "var(--bl-signal)"
                  : state === "warn" ? "var(--bl-amber)"
                  : state === "fail" ? "var(--bl-alarm)"
                  : "var(--bl-bone-4)";
      return (
        <div key={i} style={health.row}>
          <span style={{ ...health.dot, background: color, boxShadow: state === "deferred" ? "none" : `0 0 6px ${color}` }}/>
          <span style={health.name}>{h.name}</span>
          <span style={health.note}>{h.note}</span>
          <span style={{ ...health.ms, color: state === "warn" ? "var(--bl-amber)" : "var(--bl-bone-2)" }}>{h.ms != null ? h.ms + "ms" : "—"}</span>
          <span className={`bl-chip ${state === "ok" ? "bl-chip--signal" : state === "warn" ? "bl-chip--amber" : state === "fail" ? "bl-chip--alarm" : ""}`} style={{ height: 18 }}>
            <span className="bl-chip-dot"/>{state}
          </span>
        </div>
      );
    })}
  </div>
);
const health = {
  row: { display: "grid", gridTemplateColumns: "10px 180px 1fr 70px 90px", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--bl-line)" },
  dot: { width: 8, height: 8, borderRadius: "50%" },
  name:{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--bl-bone)", letterSpacing: 0 },
  note:{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--bl-bone-3)", letterSpacing: 0, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden" },
  ms:  { fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "right", fontVariantNumeric: "tabular-nums" },
};

// ===================== Dashboard composition =====================
const Dashboard = () => {
  const d = window.BL_DATA;

  // KPI computations
  const last24 = d.runs.filter(r => Date.now() - new Date(r.startedAt) < 24*3600*1000);
  const totalSeeds = last24.reduce((a, r) => a + r.seedCount, 0);
  const passed = last24.reduce((a, r) => a + r.summary.pass, 0);
  const failed = last24.reduce((a, r) => a + r.summary.fail, 0);
  const partial = last24.reduce((a, r) => a + r.summary.partial, 0);
  const passRate = totalSeeds ? Math.round(passed * 100 / totalSeeds) : 0;
  const openFindings = d.findings.filter(f => f.status === "open").length;
  const liveAgents = d.agents.filter(a => a.status === "live").length;

  return (
    <Page>
      {/* Header */}
      <div style={dsh.hero}>
        <div>
          <div className="bl-eyebrow">// workspace · operator dashboard</div>
          <h1 className="bl-h1" style={{ margin: "10px 0 4px", fontSize: 32 }}>DASHBOARD</h1>
          <div style={dsh.heroMeta}>
            <span className="bl-watermark">OPERATOR</span><code>boundary.ops</code>
            <span style={{ color: "var(--bl-bone-4)" }}>·</span>
            <span className="bl-watermark">WINDOW</span><code>last 24h</code>
            <span style={{ color: "var(--bl-bone-4)" }}>·</span>
            <span className="bl-watermark">SCHEDULER</span><span className="bl-chip bl-chip--signal" style={{ height: 18 }}><span className="bl-chip-dot"/>on · every 3h</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="bl-btn bl-btn--ghost"><Icon name="download" size={11}/>EXPORT 24H</button>
          <button className="bl-btn bl-btn--secondary"><Icon name="filter" size={11}/>FILTER</button>
          <button className="bl-btn"><Icon name="play" size={10}/>RUN NOW</button>
        </div>
      </div>

      {/* KPI strip + sparkline */}
      <section className="bl-panel" style={{ marginBottom: 16, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr) 1.6fr" }}>
          <KpiCell label="RUNS · 24H" value={last24.length} sub="/ 9 sched"
            foot={`▲ next ${new Date(Date.now() + 1800*1000).toISOString().slice(11,16)}Z`}/>
          <KpiCell label="SEEDS PROBED" value={totalSeeds} sub="across 24h"
            foot={`${d.runs.length} runs · 7d`}/>
          <KpiCell label="PASS RATE" value={`${passRate}%`} tone="signal" glow
            foot={`${passed} pass · ${failed} fail · ${partial} part`}/>
          <KpiCell label="OPEN FINDINGS" value={openFindings} tone={openFindings > 0 ? "alarm" : "signal"} glow={openFindings > 0}
            foot="1 fixed · 1 deferred"/>
          <KpiCell label="AGENTS LIVE" value={`${liveAgents}/${d.agents.length}`} tone="signal"
            foot="3 red · 2 judge · 1 ops"/>

          {/* sparkline cell */}
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={kpi.label}>PASS RATE · 24H</span>
              <span style={{ ...kpi.label, color: "var(--bl-bone-4)" }}>00 → 24 UTC</span>
            </div>
            <Sparkline data={d.spark}/>
          </div>
        </div>
      </section>

      {/* Row 1: Feed + Agents */}
      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel
          watermark="// live · harness telemetry"
          right={<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="bl-chip bl-chip--signal" style={{ height: 18 }}><span className="bl-chip-dot"/>streaming</span>
            <span className="bl-watermark" style={{ color: "var(--bl-bone-4)" }}>12 events · 13m</span>
          </div>}
          padded={false}
        >
          <AgentFeed rows={d.feed}/>
        </Panel>

        <Panel
          watermark="// agents · 7 active"
          right={<button className="bl-btn bl-btn--ghost bl-btn--sm">VIEW ALL<Icon name="chevron-r" size={10}/></button>}
          padded={false}
        >
          <AgentsList agents={d.agents}/>
        </Panel>
      </div>

      {/* Row 2: Runs + Findings */}
      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel
          watermark="// recent runs · 7d"
          right={<a className="bl-btn bl-btn--ghost bl-btn--sm" href="Runs.html">OPEN RUNS<Icon name="arrow-r" size={10}/></a>}
          padded={false}
        >
          <RunsFeed runs={d.runs.slice(0, 6)}/>
        </Panel>

        <Panel
          watermark="// findings · 3 open"
          right={<span className="bl-chip bl-chip--alarm" style={{ height: 18 }}><span className="bl-chip-dot"/>1 critical</span>}
          padded={false}
        >
          <Findings findings={d.findings}/>
        </Panel>
      </div>

      {/* Row 3: Coverage strip */}
      <Panel
        watermark="// threat-model coverage · THREAT_MODEL.md"
        right={<span className="bl-watermark" style={{ color: "var(--bl-bone-4)" }}>5 sections · 15 seeds · 1 deferred</span>}
        padded={false}
        style={{ marginBottom: 16 }}
      >
        <CoverageStrip rows={d.threatModel}/>
      </Panel>

      {/* Row 4: Target health + perimeter */}
      <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel
          watermark="// target · clinical-copilot · health"
          right={<span className="bl-chip bl-chip--signal" style={{ height: 18 }}><span className="bl-chip-dot"/>readyz ok</span>}
          padded={false}
        >
          <Health rows={d.health}/>
        </Panel>

        {/* Perimeter diagram tile */}
        <section className="bl-panel" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <header className="bl-panel-head">
            <span className="bl-watermark">// perimeter · attack surface</span>
            <span className="bl-chip" style={{ height: 18 }}><span className="bl-chip-dot"/>3 vectors live</span>
          </header>
          <div style={{ flex: 1, background: "var(--bl-trough)", padding: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="assets/perimeter.svg" alt="" style={{ width: "100%", maxWidth: 460, height: "auto", display: "block" }}/>
          </div>
          <footer style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", background: "var(--bl-trough)", borderTop: "1px solid var(--bl-line)",
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.14, color: "var(--bl-bone-3)", textTransform: "uppercase" }}>
            <span>// authorized only · no module import</span>
            <span>lock · /readyz ok</span>
          </footer>
        </section>
      </div>

    </Page>
  );
};

const dsh = {
  hero: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 },
  heroMeta: { display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone-2)" },
};

Object.assign(window, { Dashboard });
