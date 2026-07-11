// DIAL — shared stylesheet + app shell (TopBar, Sidebar, primitives).
// CSS uses `var(--dial-*)` so all styles theme themselves when the wrapper
// flips its CSS-variable values (see theme.jsx).

const DIAL_STYLES = `
.dial-root {
  font-family: var(--dial-font);
  color: var(--dial-text);
  background: var(--dial-bg);
  width: 100%; height: 100%;
  /* clip, not hidden: hidden still lets the browser scroll the container
     when an off-screen child takes focus, panning the whole app sideways */
  overflow: clip;
  display: flex; flex-direction: column;
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  position: relative;
}
.dial-root * { box-sizing: border-box; }
.dial-root button { font-family: inherit; cursor: pointer; }
.dial-root input, .dial-root textarea, .dial-root select { font-family: inherit; color: inherit; }
.dial-root code, .dial-root .dial-mono { font-family: var(--dial-font-mono); }
.dial-root ::selection { background: var(--dial-accent); color: #fff; }

/* ───── Top bar ───── */
.dial-topbar {
  flex: 0 0 auto;
  height: 56px;
  display: flex; align-items: center;
  gap: 16px;
  padding: 0 20px;
  border-bottom: var(--dial-border-w) solid var(--dial-border);
  background: var(--dial-surface);
}
.dial-brand {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--dial-font-display);
  font-weight: var(--dial-display-weight);
  font-size: 18px;
  letter-spacing: var(--dial-letter-display);
  color: var(--dial-text);
  user-select: none;
}
.dial-brand .dot { color: var(--dial-accent); }
.dial-brand-mark {
  width: 22px; height: 22px;
  border-radius: var(--dial-radius-sm);
  background: var(--dial-accent);
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 12px;
  font-family: var(--dial-font-mono);
}
.dial-nav { display: flex; gap: 4px; margin-left: 12px; }
.dial-nav-item {
  background: transparent; border: 0; padding: 6px 12px;
  font-size: 13px; color: var(--dial-muted);
  border-radius: var(--dial-radius-sm);
}
.dial-nav-item:hover { color: var(--dial-text); background: var(--dial-bg-soft); }
.dial-nav-item.active { color: var(--dial-text); background: var(--dial-bg-soft); }
.dial-topbar-spacer { flex: 1; }
.dial-topbar-search {
  flex: 0 0 auto;
  display: flex; align-items: center;
  background: var(--dial-bg);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  padding: 5px 10px;
  width: 260px;
  gap: 8px;
  color: var(--dial-muted);
}
.dial-topbar-search input { background: transparent; border: 0; outline: 0; width: 100%; font-size: 13px; }
.dial-topbar-search input::placeholder { color: var(--dial-muted); }

/* Persona / org switcher */
.dial-persona {
  display: flex; align-items: center;
  background: var(--dial-bg);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  padding: 3px;
  gap: 2px;
}
.dial-persona button {
  background: transparent; border: 0;
  padding: 5px 10px;
  border-radius: calc(var(--dial-radius) - 3px);
  font-size: 12px;
  color: var(--dial-muted);
  display: inline-flex; align-items: center; gap: 6px;
}
.dial-persona button.active {
  background: var(--dial-surface);
  color: var(--dial-text);
  box-shadow: var(--dial-shadow);
}
.dial-persona button.active.acme { color: var(--dial-accent); }

.dial-iconbtn {
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: var(--dial-border-w) solid transparent;
  color: var(--dial-muted);
  border-radius: var(--dial-radius-sm);
}
.dial-iconbtn:hover { background: var(--dial-bg-soft); color: var(--dial-text); }
.dial-avatar {
  width: 28px; height: 28px;
  border-radius: 999px;
  background: var(--dial-accent);
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 11px;
  letter-spacing: 0;
}
.dial-root.theme-mono .dial-avatar { border-radius: 0; }

/* Theme switcher in the top-bar */
.dial-theme-switch {
  display: inline-flex; align-items: center; gap: 2px;
  background: var(--dial-bg);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  padding: 2px;
}
.dial-theme-switch button {
  background: transparent; border: 0;
  width: 24px; height: 22px;
  font-size: 10.5px; color: var(--dial-muted);
  border-radius: calc(var(--dial-radius) - 2px);
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--dial-font-mono);
  font-weight: 600;
  cursor: pointer;
}
.dial-theme-switch button.active {
  background: var(--dial-surface);
  color: var(--dial-text);
  box-shadow: var(--dial-shadow);
}
.dial-root.theme-mono .dial-theme-switch button { border-radius: 0; }

/* Subname demo-only inline note */
.dial-demo-note {
  font-size: 11px;
  color: var(--dial-muted);
  background: var(--dial-bg-soft);
  border: var(--dial-border-w) dashed var(--dial-border);
  border-radius: var(--dial-radius-sm);
  padding: 6px 10px;
  display: inline-flex; align-items: center; gap: 6px;
}

/* ───── Body / content ───── */
.dial-body {
  flex: 1; min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.dial-body::-webkit-scrollbar { width: 8px; }
.dial-body::-webkit-scrollbar-thumb { background: var(--dial-border); border-radius: 4px; }
.dial-section { padding: 28px 36px; max-width: 1100px; margin: 0 auto; }
.dial-section.wide { max-width: none; padding: 28px 36px; }
.dial-eyebrow {
  display: inline-block;
  font-size: 10.5px;
  letter-spacing: var(--dial-letter-tag);
  text-transform: uppercase;
  color: var(--dial-muted);
  font-weight: 600;
  margin-bottom: 8px;
}
.dial-eyebrow.accent { color: var(--dial-accent); }
.dial-h1 {
  font-family: var(--dial-font-display);
  font-weight: var(--dial-display-weight);
  letter-spacing: var(--dial-letter-display);
  font-size: 38px;
  line-height: 1.05;
  margin: 0 0 12px;
  color: var(--dial-text);
}
.dial-h2 {
  font-family: var(--dial-font-display);
  font-weight: var(--dial-display-weight);
  letter-spacing: var(--dial-letter-display);
  font-size: 22px;
  margin: 0 0 12px;
}
.dial-h3 { font-size: 15px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.005em; }
.dial-muted { color: var(--dial-muted); }
.dial-text-2 { color: var(--dial-text-2); }

/* ───── Buttons ───── */
.dial-btn {
  display: inline-flex; align-items: center; justify-content: center;
  gap: 6px;
  border: var(--dial-border-w) solid var(--dial-border);
  background: var(--dial-surface);
  color: var(--dial-text);
  padding: 8px 14px;
  border-radius: var(--dial-radius-sm);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.12s, border-color 0.12s, transform 0.05s;
}
.dial-btn:hover { background: var(--dial-bg-soft); }
.dial-btn:active { transform: translateY(0.5px); }
.dial-btn.primary {
  background: var(--dial-accent); color: #fff; border-color: var(--dial-accent);
}
.dial-btn.primary:hover { background: var(--dial-accent-2); border-color: var(--dial-accent-2); }
.dial-btn.ghost {
  background: transparent; border-color: transparent; color: var(--dial-muted);
}
.dial-btn.ghost:hover { color: var(--dial-text); background: var(--dial-bg-soft); }
.dial-btn.danger { color: var(--dial-accent); }
.dial-btn.danger:hover { background: var(--dial-accent-bg); }
.dial-btn.lg { padding: 11px 18px; font-size: 14px; }
.dial-btn.sm { padding: 5px 10px; font-size: 12px; }
.dial-btn[disabled] { opacity: 0.45; cursor: not-allowed; }

/* ───── Surfaces / Cards ───── */
.dial-card {
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  box-shadow: var(--dial-shadow);
}
.dial-card.tint {
  background: var(--dial-surface-2);
}
.dial-card.outline {
  background: transparent;
}
.dial-row { display: flex; gap: 12px; align-items: center; }

/* ───── Pills / Tags ───── */
.dial-pill {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px;
  letter-spacing: 0.02em;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 999px;
  border: var(--dial-border-w) solid var(--dial-border);
  color: var(--dial-muted);
  background: var(--dial-surface);
}
.dial-root.theme-mono .dial-pill { border-radius: 0; }
.dial-pill.ok    { color: var(--dial-ok); border-color: var(--dial-ok); }
.dial-pill.warn  { color: var(--dial-warn); border-color: var(--dial-warn); }
.dial-pill.red   { color: var(--dial-accent); border-color: var(--dial-accent); background: var(--dial-accent-bg); }
.dial-pill.solid { color: #fff; background: var(--dial-accent); border-color: var(--dial-accent); }

/* ───── Inputs ───── */
.dial-input-wrap {
  display: flex; align-items: center; gap: 8px;
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  padding: 0 14px;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.dial-input-wrap.focus { border-color: var(--dial-accent); box-shadow: 0 0 0 3px var(--dial-accent-bg); }
.dial-input-wrap input {
  flex: 1;
  background: transparent; border: 0; outline: 0;
  padding: 12px 0;
  font-size: 15px;
  color: var(--dial-text);
}
.dial-input-wrap input::placeholder { color: var(--dial-muted); }
.dial-input-wrap.lg input { padding: 16px 0; font-size: 18px; }
.dial-input-wrap.hero input { padding: 20px 0; font-size: 22px; letter-spacing: -0.01em; }
.dial-input-wrap .suffix { color: var(--dial-muted); font-family: var(--dial-font-mono); font-size: 14px; }
.dial-input-wrap.hero .suffix { font-size: 20px; }
.dial-field-label { display: block; font-size: 11.5px; letter-spacing: var(--dial-letter-tag);
  text-transform: uppercase; color: var(--dial-muted); margin-bottom: 6px; font-weight: 600; }

/* ───── Toast ───── */
.dial-toast {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  background: var(--dial-text); color: var(--dial-bg);
  padding: 9px 14px; border-radius: var(--dial-radius-sm);
  font-size: 13px;
  display: flex; align-items: center; gap: 8px;
  box-shadow: var(--dial-shadow-lg);
  z-index: 50;
  animation: dial-toast-in 0.18s ease-out;
}
@keyframes dial-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }

/* ───── Modal ───── */
.dial-modal-backdrop {
  position: absolute; inset: 0;
  background: rgba(10, 10, 12, 0.45);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 30;
  animation: dial-fade 0.16s ease-out;
}
.dial-root.theme-mono .dial-modal-backdrop { background: rgba(0,0,0,0.30); backdrop-filter: none; }
@keyframes dial-fade { from { opacity: 0; } to { opacity: 1; } }

/* Right-side drawer (used for sign-in) */
.dial-drawer-backdrop {
  position: absolute; inset: 0;
  background: rgba(10, 10, 12, 0.40);
  backdrop-filter: blur(2px);
  display: flex; justify-content: flex-end;
  z-index: 30;
  animation: dial-fade 0.16s ease-out;
}
.dial-root.theme-mono .dial-drawer-backdrop { background: rgba(0,0,0,0.30); backdrop-filter: none; }
.dial-drawer {
  background: var(--dial-surface);
  border-left: var(--dial-border-w) solid var(--dial-border);
  box-shadow: var(--dial-shadow-lg);
  width: 420px;
  max-width: 92%;
  height: 100%;
  display: flex; flex-direction: column;
  animation: dial-drawer-slide 0.22s ease-out;
}
@keyframes dial-drawer-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
.dial-drawer-head {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 12px;
  padding: 18px 22px 14px;
  border-bottom: var(--dial-border-w) solid var(--dial-border);
}
.dial-drawer-body { flex: 1; overflow-y: auto; padding: 22px; }

/* Social login button (Google / Apple) */
.dial-social-btn {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 100%;
  padding: 11px 14px;
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  font-size: 13.5px; font-weight: 500;
  color: var(--dial-text);
  cursor: pointer;
  margin-bottom: 10px;
  transition: background 0.12s, border-color 0.12s;
}
.dial-social-btn:hover { background: var(--dial-bg-soft); border-color: var(--dial-border-2, var(--dial-border)); }
.dial-social-btn.apple { background: #000; color: #fff; border-color: #000; }
.dial-social-btn.apple:hover { background: #1a1a1a; }
.dial-root.theme-mono .dial-social-btn { border-radius: 0; }

.dial-divider-text {
  display: flex; align-items: center; gap: 12px;
  margin: 16px 0;
  font-size: 11px;
  color: var(--dial-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.dial-divider-text::before, .dial-divider-text::after {
  content: ''; flex: 1; height: 1px; background: var(--dial-border);
}

/* Cart mini-popover (anchored under the top-bar cart icon) */
.dial-cart-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 360px;
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  box-shadow: var(--dial-shadow-lg);
  z-index: 40;
  padding: 14px 16px 16px;
  animation: dial-fade 0.14s ease-out;
}
.dial-cart-popover::before {
  /* Caret pointing to the cart button */
  content: '';
  position: absolute;
  top: -6px;
  right: 12px;
  width: 12px;
  height: 12px;
  background: var(--dial-surface);
  border-left: var(--dial-border-w) solid var(--dial-border);
  border-top: var(--dial-border-w) solid var(--dial-border);
  transform: rotate(45deg);
}
.dial-cart-popover-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0;
  border-top: var(--dial-border-w) solid var(--dial-border);
}
.dial-cart-popover-row:first-child { border-top: 0; }

/* Avatar popover — name + logout, shown on hover */
.dial-avatar-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  box-shadow: var(--dial-shadow-lg);
  z-index: 40;
  overflow: hidden;
  animation: dial-fade 0.14s ease-out;
}
.dial-avatar-popover::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 12px;
  width: 12px;
  height: 12px;
  background: var(--dial-surface);
  border-left: var(--dial-border-w) solid var(--dial-border);
  border-top: var(--dial-border-w) solid var(--dial-border);
  transform: rotate(45deg);
}

/* Sign-in popover — same anchored-dropdown pattern as the cart popover. */
.dial-signin-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 380px;
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  box-shadow: var(--dial-shadow-lg);
  z-index: 40;
  padding: 16px;
  animation: dial-fade 0.14s ease-out;
}
.dial-signin-popover::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 12px;
  width: 12px;
  height: 12px;
  background: var(--dial-surface);
  border-left: var(--dial-border-w) solid var(--dial-border);
  border-top: var(--dial-border-w) solid var(--dial-border);
  transform: rotate(45deg);
}
.dial-modal {
  background: var(--dial-surface);
  border: var(--dial-border-w) solid var(--dial-border);
  border-radius: var(--dial-radius);
  box-shadow: var(--dial-shadow-lg);
  width: 580px;
  max-width: 92%;
  max-height: 86%;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.dial-modal.wide { width: 720px; }
.dial-modal-head {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  border-bottom: var(--dial-border-w) solid var(--dial-border);
}
.dial-modal-title {
  font-family: var(--dial-font-display);
  font-weight: var(--dial-display-weight);
  letter-spacing: var(--dial-letter-display);
  font-size: 17px;
}
.dial-modal-body { flex: 1; overflow-y: auto; padding: 20px 20px 4px; }
.dial-modal-foot {
  flex: 0 0 auto;
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 14px 20px;
  border-top: var(--dial-border-w) solid var(--dial-border);
  background: var(--dial-surface-2);
}

/* Step indicator */
.dial-steps { display: flex; gap: 8px; align-items: center; margin-bottom: 18px; }
.dial-step {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: var(--dial-muted);
  letter-spacing: 0.02em;
}
.dial-step .num {
  width: 20px; height: 20px;
  border-radius: 999px;
  background: var(--dial-bg-soft);
  border: var(--dial-border-w) solid var(--dial-border);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600;
}
.dial-root.theme-mono .dial-step .num { border-radius: 0; }
.dial-step.active { color: var(--dial-text); font-weight: 600; }
.dial-step.active .num { background: var(--dial-accent); color: #fff; border-color: var(--dial-accent); }
.dial-step.done    .num { background: var(--dial-ok); color: #fff; border-color: var(--dial-ok); }
.dial-step .bar {
  width: 24px; height: 1.5px;
  background: var(--dial-border);
  margin: 0 2px;
}

/* Theme-specific tweaks layered on top of variable-driven base */
.dial-root.theme-mono .dial-card { box-shadow: 2px 2px 0 var(--dial-border); }
.dial-root.theme-mono .dial-btn { font-weight: 600; }
.dial-root.theme-mono .dial-eyebrow { font-family: var(--dial-font-mono); }
.dial-root.theme-dark .dial-h1 { color: #fff; }
.dial-root.theme-cream .dial-card { box-shadow: 0 1px 0 rgba(0,0,0,0.03), 0 8px 24px rgba(20,12,0,0.03); }

/* ───── Mobile (≤760px) ─────
   Desktop shell reflowed for phones: the top bar wraps into two rows
   (brand + actions, then a full-width scrollable nav), popovers become
   viewport-wide sheets, modals become bottom sheets, and screens opt into
   single-column layouts via the m-* utilities below. The m-* rules are
   !important because screens carry their layout as inline styles.
   Keep the breakpoint in sync with DIAL_MOBILE_BP / useIsMobile(). */
@media (max-width: 760px) {
  .dial-topbar {
    height: auto;
    min-height: 52px;
    flex-wrap: wrap;
    padding: 6px 12px;
    column-gap: 8px;
    row-gap: 0;
  }
  .dial-nav {
    order: 10;
    flex: 1 1 100%;
    margin-left: -4px;
    overflow-x: auto;
    scrollbar-width: none;
    white-space: nowrap;
    padding: 2px 0 4px;
  }
  .dial-nav::-webkit-scrollbar { display: none; }
  .dial-nav-item { padding: 8px 10px; flex: 0 0 auto; }
  .dial-iconbtn { width: 38px; height: 38px; }
  .dial-avatar { width: 34px; height: 34px; font-size: 12px; }

  /* Anchored popovers become sheets pinned under the two-row top bar. */
  .dial-cart-popover, .dial-signin-popover, .dial-avatar-popover {
    position: fixed;
    top: 92px;
    left: 10px; right: 10px;
    width: auto;
    min-width: 0;
    max-height: calc(100dvh - 104px);
    overflow-y: auto;
  }
  .dial-cart-popover::before, .dial-signin-popover::before, .dial-avatar-popover::before { display: none; }

  .dial-drawer { width: 100%; max-width: 100%; border-left: 0; }

  .dial-modal-backdrop { align-items: flex-end; }
  .dial-modal, .dial-modal.wide {
    width: 100%;
    max-width: 100%;
    max-height: calc(100dvh - 32px);
    border-radius: var(--dial-radius-lg) var(--dial-radius-lg) 0 0;
    border-left: 0; border-right: 0; border-bottom: 0;
  }
  .dial-modal-body { overflow-x: hidden; }
  .dial-modal-foot { flex-wrap: wrap; }
  .dial-modal-foot .dial-btn { flex: 1 1 auto; min-height: 44px; white-space: normal; }
  .dial-steps { flex-wrap: wrap; row-gap: 6px; }
  .dial-step .bar { display: none; }
  .dial-btn.sm { min-height: 38px; padding: 8px 12px; }
  .dial-input-wrap input { min-width: 0; }
  .dial-input-wrap .suffix { max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Inline 24px remove button in the basket popover — a destructive tap
     target whose parent row navigates on click; needs real touch size. */
  .dial-cart-popover .dial-iconbtn { width: 36px !important; height: 36px !important; }

  .dial-section, .dial-section.wide { padding: 18px 14px 28px; }
  .dial-h1 { font-size: 28px; }
  .dial-h2 { font-size: 19px; }

  .dial-toast { max-width: calc(100vw - 20px); width: max-content; }

  /* Layout utilities — screens add these classNames next to their inline
     styles; !important lets the class win over the inline declaration. */
  .dial-root .m-grid1 { grid-template-columns: 1fr !important; }
  .dial-root .m-grid2 { grid-template-columns: 1fr 1fr !important; }
  .dial-root .m-stack { display: flex !important; flex-direction: column !important; align-items: stretch !important; }
  .dial-root .m-wrap { flex-wrap: wrap !important; }
  .dial-root .m-hide { display: none !important; }
  .dial-root .m-full { width: 100% !important; min-width: 0 !important; max-width: 100% !important; }
  .dial-root .m-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .dial-root .m-tabs { overflow-x: auto !important; flex-wrap: nowrap !important; white-space: nowrap; scrollbar-width: none; }
  .dial-root .m-tabs::-webkit-scrollbar { display: none; }
  .dial-root .m-break { overflow-wrap: anywhere; word-break: break-word; }
  .dial-root .m-pad0 { padding: 0 !important; }
  /* In a wrapping row: claim over half the line so trailing siblings
     (pills, buttons) wrap below and this block gets the full width. */
  .dial-root .m-min60 { min-width: 60% !important; }
}

/* iOS Safari zooms the page when a focused control's computed font-size is
   under 16px. Only touch devices need that floor — a narrowed desktop
   window keeps the designed input sizes. */
@media (max-width: 760px) and (pointer: coarse) {
  .dial-root input, .dial-root select, .dial-root textarea { font-size: 16px !important; }
}
`;

// Inject the stylesheet once per page.
function injectDialStyles() {
  if (document.getElementById('__dial_styles')) return;
  const el = document.createElement('style');
  el.id = '__dial_styles';
  el.textContent = DIAL_STYLES;
  document.head.appendChild(el);
}

// Convenience context — every screen reads { state, dispatch, theme } via useDial().
const DialCtx = React.createContext(null);
const useDial = () => React.useContext(DialCtx);

// Mobile breakpoint — keep in sync with the @media blocks in DIAL_STYLES.
// Screens use this for structural changes CSS can't express (reordering,
// swapping a table for cards); pure layout changes should prefer the m-*
// utility classes so they stay in one place.
const DIAL_MOBILE_BP = 760;
function useIsMobile() {
  const [mobile, setMobile] = React.useState(() => window.matchMedia(`(max-width: ${DIAL_MOBILE_BP}px)`).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DIAL_MOBILE_BP}px)`);
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

window.DIAL_STYLES = DIAL_STYLES;
window.injectDialStyles = injectDialStyles;
window.DialCtx = DialCtx;
window.useDial = useDial;
window.DIAL_MOBILE_BP = DIAL_MOBILE_BP;
window.useIsMobile = useIsMobile;
