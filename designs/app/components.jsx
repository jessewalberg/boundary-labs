/* global React */
// Boundary Labs — shared app chrome for Dashboard + Runs.

// ------- inline SVG icon helper -------
const Icon = ({ name, size = 14, color = "currentColor" }) => {
  const paths = {
    "play":       <polygon points="6 4 18 12 6 20" fill={color} stroke="none"/>,
    "chevron-r":  <polyline points="9 6 15 12 9 18" fill="none" stroke={color} strokeWidth="1.5"/>,
    "chevron-d":  <polyline points="6 9 12 15 18 9" fill="none" stroke={color} strokeWidth="1.5"/>,
    "arrow-r":    <g fill="none" stroke={color} strokeWidth="1.5"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></g>,
    "x":          <g fill="none" stroke={color} strokeWidth="1.5"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></g>,
    "search":     <g fill="none" stroke={color} strokeWidth="1.5"><circle cx="11" cy="11" r="6"/><line x1="20" y1="20" x2="15.5" y2="15.5"/></g>,
    "shield":     <path d="M12 2 L20 5 V11 C20 16 16 20 12 22 C8 20 4 16 4 11 V5 Z" fill="none" stroke={color} strokeWidth="1.5"/>,
    "terminal":   <g fill="none" stroke={color} strokeWidth="1.5"><polyline points="5 8 9 12 5 16"/><line x1="11" y1="16" x2="19" y2="16"/></g>,
    "file":       <g fill="none" stroke={color} strokeWidth="1.5"><path d="M6 3 H14 L19 8 V21 H6 Z"/><polyline points="14 3 14 8 19 8"/></g>,
    "branch":     <g fill="none" stroke={color} strokeWidth="1.5"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 8 V16 M8 6 H14 C16 6 18 7 18 9"/></g>,
    "download":   <g fill="none" stroke={color} strokeWidth="1.5"><path d="M12 4 V16"/><polyline points="7 12 12 17 17 12"/><line x1="4" y1="20" x2="20" y2="20"/></g>,
    "copy":       <g fill="none" stroke={color} strokeWidth="1.5"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 14 V5 C4 4.4 4.4 4 5 4 H14"/></g>,
    "ext":        <g fill="none" stroke={color} strokeWidth="1.5"><path d="M14 4 H20 V10"/><line x1="20" y1="4" x2="12" y2="12"/><path d="M18 14 V20 H4 V6 H10"/></g>,
    "filter":     <g fill="none" stroke={color} strokeWidth="1.5"><path d="M4 5 H20 L14 12 V19 L10 17 V12 Z"/></g>,
    "matrix":     <g fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><rect x="15" y="15" width="6" height="6"/></g>,
    "pulse":      <g fill="none" stroke={color} strokeWidth="1.5"><polyline points="3 12 7 12 9 6 13 18 15 9 17 12 21 12"/></g>,
    "users":      <g fill="none" stroke={color} strokeWidth="1.5"><circle cx="9" cy="8" r="3"/><path d="M3 20 C3 16 6 14 9 14 C12 14 15 16 15 20"/><circle cx="17" cy="9" r="2.4"/><path d="M21 20 C21 17 19 15 17 15"/></g>,
    "activity":   <g fill="none" stroke={color} strokeWidth="1.5"><polyline points="2 12 6 12 9 4 12 20 15 8 18 12 22 12"/></g>,
    "layers":     <g fill="none" stroke={color} strokeWidth="1.5"><polygon points="12 3 21 8 12 13 3 8"/><polyline points="3 13 12 18 21 13"/></g>,
    "globe":      <g fill="none" stroke={color} strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M3 12 H21 M12 3 C8 7 8 17 12 21 C16 17 16 7 12 3"/></g>,
    "lock":       <g fill="none" stroke={color} strokeWidth="1.5"><rect x="5" y="11" width="14" height="10"/><path d="M8 11 V8 C8 5.8 9.8 4 12 4 C14.2 4 16 5.8 16 8 V11"/></g>,
    "alert":      <g fill="none" stroke={color} strokeWidth="1.5"><path d="M12 3 L22 20 H2 Z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.6" fill={color}/></g>,
    "clock":      <g fill="none" stroke={color} strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></g>,
    "list":       <g fill="none" stroke={color} strokeWidth="1.5"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></g>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "0 0 auto" }}>
      {paths[name] || null}
    </svg>
  );
};

const SIDEBAR_W = 232;
const TOPBAR_H = 48;

