/* global React, Page, Panel, Icon, VerdictPill, SevBadge */
// Boundary Labs — Runs index, run detail, finding detail.

const fmt = iso => new Date(iso).toISOString().replace("T", " ").replace(/\..+/, "Z");
const rel = iso => {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

// =================== Runs index ===================
const RunsScreen = ({ runs, onOpen }) => {
  const [filter, setFilter] = React.useState("all");
  const visible = runs.filter(r => {
    if (filter === "all") return true;
    if (filter === "main") return r.branch === "main";
    if (filter === "fail") return r.summary.fail > 0 || r.summary.partial > 0 || r.summary.invalid > 0;
    if (filter === "pass") return r.summary.fail === 0 && r.summary.partial === 0 && r.summary.invalid === 0;
    return true;
  });

  // distribution
  const total = runs.length;
  const greens = runs.filter(r => r.summary.fail === 0 && r.summary.partial === 0 && r.summary.invalid === 0).length;
  const reds   = runs.filter(r => r.summary.fail > 0).length;
  const ambers = runs.filter(r => r.summary.fail === 0 && r.summary.partial > 0).length;
  const grays  = runs.filter(r => r.summary.invalid > 0).length;

  return (
    <Page>
      <div style={rs.hero}>
        <div>
          <div className="bl-eyebrow">// workspace · adversarial evaluation</div>
          <h1 className="bl-h1" style={{ margin: "10px 0 6px" }}>RUNS</h1>
          <p className="bl-p" style={{ margin: 0, maxWidth: 600 }}>
            Reproducible probes of the Clinical Co-Pilot over its authorized HTTP &amp; SSE surface.
            Each row is an artifact under <code>evals/results/</code>.
          </p>
        </div>
        <div style={rs.heroMeta}>
          <div style={rs.metaLine}>
            <span className="bl-watermark">LATEST</span>
            <span className="bl-chip bl-chip--signal"><span className="bl-chip-dot"/>mvp-…204402</span>
          </div>
          <div style={rs.metaLine}>
            <span className="bl-watermark">TARGET</span>
            <span className="bl-chip"><span className="bl-chip-dot"/>railway.app</span>
          </div>
          <div style={rs.metaLine}>
            <span className="bl-watermark">HEALTH</span>
            <span className="bl-chip bl-chip--signal"><span className="bl-chip-dot"/>healthz · readyz ok</span>
          </div>
        </div>
      </div>

      {/* Distribution strip */}
      <section className="bl-panel" style={{ marginBottom: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div style={rs.kpi}>
            <div style={rs.kpiLabel}>TOTAL RUNS · 7D</div>
            <div style={{ ...rs.kpiValue, color: "var(--bl-bone)" }}>{total}</div>
          </div>
          <div style={rs.kpi}>
            <div style={rs.kpiLabel}>ALL PASS</div>
            <div style={{ ...rs.kpiValue, color: "var(--bl-signal)", textShadow: "0 0 14px var(--bl-signal)" }}>{greens}</div>
          </div>
          <div style={rs.kpi}>
            <div style={rs.kpiLabel}>FAIL / PARTIAL</div>
            <div style={{ ...rs.kpiValue, color: reds > 0 ? "var(--bl-alarm)" : "var(--bl-amber)", textShadow: reds > 0 ? "0 0 14px var(--bl-alarm)" : "none" }}>
              {reds}<span style={{ color: "var(--bl-bone-4)", fontSize: 18 }}>/</span><span style={{ color: "var(--bl-amber)" }}>{ambers}</span>
            </div>
          </div>
          <div style={{ ...rs.kpi, borderRight: "none" }}>
            <div style={rs.kpiLabel}>INVALID · DEFERRED</div>
            <div style={{ ...rs.kpiValue, color: "var(--bl-bone-3)" }}>{grays}</div>
          </div>
        </div>
      </section>

      {/* Filter row */}
      <div style={rs.filters}>
        <span className="bl-watermark" style={{ color: "var(--bl-bone-3)" }}>// filter</span>
        {[["all","ALL"],["pass","PASS"],["fail","FAILURES"],["main","MAIN"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`bl-btn ${filter === k ? "bl-btn--secondary" : "bl-btn--ghost"} bl-btn--sm`} style={filter === k ? { color: "var(--bl-bone)" } : null}>{l}</button>
        ))}
        <div style={{ flex: 1 }}/>
        <span className="bl-watermark">{visible.length} / {runs.length} runs · 7d</span>
      </div>

      {/* Runs table */}
      <div style={rs.tableWrap}>
        <table className="bl-table" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 4 }}/>
            <col style={{ width: 90 }}/>
            <col/>
            <col style={{ width: 220 }}/>
            <col style={{ width: 200 }}/>
            <col style={{ width: 220 }}/>
            <col style={{ width: 80 }}/>
            <col style={{ width: 130 }}/>
            <col style={{ width: 70 }}/>
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>P/F/Pa</th>
              <th>RUN_ID</th>
              <th>COVERAGE</th>
              <th>TARGET</th>
              <th>BRANCH</th>
              <th>TRIGGER</th>
              <th style={{ textAlign: "right" }}>STARTED</th>
              <th style={{ textAlign: "right" }}>WALL</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const tone = r.summary.invalid > 0 ? "invalid" : r.summary.fail > 0 ? "fail" : r.summary.partial > 0 ? "partial" : "pass";
              const barColor = tone === "fail" ? "var(--bl-alarm)" : tone === "partial" ? "var(--bl-amber)" : tone === "invalid" ? "var(--bl-bone-3)" : "var(--bl-signal)";
              const barGlow  = tone === "fail" || tone === "pass";
              return (
                <tr key={r.id} onClick={() => onOpen(r.id)} style={{ cursor: "pointer" }}>
                  <td style={{ padding: 0 }}>
                    <div style={{ width: 3, height: 28, background: barColor, boxShadow: barGlow ? `0 0 6px ${barColor}` : "none" }}/>
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "var(--bl-signal)" }}>{r.summary.pass}</span>
                    <span style={{ color: "var(--bl-bone-4)" }}>/</span>
                    <span style={{ color: r.summary.fail ? "var(--bl-alarm)" : "var(--bl-bone-4)" }}>{r.summary.fail}</span>
                    <span style={{ color: "var(--bl-bone-4)" }}>/</span>
                    <span style={{ color: r.summary.partial ? "var(--bl-amber)" : "var(--bl-bone-4)" }}>{r.summary.partial}</span>
                  </td>
                  <td style={{ color: "var(--bl-bone)" }}>{r.id}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {r.coverage.map(c => (
                        <span key={c} style={{
                          fontFamily: "var(--font-mono)", fontSize: 10,
                          padding: "1px 6px", border: "1px solid var(--bl-line)",
                          color: "var(--bl-bone-2)", background: "var(--bl-trough)", letterSpacing: 0,
                        }}>{c}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ color: "var(--bl-bone-2)" }}>{r.target.replace(/^https?:\/\//, "")}</td>
                  <td style={{ color: "var(--bl-bone-2)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon name="branch" size={11} color="var(--bl-bone-3)"/>
                      {r.branch}
                      <span style={{ color: "var(--bl-bone-4)" }}>·</span>
                      <span style={{ color: "var(--bl-bone-3)" }}>{r.commit}</span>
                    </span>
                  </td>
                  <td>
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: 0.14, textTransform: "uppercase",
                      color: r.trigger === "scheduler" ? "var(--bl-signal)" : "var(--bl-bone-3)",
                      border: "1px solid var(--bl-line-2)", padding: "1px 6px",
                    }}>{r.trigger}</span>
                  </td>
                  <td className="num" style={{ color: "var(--bl-bone-3)", fontSize: 11 }}>{fmt(r.startedAt)}</td>
                  <td className="num" style={{ color: "var(--bl-bone-2)" }}>{r.duration}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Page>
  );
};

const rs = {
  hero: { display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-start", marginBottom: 20 },
  heroMeta: { display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" },
  metaLine: { display: "flex", alignItems: "center", gap: 8 },
  filters: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  tableWrap: { border: "1px solid var(--bl-line)", borderRadius: 2, overflow: "hidden", background: "var(--bl-panel)" },
  kpi: { padding: "14px 18px", borderRight: "1px solid var(--bl-line)", display: "flex", flexDirection: "column", gap: 6 },
  kpiLabel: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 0.2, textTransform: "uppercase", color: "var(--bl-bone-3)" },
  kpiValue: { fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 500, lineHeight: 1.0, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
};

// =================== Run detail (summary + seeds) ===================
const RunDetailScreen = ({ run, seeds, onOpenSeed, onBack }) => {
  return (
    <Page>
      <div style={rd.crumbBar}>
        <button onClick={onBack} className="bl-btn bl-btn--ghost bl-btn--sm">← RUNS</button>
      </div>

      <div style={rd.hero}>
        <div>
          <div className="bl-eyebrow">// run_artifact</div>
          <h1 className="bl-h1" style={{ margin: "10px 0 8px", fontFamily: "var(--font-mono)", fontSize: 26, letterSpacing: 0 }}>
            {run.id}
          </h1>
          <div style={rd.heroMeta}>
            <span className="bl-watermark">TARGET</span><code>{run.target}</code>
            <span style={{ color: "var(--bl-bone-4)" }}>·</span>
            <span className="bl-watermark">STARTED</span><code>{fmt(run.startedAt)}</code>
            <span style={{ color: "var(--bl-bone-4)" }}>·</span>
            <span className="bl-watermark">BRANCH</span><code>{run.branch}@{run.commit}</code>
            <span style={{ color: "var(--bl-bone-4)" }}>·</span>
            <span className="bl-watermark">TRIGGER</span><code>{run.trigger}</code>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="bl-btn bl-btn--ghost"><Icon name="copy" size={11}/>COPY ID</button>
          <button className="bl-btn bl-btn--secondary"><Icon name="download" size={11}/>ARTIFACT JSON</button>
          <button className="bl-btn"><Icon name="play" size={10}/>RE-RUN</button>
        </div>
      </div>

      {/* Summary strip */}
      <section className="bl-panel" style={{ marginBottom: 16, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)" }}>
          {[
            { label: "TOTAL", v: run.seedCount, c: "var(--bl-bone)" },
            { label: "PASS",  v: run.summary.pass, c: "var(--bl-signal)", glow: true },
            { label: "FAIL",  v: run.summary.fail, c: run.summary.fail ? "var(--bl-alarm)" : "var(--bl-bone-4)", glow: !!run.summary.fail },
            { label: "PARTIAL", v: run.summary.partial, c: run.summary.partial ? "var(--bl-amber)" : "var(--bl-bone-4)" },
            { label: "INVALID", v: run.summary.invalid, c: "var(--bl-bone-4)" },
            { label: "WALL", v: run.duration, c: "var(--bl-bone-2)" },
          ].map((c, i) => (
            <div key={c.label} style={{ padding: "14px 18px", borderRight: i < 5 ? "1px solid var(--bl-line)" : "none" }}>
              <div style={rs.kpiLabel}>{c.label}</div>
              <div style={{ ...rs.kpiValue, color: c.c, textShadow: c.glow ? `0 0 14px ${c.c}` : "none" }}>{c.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Seeds list */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span className="bl-watermark">// seeds · {seeds.length}</span>
        <span className="bl-watermark" style={{ color: "var(--bl-bone-4)" }}>click row to inspect</span>
      </div>

      <div style={{ border: "1px solid var(--bl-line)", borderRadius: 2, overflow: "hidden", background: "var(--bl-panel)" }}>
        {seeds.map(s => (
          <button key={s.id} onClick={() => onOpenSeed(s.id)} className={`bl-runrow bl-runrow--${s.verdict}`}
                  style={{ borderBottom: "1px solid var(--bl-line)", cursor: "pointer", textAlign: "left", width: "100%",
                    display: "grid", gridTemplateColumns: "3px 1fr 110px 90px 70px 14px", gap: 16, alignItems: "center",
                    background: "transparent", padding: "12px 14px" }}>
            <div className="bl-runrow-bar"/>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="bl-runrow-title">seed/{s.id}</span>
                <span style={{ color: "var(--bl-bone-4)" }}>·</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--bl-bone-2)" }}>{s.title}</span>
              </div>
              <div className="bl-runrow-meta">{s.category} · judge {s.judge} · {(s.durationMs/1000).toFixed(2)}s</div>
            </div>
            <SevBadge s={s.severity}/>
            <VerdictPill v={s.verdict}/>
            <span className="bl-runrow-meta" style={{ textAlign: "right" }}>{(s.durationMs/1000).toFixed(2)}s</span>
            <Icon name="chevron-r" size={12} color="var(--bl-bone-3)"/>
          </button>
        ))}
      </div>
    </Page>
  );
};
const rd = {
  crumbBar: { marginBottom: 8 },
  hero: { display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-end", marginBottom: 20 },
  heroMeta: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone-2)", flexWrap: "wrap" },
};

// =================== Finding detail ===================
const FindingScreen = ({ seed, run, onBack }) => (
  <Page>
    <div style={{ marginBottom: 8 }}>
      <button onClick={onBack} className="bl-btn bl-btn--ghost bl-btn--sm"><span>←</span> RUN · {run.id}</button>
    </div>

    <div style={fd.hero}>
      <div>
        <div className="bl-eyebrow">// finding · {seed.category}</div>
        <h1 className="bl-h1" style={{ margin: "10px 0 10px", fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.005em" }}>
          {seed.title}
        </h1>
        <div style={fd.chips}>
          <span className="bl-chip"><span className="bl-chip-dot"/>seed/{seed.id}</span>
          <span className="bl-chip bl-chip--cyan"><span className="bl-chip-dot"/>judge:{seed.judge}</span>
          <SevBadge s={seed.severity}/>
          <VerdictPill v={seed.verdict}/>
          <span className="bl-chip"><span className="bl-chip-dot"/>{(seed.durationMs/1000).toFixed(2)}s</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="bl-btn bl-btn--ghost"><Icon name="copy" size={11}/>COPY</button>
        <button className="bl-btn bl-btn--secondary"><Icon name="ext" size={11}/>OPEN IN CLI</button>
        <button className="bl-btn"><Icon name="play" size={10}/>RE-RUN SEED</button>
      </div>
    </div>

    <div style={fd.grid}>
      <section className="bl-panel">
        <header className="bl-panel-head">
          <span className="bl-watermark">// red_team · prompt</span>
          <span className="bl-chip"><span className="bl-chip-dot"/>{seed.category}</span>
        </header>
        <pre className="bl-pre" style={{ margin: 0, borderTop: "none", whiteSpace: "pre-wrap" }}>{seed.prompt}</pre>
      </section>

      <section className="bl-panel">
        <header className="bl-panel-head">
          <span className="bl-watermark">// target · response</span>
          <span className="bl-chip bl-chip--cyan"><span className="bl-chip-dot"/>{run.target.replace(/^https?:\/\//, "")}</span>
        </header>
        <div className="bl-panel-body">
          <p className="bl-p" style={{ margin: 0, color: "var(--bl-bone)" }}>{seed.response}</p>
        </div>
      </section>

      <section className="bl-panel" style={{ gridColumn: "1 / -1" }}>
        <header className="bl-panel-head">
          <span className="bl-watermark">// judge · {seed.judge}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <VerdictPill v={seed.verdict}/>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bl-bone-3)", letterSpacing: 0 }}>{(seed.durationMs/1000).toFixed(2)}s</span>
          </span>
        </header>
        <div className="bl-panel-body">
          <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: 14, lineHeight: 1.55, color: "var(--bl-bone)",
                     paddingLeft: 14, borderLeft: `2px solid ${seed.verdict === "fail" ? "var(--bl-alarm)" : seed.verdict === "partial" ? "var(--bl-amber)" : "var(--bl-signal)"}` }}>{seed.rationale}</p>
        </div>
      </section>

      <section className="bl-panel" style={{ gridColumn: "1 / -1" }}>
        <header className="bl-panel-head">
          <span className="bl-watermark">// artifact · evals/results/{run.id}.json</span>
          <button className="bl-btn bl-btn--ghost bl-btn--sm"><Icon name="download" size={11}/>DOWNLOAD</button>
        </header>
        <pre className="bl-pre" style={{ margin: 0, borderTop: "none" }}>{JSON.stringify({
          run_id: run.id, seed_id: seed.id, category: seed.category, severity: seed.severity,
          verdict: seed.verdict, judge: seed.judge, duration_ms: seed.durationMs,
          target: run.target, branch: run.branch, commit: run.commit,
        }, null, 2)}</pre>
      </section>
    </div>
  </Page>
);
const fd = {
  hero: { display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-end", marginBottom: 24 },
  chips: { display: "flex", gap: 8, flexWrap: "wrap" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
};

Object.assign(window, { RunsScreen, RunDetailScreen, FindingScreen });