// ===================== Sidebar =====================
const Sidebar = ({ active }) => {
  const sections = [
    { label: "// workspace", items: [
      { key: "dashboard", label: "DASHBOARD", icon: "pulse",    href: "Dashboard.html" },
      { key: "runs",      label: "RUNS",      icon: "terminal", href: "Runs.html" },
      { key: "seeds",     label: "SEEDS",     icon: "file",     href: "#", stub: true, count: 247 },
      { key: "agents",    label: "AGENTS",    icon: "users",    href: "#", stub: true, count: 7 },
      { key: "judges",    label: "JUDGES",    icon: "branch",   href: "#", stub: true },
    ]},
    { label: "// review", items: [
      { key: "threat",    label: "THREAT MODEL", icon: "shield",  href: "#", stub: true },
      { key: "coverage",  label: "COVERAGE",     icon: "matrix",  href: "#", stub: true },
      { key: "findings",  label: "FINDINGS",     icon: "alert",   href: "#", stub: true, count: 3 },
    ]},
    { label: "// system", items: [
      { key: "targets",   label: "TARGETS",   icon: "globe",  href: "#", stub: true },
      { key: "secrets",   label: "SECRETS",   icon: "lock",   href: "#", stub: true },
      { key: "schedule",  label: "SCHEDULE",  icon: "clock",  href: "#", stub: true },
    ]},
  ];
  return (
    <aside style={sb.root}>
      <a href="Marketing.html" style={sb.brand}>
        <svg viewBox="0 0 24 24" width="20" height="20">
          <g stroke="var(--bl-bone)" strokeWidth="2" strokeLinecap="square" fill="none">
            <path d="M2 2 H14 M20 2 V14 M20 8 V20 H8 M2 14 V2"/>
            <path d="M16 2 L20 6"/>
          </g>
        </svg>
        <div style={sb.brandText}>
          <span style={sb.brandTitle}>BOUNDARY</span>
          <span style={sb.brandSub}>_LABS</span>
        </div>
      </a>

      {sections.map(sec => (
        <div key={sec.label} style={sb.section}>
          <div style={sb.label}>{sec.label}</div>
          <nav style={sb.nav}>
            {sec.items.map(it => (
              <a
                key={it.key}
                href={it.href}
                style={{ ...sb.navItem, ...(active === it.key ? sb.navItemActive : null) }}
              >
                <Icon name={it.icon} size={14}/>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.count != null && (
                  <span style={sb.navCount}>{it.count}</span>
                )}
              </a>
            ))}
          </nav>
        </div>
      ))}

      <div style={sb.section}>
        <div style={sb.label}>// targets · live</div>
        <div style={sb.targets}>
          <div style={sb.target}>
            <span className="bl-live-dot"/>
            <div>
              <div style={sb.targetName}>clinical-copilot</div>
              <div style={sb.targetUrl}>railway · /readyz ok</div>
            </div>
          </div>
          <div style={sb.target}>
            <span style={{ ...sb.dot, background: "var(--bl-bone-4)" }}/>
            <div>
              <div style={sb.targetName}>localhost:8400</div>
              <div style={sb.targetUrl}>dev · offline</div>
            </div>
          </div>
        </div>
      </div>

      <div style={sb.footer}>
        <div style={sb.footerLine}>BL_HARNESS // v0.3.1</div>
        <div style={sb.footerLine}>session 2.h41m</div>
      </div>
    </aside>
  );
};

const sb = {
  root: {
    position: "fixed", left: 0, top: 0, bottom: 0, width: SIDEBAR_W,
    background: "var(--bl-void)",
    borderRight: "1px solid var(--bl-line)",
    padding: "16px 12px",
    display: "flex", flexDirection: "column", gap: 14,
    boxSizing: "border-box",
    overflowY: "auto",
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "0 4px 6px", textDecoration: "none", color: "var(--bl-bone)" },
  brandText: { display: "flex", alignItems: "baseline", gap: 0 },
  brandTitle: { fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--bl-bone)" },
  brandSub: { fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 400, color: "var(--bl-bone-3)" },
  section: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--bl-bone-4)", padding: "4px 4px 0" },
  nav: { display: "flex", flexDirection: "column", gap: 1 },
  navItem: {
    display: "flex", alignItems: "center", gap: 10,
    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, letterSpacing: "0.1em",
    background: "transparent", border: "1px solid transparent",
    padding: "7px 10px", borderRadius: 2,
    color: "var(--bl-bone-2)", cursor: "pointer", textDecoration: "none",
    transition: "background 80ms, color 80ms",
  },
  navItemActive: {
    background: "var(--bl-panel)",
    border: "1px solid var(--bl-line)",
    color: "var(--bl-bone)",
    boxShadow: "inset 2px 0 0 var(--bl-alarm)",
  },
  navCount: {
    fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--bl-bone-3)",
    background: "var(--bl-trough)", border: "1px solid var(--bl-line)",
    padding: "1px 5px", borderRadius: 2, letterSpacing: 0,
  },
  targets: { display: "flex", flexDirection: "column", gap: 6 },
  target: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--bl-line)", borderRadius: 2, background: "var(--bl-graphite)" },
  dot: { width: 8, height: 8, borderRadius: "50%", flex: "0 0 auto" },
  targetName: { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone)", letterSpacing: 0 },
  targetUrl: { fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--bl-bone-3)", letterSpacing: "0.06em", marginTop: 2 },
  footer: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 2, padding: "0 4px" },
  footerLine: { fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--bl-bone-4)", letterSpacing: "0.16em", textTransform: "uppercase" },
};

// ===================== TopBar =====================
const TopBar = ({ crumbs }) => (
  <header style={tb.root}>
    <div style={tb.crumbs}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={tb.sep}>/</span>}
          <span style={{ ...tb.crumb, ...(i === crumbs.length - 1 ? tb.crumbActive : null) }}>{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div style={tb.right}>
      <div style={tb.status}>
        <span className="bl-live-dot"/>
        <span>HARNESS LIVE · 4 / 4 OK</span>
      </div>
      <div style={tb.search}>
        <Icon name="search" size={12} color="var(--bl-bone-3)"/>
        <input placeholder="seed_id, run_id, sha…" style={tb.searchInput}/>
        <span className="bl-kbd" style={{ marginLeft: 0 }}>⌘K</span>
      </div>
      <button className="bl-btn">
        <Icon name="play" size={10} color="currentColor"/>
        RUN
        <span className="bl-kbd">⏎</span>
      </button>
    </div>
  </header>
);

const tb = {
  root: {
    position: "fixed", top: 0, left: SIDEBAR_W, right: 0, height: TOPBAR_H,
    background: "rgba(12,14,19,0.85)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid var(--bl-line)",
    padding: "0 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    boxSizing: "border-box", zIndex: 10,
  },
  crumbs: { display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 11 },
  sep: { color: "var(--bl-bone-4)" },
  crumb: { color: "var(--bl-bone-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 0 },
  crumbActive: { color: "var(--bl-bone)" },
  right: { display: "flex", alignItems: "center", gap: 12 },
  status: {
    display: "flex", alignItems: "center", gap: 8,
    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500,
    letterSpacing: "0.18em", color: "var(--bl-signal)",
    padding: "0 12px", height: 26,
    border: "1px solid #2F3B14", background: "var(--bl-signal-wash)",
    borderRadius: 2, whiteSpace: "nowrap",
  },
  search: {
    display: "flex", alignItems: "center", gap: 8,
    background: "var(--bl-trough)", border: "1px solid var(--bl-line)",
    padding: "0 10px", borderRadius: 2, height: 28, width: 260,
  },
  searchInput: { flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bl-bone)", letterSpacing: 0 },
};

// ===================== Page shell =====================
const Page = ({ children }) => (
  <main style={{
    paddingLeft: SIDEBAR_W + 24, paddingRight: 24, paddingTop: TOPBAR_H + 24, paddingBottom: 64,
    minHeight: "100vh", boxSizing: "border-box", maxWidth: 1700,
  }}>
    {children}
  </main>
);

// ===================== Verdict / sev =====================
const VerdictPill = ({ v }) => <span className={`bl-verdict bl-verdict--${v}`}>{v}</span>;
const SevBadge = ({ s }) => <span className={`bl-sev bl-sev--${s.toLowerCase()}`}>{s}</span>;

// ===================== Panel (with watermark head) =====================
const Panel = ({ watermark, right, children, style, bodyStyle, padded = true }) => (
  <section className="bl-panel" style={style}>
    <header className="bl-panel-head">
      <span className="bl-watermark">{watermark}</span>
      {right}
    </header>
    <div style={{ ...(padded ? { padding: "16px 18px" } : null), ...bodyStyle }}>
      {children}
    </div>
  </section>
);

Object.assign(window, {
  Icon, Sidebar, TopBar, Page, VerdictPill, SevBadge, Panel,
  SIDEBAR_W, TOPBAR_H,
});
