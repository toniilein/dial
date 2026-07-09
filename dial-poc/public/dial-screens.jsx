// DIAL — TopBar + main screens (Home, Dashboard, NameDetail).
// Reads state from useDial(), mutates only via dispatch / async actions in dial-state.jsx.

const { Search, ArrowR, ArrowL, Check, CheckCircle, X, Plus, Edit, Copy, External,
  Shield, User, Building, Wallet, Globe, Hash, Chevron, ChevronDown, Bell,
  Wand, Refresh, Code, Dollar, Calendar, Spinner, Cart, Trash2, Chain } = window.DialIcons;

// ─────────────────────────────────────────────────────────────
// TopBar — brand, nav, search, persona, theme switcher, avatar
// ─────────────────────────────────────────────────────────────
function DialTopBar() {
  const { state, dispatch, themeName, setThemeName } = useDial();
  const onNav = (screen) => () => dispatch({ type: 'route', route: { screen } });
  const active = state.route.screen;
  const isAcme = state.org === 'acme';
  const id = state.identity[state.org];
  const loggedIn = state.loggedIn;

  const goHome = () => dispatch({ type: 'route', route: { screen: 'home' } });

  // Hover-aware popovers — open on mouseenter, close after a short grace
  // period on mouseleave so the user can move into the popover content.
  // Click still toggles for tap/keyboard.
  const HOVER_CLOSE_MS = 200;
  const [cartOpen, setCartOpen]     = React.useState(false);
  const [signinOpen, setSigninOpen] = React.useState(false);
  const [avatarOpen, setAvatarOpen] = React.useState(false);
  const cartRef   = React.useRef(null);
  const signinRef = React.useRef(null);
  const avatarRef = React.useRef(null);
  const cartTimer   = React.useRef(null);
  const signinTimer = React.useRef(null);
  const avatarTimer = React.useRef(null);

  const openCart   = () => { clearTimeout(cartTimer.current);   setCartOpen(true);  };
  const openSignin = () => { clearTimeout(signinTimer.current); setSigninOpen(true); };
  const openAvatar = () => { clearTimeout(avatarTimer.current); setAvatarOpen(true); };
  const closeCartSoon   = () => { clearTimeout(cartTimer.current);   cartTimer.current   = setTimeout(() => setCartOpen(false),  HOVER_CLOSE_MS); };
  const closeSigninSoon = () => { clearTimeout(signinTimer.current); signinTimer.current = setTimeout(() => setSigninOpen(false), HOVER_CLOSE_MS); };
  const closeAvatarSoon = () => { clearTimeout(avatarTimer.current); avatarTimer.current = setTimeout(() => setAvatarOpen(false), HOVER_CLOSE_MS); };

  // Outside-click fallback (only fires when popover is open and click is
  // truly outside — mouseleave handles the normal case).
  React.useEffect(() => {
    if (!cartOpen && !signinOpen && !avatarOpen) return;
    const onDocClick = (e) => {
      if (cartOpen   && cartRef.current   && !cartRef.current.contains(e.target))   setCartOpen(false);
      if (signinOpen && signinRef.current && !signinRef.current.contains(e.target)) setSigninOpen(false);
      if (avatarOpen && avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [cartOpen, signinOpen, avatarOpen]);
  React.useEffect(() => { setCartOpen(false); setSigninOpen(false); setAvatarOpen(false); }, [state.route.screen]);
  React.useEffect(() => { if (state.loggedIn) setSigninOpen(false); }, [state.loggedIn]);
  React.useEffect(() => { if (!state.loggedIn) setAvatarOpen(false); }, [state.loggedIn]);

  return (
    <div className="dial-topbar">
      <div className="dial-brand" onClick={goHome} title="Home" style={{ cursor: 'pointer' }}>
        <span className="dial-brand-mark">D</span>
        DIAL<span className="dot">.</span>
      </div>
      <div className="dial-nav">
        <button className={`dial-nav-item ${active === 'home' ? 'active' : ''}`} onClick={onNav('home')}>Search</button>
        {loggedIn && (
          <button className={`dial-nav-item ${active === 'dashboard' || active === 'name' || active === 'domain' ? 'active' : ''}`} onClick={onNav('dashboard')}>My names</button>
        )}
        {loggedIn && (
          <button className={`dial-nav-item ${active === 'inbox' || active === 'conversation' ? 'active' : ''}`} onClick={onNav('inbox')}>Inbox</button>
        )}
        <button className={`dial-nav-item ${active === 'admin' ? 'active' : ''}`} onClick={onNav('admin')}>Admin</button>
        <button className={`dial-nav-item ${active === 'chains' ? 'active' : ''}`} onClick={onNav('chains')}>On-chain</button>
      </div>

      <div className="dial-topbar-spacer" />

      {loggedIn && <TopWalletChip />}

      <div ref={cartRef} style={{ position: 'relative' }}
        onMouseEnter={openCart} onMouseLeave={closeCartSoon}>
        <button className="dial-iconbtn" title="Cart"
          onClick={openCart}
          style={{ position: 'relative' }}>
          <Cart size={16} />
          {state.cart.length > 0 && (
            <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 14, height: 14, padding: '0 4px',
              borderRadius: 999, background: 'var(--dial-accent)', color: '#fff', fontSize: 9, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
              {state.cart.length}
            </span>
          )}
        </button>
        <CartPopover open={cartOpen} onClose={() => setCartOpen(false)} />
      </div>

      {loggedIn ? (
        <>
          <button className="dial-iconbtn" title="Notifications"><Bell size={16} /></button>
          <div ref={avatarRef} style={{ position: 'relative' }}
            onMouseEnter={openAvatar} onMouseLeave={closeAvatarSoon}>
            <div className="dial-avatar" title={id.name} style={{ cursor: 'pointer' }}>
              {id.initials || (isAcme ? 'A' : 'DP')}
            </div>
            <AvatarPopover open={avatarOpen} onClose={() => setAvatarOpen(false)} />
          </div>
        </>
      ) : (
        <div ref={signinRef} style={{ position: 'relative' }}
          onMouseEnter={openSignin} onMouseLeave={closeSigninSoon}>
          <button className="dial-btn primary" onClick={openSignin}>
            Sign in
          </button>
          <SigninPopover open={signinOpen} onClose={() => setSigninOpen(false)} />
        </div>
      )}
    </div>
  );
}

// Mini-cart popover — Zalando-style preview anchored under the top-bar cart
// icon. Lists items, shows the total, and CTAs to the full basket view.
// Stays mounted across hover open/close so any local state is preserved.
function CartPopover({ open, onClose }) {
  const { state, dispatch } = useDial();
  const hidden = { display: 'none' };
  const items = state.cart;
  const verified = state.loggedIn && state.identity[state.org]?.verified;

  const total = items.reduce((a, it) => {
    const label = it.name.replace(/\.dial$/, '');
    const p = dialPrice(label, { verified });
    return a + p.usdc * it.duration_years;
  }, 0);

  const goCart = () => { dispatch({ type: 'route', route: { screen: 'cart' } }); onClose(); };
  const goHome = () => { dispatch({ type: 'route', route: { screen: 'home' } }); onClose(); };

  if (items.length === 0) {
    return (
      <div className="dial-cart-popover" onClick={goCart} style={{ cursor: 'pointer', ...(open ? {} : hidden) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Cart size={16} stroke="var(--dial-muted)" />
          <strong style={{ fontSize: 13 }}>Your basket is empty</strong>
        </div>
        <div className="dial-muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Add names from the search to see them here.
        </div>
        <button className="dial-btn primary sm" style={{ width: '100%' }} onClick={(e) => { e.stopPropagation(); goHome(); }}>
          <Search size={12} stroke="#fff" /> Find a name
        </button>
      </div>
    );
  }

  return (
    <div className="dial-cart-popover" onClick={goCart} style={{ cursor: 'pointer', ...(open ? {} : hidden) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>Your basket</strong>
        <span className="dial-muted" style={{ fontSize: 11 }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto', margin: '0 -4px' }}>
        {items.map((it) => {
          const label = it.name.replace(/\.dial$/, '');
          const p = dialPrice(label, { verified });
          const line = p.usdc * it.duration_years;
          return (
            <div key={it.name} className="dial-cart-popover-row" style={{ padding: '8px 4px' }}>
              <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 'var(--dial-radius-sm)',
                background: 'var(--dial-accent-bg)', color: 'var(--dial-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--dial-font-mono)', fontWeight: 700, fontSize: 12 }}>
                {it.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dial-mono" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                <div className="dial-muted" style={{ fontSize: 11 }}>{it.duration_years} year{it.duration_years > 1 ? 's' : ''}</div>
              </div>
              <div className="dial-mono" style={{ fontSize: 12, fontWeight: 600 }}>{line} USDC</div>
              <button className="dial-iconbtn" title="Remove" style={{ width: 24, height: 24 }}
                onClick={(e) => { e.stopPropagation(); dispatch({ type: 'cart-remove', index: items.indexOf(it) }); }}>
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 0 6px', borderTop: 'var(--dial-border-w) solid var(--dial-border)', marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Total</span>
        <span className="dial-mono" style={{ fontSize: 14, fontWeight: 700 }}>{total} USDC</span>
      </div>
      <button className="dial-btn primary" style={{ width: '100%', marginTop: 6 }}
        onClick={(e) => { e.stopPropagation(); goCart(); }}>
        View basket <ArrowR size={12} stroke="#fff" />
      </button>
    </div>
  );
}

// Sign-in popover — anchored dropdown matching the cart popover. Contains
// the same content as the right-side drawer (social login + form + toggle)
// in a more compact wrapper.
function SigninPopover({ open, onClose }) {
  const Panel = window.AuthPanel;
  return (
    <div className="dial-signin-popover" onClick={e => e.stopPropagation()}
      style={open ? undefined : { display: 'none' }}>
      <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Sign in to DIAL</strong>
      {Panel && <Panel onClose={onClose} />}
    </div>
  );
}

// Avatar hover popover — shows the persona's name + a Logout button.
// Stays mounted so it doesn't flicker on hover, and any internal state
// (none today, but consistent with the cart/signin pattern) persists.
function AvatarPopover({ open, onClose }) {
  const { state, dispatch } = useDial();
  const id = state.identity[state.org];
  const persona = (window.PERSONAS && window.PERSONAS[state.org]) || {};
  const logout = () => { dispatch({ type: 'logout' }); onClose(); };
  const goAccount = () => { dispatch({ type: 'modal', modal: { kind: 'account' } }); onClose(); };
  const itemStyle = {
    width: '100%', padding: '11px 16px', textAlign: 'left',
    border: 0, background: 'transparent', cursor: 'pointer',
    fontSize: 13, color: 'var(--dial-text)',
    display: 'flex', alignItems: 'center', gap: 8,
  };
  const hover = e => e.currentTarget.style.background = 'var(--dial-bg-soft)';
  const unhover = e => e.currentTarget.style.background = 'transparent';
  return (
    <div className="dial-avatar-popover" onClick={e => e.stopPropagation()}
      style={open ? undefined : { display: 'none' }}>
      <div style={{ padding: '14px 16px 12px', borderBottom: 'var(--dial-border-w) solid var(--dial-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="dial-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
            {id.initials || ''}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{id.name}</div>
            <div className="dial-muted" style={{ fontSize: 11.5, marginTop: 1 }}>
              {state.org === 'acme' ? 'Enterprise account' : 'Personal account'}
            </div>
          </div>
        </div>
      </div>
      <button onClick={goAccount} style={itemStyle} onMouseEnter={hover} onMouseLeave={unhover}>
        <User size={14} /> Account &amp; address
      </button>
      <div style={{ height: 1, background: 'var(--dial-border)' }} />
      <button onClick={logout} style={itemStyle} onMouseEnter={hover} onMouseLeave={unhover}>
        <ArrowL size={14} /> Logout
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Home / Search — hero search with debounced backend availability
// ─────────────────────────────────────────────────────────────
function ScreenHome() {
  const { state, dispatch } = useDial();
  const inputRef = React.useRef(null);
  const [focus, setFocus] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState(null);

  // 'name' or 'domain' — only meaningful in Acme context.
  const [mode, setMode] = React.useState('name');
  const isAcme = state.org === 'acme';
  React.useEffect(() => { if (!isAcme) setMode('name'); }, [isAcme]);

  React.useEffect(() => {
    if (!state.query) { setResult(null); return; }
    setChecking(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const norm = dialNormalise(state.query);
      if (!norm.valid) {
        if (!cancelled) { setResult({ kind: 'invalid', mode, reason: norm.reason, label: norm.label }); setChecking(false); }
        return;
      }
      try {
        if (mode === 'domain') {
          const av = await dialDomainCheck(norm.label);
          if (cancelled) return;
          const price = dialDomainPrice(norm.label);
          setResult({ kind: av.available ? 'available' : 'taken', mode: 'domain', label: norm.label, reason: av.reason, price });
        } else {
          const av = await dialCheck(norm.label);
          if (cancelled) return;
          const isVerified = state.loggedIn && state.identity[state.org]?.verified;
          const price = dialPrice(norm.label, { verified: isVerified });
          const priceList = dialPrice(norm.label);
          setResult({ kind: av.available ? 'available' : 'taken', mode: 'name', label: norm.label, reason: av.reason, price, priceList });
        }
      } catch (e) {
        if (!cancelled) setResult({ kind: 'invalid', mode, label: norm.label, reason: e.message });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [state.query, mode]);

  React.useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

  const suggestions = mode === 'domain'
    ? ['globex', 'initech', 'soylent', 'umbrella', 'pied-piper']
    : ['david', 'acme', 'satoshi', 'vodafone-treasury', 'dao-of-dao'];

  return (
    <div className="dial-section" style={{ paddingTop: isAcme ? 40 : 56 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <span className="dial-eyebrow accent">A name for every chain · Phase 0</span>
        <h1 className="dial-h1" style={{ fontSize: 44, maxWidth: 720, margin: '4px auto 14px' }}>
          {mode === 'domain'
            ? <>Your <span style={{ color: 'var(--dial-accent)' }}>corporate domain.</span> Your namespace.</>
            : <>One name. <span style={{ color: 'var(--dial-accent)' }}>Every chain.</span></>}
        </h1>
        <p className="dial-muted" style={{ maxWidth: 560, margin: '0 auto', fontSize: 15 }}>
          {mode === 'domain'
            ? <>Register a verifiable corporate TLD — like <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>.acme</code> — and issue an unlimited number of names under it for teams, services, and vaults.</>
            : <>Register a DIAL name — like <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>david.dial</code> — and map it to your Canton party and EVM address. Counterparties send to the name. Identity verified through Pairpoint.</>}
        </p>
      </div>

      {isAcme && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div className="dial-persona" style={{ padding: 4 }}>
            <button className={mode === 'name'   ? 'active' : ''} onClick={() => { setMode('name');   dispatch({ type: 'query', query: '' }); }}>
              <Hash size={12} /> Find a name
            </button>
            <button className={mode === 'domain' ? 'active acme' : ''} onClick={() => { setMode('domain'); dispatch({ type: 'query', query: '' }); }}>
              <Building size={12} /> Register a corporate domain
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className={`dial-input-wrap hero ${focus ? 'focus' : ''}`}>
          <Search size={20} stroke="var(--dial-muted)" />
          {mode === 'domain' && <span className="suffix">.</span>}
          <input ref={inputRef}
            placeholder={mode === 'domain' ? 'acme' : 'david'}
            value={state.query}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onChange={(e) => dispatch({ type: 'query', query: e.target.value })} />
          {mode === 'name' && <span className="suffix">.dial</span>}
          {checking && <Spinner size={18} stroke="var(--dial-muted)" />}
        </div>

        {state.query && result && (
          <div style={{ marginTop: 14 }}>
            <ResultCard result={result} />
          </div>
        )}

        {!state.query && (
          <div style={{ marginTop: 16, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="dial-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Try</span>
            {suggestions.map(s => (
              <button key={s} className="dial-btn sm" onClick={() => dispatch({ type: 'query', query: s })}>
                {mode === 'domain' ? <><span style={{ color: 'var(--dial-muted)' }}>.</span>{s}</> : <>{s}<span style={{ color: 'var(--dial-muted)' }}>.dial</span></>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HowCard({ num, title, icon, children }) {
  return (
    <div className="dial-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="dial-mono" style={{ fontSize: 11, color: 'var(--dial-muted)' }}>{num}</span>
        <span style={{ flex: 1 }} />
        {icon}
      </div>
      <div className="dial-h3" style={{ marginBottom: 6 }}>{title}</div>
      <div className="dial-muted" style={{ fontSize: 13 }}>{children}</div>
    </div>
  );
}

function ResultCard({ result }) {
  const { state, dispatch } = useDial();
  const display = result.mode === 'domain' ? '.' + result.label : result.label + '.dial';
  if (result.kind === 'invalid') {
    return (
      <div className="dial-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10, borderColor: 'var(--dial-warn)' }}>
        <X size={16} stroke="var(--dial-warn)" />
        <span>Invalid {result.mode === 'domain' ? 'domain' : 'name'}. {result.reason}</span>
      </div>
    );
  }
  if (result.kind === 'taken') {
    return (
      <div className="dial-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="dial-pill warn">{result.reason === 'reserved' ? 'Reserved' : 'Taken'}</span>
        <div style={{ flex: 1 }}>
          <div className="dial-mono" style={{ fontSize: 17, fontWeight: 600 }}>{display}</div>
          <div className="dial-muted" style={{ fontSize: 12 }}>
            {result.reason === 'reserved'
              ? `This ${result.mode === 'domain' ? 'corporate domain' : 'name'} is on the reserved / trademark blocklist.`
              : `This ${result.mode === 'domain' ? 'corporate domain' : 'name'} is already registered to another party.`}
          </div>
        </div>
      </div>
    );
  }
  const { price } = result;
  const isDomain = result.mode === 'domain';
  const hasDiscount = !isDomain && price.discountPct > 0;
  const couldDiscount = !isDomain && !hasDiscount && state.loggedIn && !state.identity[state.org]?.verified;
  const couldDiscountSave = couldDiscount ? Math.round(price.usdc * VERIFIED_DISCOUNT_PCT) / 100 : 0;
  return (
    <div className="dial-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <span className="dial-pill ok"><CheckCircle size={11} /> Available</span>
      <div style={{ flex: 1 }}>
        <div className="dial-mono" style={{ fontSize: 17, fontWeight: 600 }}>{display}</div>
        <div className="dial-muted" style={{ fontSize: 12 }}>
          {price.tier} ·{' '}
          {hasDiscount && <span style={{ textDecoration: 'line-through', marginRight: 4 }}>{price.listUsdc.toLocaleString()}</span>}
          <span style={{ color: hasDiscount ? 'var(--dial-ok)' : 'inherit', fontWeight: hasDiscount ? 600 : 'inherit' }}>
            {price.usdc.toLocaleString()} USDC
          </span>
          {price.perYear ? ' / year' : ''}
          {hasDiscount && <span className="dial-pill ok" style={{ marginLeft: 8, fontSize: 10 }}>{price.discountPct}% verified</span>}
          {couldDiscount && <span style={{ color: 'var(--dial-accent)', marginLeft: 8 }}>· save {couldDiscountSave.toLocaleString()} USDC when verified</span>}
        </div>
      </div>
      {isDomain ? (
        // Corporate domain registration stays as a direct flow (single SKU,
        // mandatory KYB). No cart.
        <button className="dial-btn primary" onClick={() => {
          if (!state.loggedIn) { dispatch({ type: 'modal', modal: { kind: 'login' } }); return; }
          const id = state.identity[state.org];
          if (!id.verified) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Your account must be verified by an admin to register a corporate domain.' } }); return; }
          dispatch({ type: 'modal', modal: {
            kind: 'register-domain',
            label: result.label, step: 0, duration: 1, records: {},
          }});
        }}>
          {!state.loggedIn ? 'Sign in to register'
            : !state.identity[state.org].verified ? 'Verify to register'
            : 'Register'} <ArrowR size={14} stroke="#fff" />
        </button>
      ) : (
        // .dial names go through the cart + checkout flow (GoDaddy-style).
        <button className="dial-btn primary" onClick={() => dispatch({ type: 'cart-add',
          item: { name: result.label + '.dial', duration_years: 1 } })}>
          <Cart size={14} stroke="#fff" /> Add to cart
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────
// Editable account details — email (read-only) + postal/billing address.
// Saves to the backend via PATCH /v1/auth/me; demo accounts are pre-filled.
function AccountDetailsCard() {
  const { state, dispatch } = useDial();
  const id = state.identity[state.org];
  const persona = (window.PERSONAS && window.PERSONAS[state.org]) || {};
  const addr = id.address || {};
  const email = id.email || persona.email || '—';

  const [editing, setEditing] = React.useState(false);
  const [line1, setLine1]     = React.useState('');
  const [city, setCity]       = React.useState('');
  const [country, setCountry] = React.useState('');
  const [busy, setBusy]       = React.useState(false);
  const [error, setError]     = React.useState(null);

  const startEdit = () => {
    setLine1(addr.line1 || ''); setCity(addr.city || ''); setCountry(addr.country || '');
    setError(null); setEditing(true);
  };
  const save = async () => {
    setError(null); setBusy(true);
    try {
      await saveAccountAddress(dispatch, state.org, { line1, city, country });
      setEditing(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const hasAddr = addr.line1 || addr.city || addr.country;
  const inputStyle = { width: '100%' };

  return (
    <div className="dial-card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="dial-h3" style={{ margin: 0 }}>Account details</h3>
        {!editing && (
          <button className="dial-btn sm" onClick={startEdit}><Edit size={13} /> Edit address</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, paddingBottom: 12,
        borderBottom: 'var(--dial-border-w) solid var(--dial-border)', marginBottom: 12 }}>
        <span className="dial-muted" style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Email</span>
        <span style={{ fontSize: 13 }}>{email}</span>
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        color: 'var(--dial-accent)', padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 12, fontSize: 12 }}>{error}</div>}

      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
          <span className="dial-muted" style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, paddingTop: 1 }}>Address</span>
          <span style={{ fontSize: 13, textAlign: 'right', lineHeight: 1.5 }}>
            {hasAddr
              ? <>{addr.line1}{addr.line1 && <br/>}{[addr.city, addr.country].filter(Boolean).join(', ')}</>
              : <span className="dial-muted">No address on file — add one.</span>}
          </span>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <div className="dial-field-label">Street address</div>
            <div className="dial-input-wrap"><input style={inputStyle} value={line1} onChange={e => setLine1(e.target.value)} placeholder="e.g. 12 Karlstrasse" autoFocus /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div className="dial-field-label">City</div>
              <div className="dial-input-wrap"><input style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. 80333 Munich" /></div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="dial-field-label">Country</div>
              <div className="dial-input-wrap"><input style={inputStyle} value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Germany" /></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="dial-btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button className="dial-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
window.AccountDetailsCard = AccountDetailsCard;

// Linked Ethereum wallet — Sign-In-With-Ethereum, DIAL-native (no ENS).
// Connecting proves control of the wallet (a signature, no gas) and binds it to
// a DIAL name the account owns — shown here and on the public profile, and
// reverse-resolvable address→name. Lives beside the account details.
function WalletCard() {
  const { state, dispatch } = useDial();
  const id = state.identity[state.org] || {};
  const wallet = id.wallet || null;
  const [busy, setBusy]   = React.useState(false);
  const [error, setError] = React.useState(null);

  const run = (fn) => async () => {
    setError(null); setBusy(true);
    try { await fn(dispatch, state.org); }
    catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  };
  const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';

  return (
    <div className="dial-card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 className="dial-h3" style={{ margin: 0 }}>Ethereum wallet</h3>
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        color: 'var(--dial-accent)', padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 12, fontSize: 12 }}>{error}</div>}

      {wallet ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {wallet.avatar
              ? <img src={wallet.avatar} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--dial-accent-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Wallet size={18} stroke="var(--dial-accent)" /></div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{wallet.name || 'Linked wallet'}</div>
              <div className="dial-mono dial-muted" style={{ fontSize: 12 }}>{short(wallet.address)}</div>
            </div>
          </div>
          {!wallet.name && <div className="dial-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
            No DIAL name points to this wallet yet — register one and it'll represent this address here and on your public profile.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="dial-btn sm" onClick={run(unlinkWallet)} disabled={busy}>{busy ? 'Working…' : 'Unlink'}</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="dial-muted" style={{ fontSize: 12.5, lineHeight: 1.55, margin: '0 0 12px' }}>
            Connect an Ethereum wallet to prove control and bind it to your DIAL name — resolvable both ways, with no ENS.
            You'll sign a message — no transaction, no gas.</p>
          <button className="dial-btn primary" onClick={run(connectWallet)} disabled={busy}>
            <Wallet size={14} stroke="#fff" /> {busy ? 'Check your wallet…' : 'Connect Ethereum wallet'}</button>
        </div>
      )}
    </div>
  );
}
window.WalletCard = WalletCard;

// Wallet readiness bar — connect MetaMask + put it on the right network before
// signing on-chain. Reads window.ethereum directly; reacts to account/chain changes.
const CHAIN_NAMES = { '0x1': 'Ethereum Mainnet', '0xaa36a7': 'Sepolia', '0x5': 'Goerli', '0x7a69': 'anvil (local)' };
function WalletBar({ cfg }) {
  const eth = (typeof window !== 'undefined') ? window.ethereum : null;
  const [account, setAccount] = React.useState(null);
  const [chainId, setChainId] = React.useState(null);
  const [busy, setBusy]       = React.useState(false);
  const [err, setErr]         = React.useState(null);

  const refresh = React.useCallback(async () => {
    if (!eth) return;
    try {
      const accs = await eth.request({ method: 'eth_accounts' });
      setAccount((accs && accs[0]) || null);
      setChainId(await eth.request({ method: 'eth_chainId' }));
    } catch {}
  }, [eth]);
  React.useEffect(() => {
    refresh();
    if (!eth || !eth.on) return;
    const onA = (a) => setAccount((a && a[0]) || null);
    const onC = (c) => setChainId(c);
    eth.on('accountsChanged', onA); eth.on('chainChanged', onC);
    return () => { eth.removeListener && eth.removeListener('accountsChanged', onA); eth.removeListener && eth.removeListener('chainChanged', onC); };
  }, [eth, refresh]);

  const targetHex = cfg && cfg.chainId ? '0x' + Number(cfg.chainId).toString(16) : null;
  const onTarget  = !!(chainId && targetHex && chainId.toLowerCase() === targetHex.toLowerCase());
  const netName   = chainId ? (CHAIN_NAMES[chainId.toLowerCase()] || ('chainId ' + parseInt(chainId, 16))) : '—';
  const short     = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';

  const connect = async () => { setErr(null); setBusy(true); try { await eth.request({ method: 'eth_requestAccounts' }); await refresh(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const changeAccount = async () => { setErr(null); setBusy(true); try { await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }); await refresh(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
  const switchNet = async () => {
    setErr(null); setBusy(true);
    try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] }); await refresh(); }
    catch (e) { setErr(e && e.code === 4902 ? 'Network not in your wallet — enable test networks (MetaMask → Settings → Advanced).' : (e.message || String(e))); }
    finally { setBusy(false); }
  };

  const target = cfg ? (cfg.network || 'the network') : 'the network';

  return (
    <div className="dial-card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Wallet size={18} stroke={account ? 'var(--dial-ok)' : 'var(--dial-muted)'} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {!eth ? 'No Ethereum wallet detected' : account ? <>Connected <code className="dial-mono dial-muted" style={{ fontSize: 12, marginLeft: 4 }}>{short(account)}</code></> : 'Wallet not connected'}
            </div>
            {eth && <div className="dial-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              Network: {netName} {account && (onTarget
                ? <span className="dial-pill ok" style={{ fontSize: 9.5, marginLeft: 4 }}>READY</span>
                : <span className="dial-pill warn" style={{ fontSize: 9.5, marginLeft: 4 }}>switch to {target}</span>)}
            </div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!eth
            ? <a className="dial-btn sm" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Install MetaMask</a>
            : !account
              ? <button className="dial-btn primary sm" onClick={connect} disabled={busy}><Wallet size={13} stroke="#fff" /> {busy ? 'Connecting…' : 'Connect wallet'}</button>
              : !onTarget
                ? <button className="dial-btn primary sm" onClick={switchNet} disabled={busy || !targetHex}>{busy ? 'Switching…' : 'Switch to ' + target}</button>
                : <button className="dial-btn sm" onClick={changeAccount} disabled={busy} title="Switch which wallet account is connected"><Wallet size={12} /> Switch wallet</button>}
        </div>
      </div>
      {err && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        color: 'var(--dial-accent)', padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginTop: 12, fontSize: 12 }}>{err}</div>}
    </div>
  );
}

// Compact wallet chip for the top bar — connect, show the network, or switch.
// Hidden when no wallet is present (the On-chain page handles the install case).
function TopWalletChip() {
  const { dispatch } = useDial();
  const eth = (typeof window !== 'undefined') ? window.ethereum : null;
  const [account, setAccount] = React.useState(null);
  const [chainId, setChainId] = React.useState(null);
  const [cfg, setCfg]         = React.useState(null);
  const [busy, setBusy]       = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Client-side disconnect (like Uniswap/Aave): the app forgets the wallet and
  // remembers that across reloads, regardless of MetaMask's own permission state.
  const [disconnected, setDisconnected] = React.useState(() => { try { return localStorage.getItem('dial_wallet_disconnected') === '1'; } catch { return false; } });
  const menuRef = React.useRef(null);

  const refresh = React.useCallback(async () => {
    if (!eth) return;
    try { const a = await eth.request({ method: 'eth_accounts' }); setAccount((a && a[0]) || null); setChainId(await eth.request({ method: 'eth_chainId' })); } catch {}
  }, [eth]);
  React.useEffect(() => {
    fetch('/v1/chains/config').then(r => r.json()).then(setCfg).catch(() => {});
    refresh();
    if (!eth || !eth.on) return;
    const onA = (a) => setAccount((a && a[0]) || null);
    const onC = (c) => setChainId(c);
    eth.on('accountsChanged', onA); eth.on('chainChanged', onC);
    return () => { eth.removeListener && eth.removeListener('accountsChanged', onA); eth.removeListener && eth.removeListener('chainChanged', onC); };
  }, [eth, refresh]);
  React.useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  if (!eth) return null;
  const targetHex = cfg && cfg.chainId ? '0x' + Number(cfg.chainId).toString(16) : null;
  const onTarget  = !!(chainId && targetHex && chainId.toLowerCase() === targetHex.toLowerCase());
  const target    = cfg ? (cfg.network || 'network') : 'network';
  const short     = (a) => a ? a.slice(0, 5) + '…' + a.slice(-4) : '';
  const connected = !!account && !disconnected;
  const walletErr = (e) => {
    if (e && e.code === -32002) return 'MetaMask is already asking — open the extension popup to continue.';
    if (e && e.code === 4001) return 'Request cancelled in your wallet.';
    return (e && e.message) || 'Wallet request failed.';
  };
  const act = async (fn) => {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: walletErr(e) } }); }
    finally { setBusy(false); }
  };

  const connect = () => { setDisconnected(false); try { localStorage.removeItem('dial_wallet_disconnected'); } catch {} act(() => eth.request({ method: 'eth_requestAccounts' })); };
  // Re-prompt MetaMask's account picker so the user can switch which wallet is active.
  const changeAccount = () => act(() => eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }));
  // Disconnect, Uniswap-style: forget the wallet locally (reliable + persisted),
  // and best-effort revoke the site permission so MetaMask reflects it too.
  const disconnect = () => {
    setMenuOpen(false);
    setDisconnected(true);
    try { localStorage.setItem('dial_wallet_disconnected', '1'); } catch {}
    eth.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }).catch(() => {});
    dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Wallet disconnected.' } });
  };

  if (!connected) return <button className="dial-btn sm" onClick={connect} disabled={busy}><Wallet size={13} /> {busy ? '…' : 'Connect wallet'}</button>;
  if (!onTarget) return <button className="dial-btn sm" onClick={() => act(() => eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetHex }] }))} disabled={busy || !targetHex} title={'Switch to ' + target} style={{ borderColor: 'var(--dial-warn)', color: 'var(--dial-warn)' }}><Wallet size={13} /> Switch to {target}</button>;

  const item = { display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 0, color: 'var(--dial-text)', padding: '7px 9px', fontSize: 12.5, cursor: 'pointer', borderRadius: 'var(--dial-radius-sm)' };
  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button className="dial-btn sm" onClick={() => setMenuOpen(o => !o)} disabled={busy} title={account + ' · ' + target}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--dial-ok)', display: 'inline-block' }} />
        <code className="dial-mono" style={{ fontSize: 11 }}>{short(account)}</code>
        <ChevronDown size={11} stroke="var(--dial-muted)" />
      </button>
      {menuOpen && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60, minWidth: 200,
          background: 'var(--dial-surface)', border: 'var(--dial-border-w) solid var(--dial-border)', borderRadius: 'var(--dial-radius-sm)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', padding: 6 }}>
          <div className="dial-muted" style={{ fontSize: 10.5, padding: '6px 9px', borderBottom: 'var(--dial-border-w) solid var(--dial-border)', marginBottom: 4 }}>
            <code className="dial-mono" style={{ fontSize: 11 }}>{short(account)}</code> · {target}
          </div>
          <button style={item} onMouseDown={e => e.preventDefault()} onClick={() => { setMenuOpen(false); changeAccount(); }}>Switch account</button>
          <button style={{ ...item, color: 'var(--dial-accent)' }} onMouseDown={e => e.preventDefault()} onClick={disconnect}>Disconnect</button>
        </div>
      )}
    </div>
  );
}

// On-chain mirror explorer — shows DIAL records mirrored to the EVM (Sepolia)
// and Canton. When the EVM mirror is live, each row links to the real tx on a
// block explorer; in mock mode it shows the DIAL-signed local log.
function ScreenChains() {
  const [evm, setEvm]       = React.useState([]);
  const [canton, setCanton] = React.useState([]);
  const [cfg, setCfg]       = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  // On-chain lookup — reads a record live from the contract, not the DB.
  const [lookupName, setLookupName]     = React.useState('david.dial');
  const [lookupResult, setLookupResult] = React.useState(null);
  const [lookupBusy, setLookupBusy]     = React.useState(false);
  const [lookupErr, setLookupErr]       = React.useState(null);

  const doLookup = async () => {
    const n = lookupName.trim().toLowerCase();
    if (!n) return;
    setLookupErr(null); setLookupBusy(true); setLookupResult(null);
    try { setLookupResult(await dialApi('GET', '/v1/chains/onchain/' + encodeURIComponent(n))); }
    catch (e) { setLookupErr(e.message || String(e)); }
    finally { setLookupBusy(false); }
  };

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [e, c, k] = await Promise.all([
        dialApi('GET', '/v1/chains/evm').catch(() => []),
        dialApi('GET', '/v1/chains/canton').catch(() => []),
        dialApi('GET', '/v1/chains/config').catch(() => null),
      ]);
      setEvm(Array.isArray(e) ? e : []); setCanton(Array.isArray(c) ? c : []); setCfg(k);
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => {
    load();
    const t = setInterval(load, 4000); // poll so new mirror writes appear live
    return () => clearInterval(t);
  }, [load]);

  const short = (h, a = 8, b = 6) => h ? (h.length > a + b + 2 ? h.slice(0, a) + '…' + h.slice(-b) : h) : '';
  const when = (ms) => { try { return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + 'Z'; } catch { return ''; } };
  const txUrl = (hash) => cfg && cfg.explorerBase && hash ? cfg.explorerBase + '/tx/' + hash : null;
  const addrUrl = (a) => cfg && cfg.explorerBase && a ? cfg.explorerBase + '/address/' + a : null;
  const live = !!(cfg && cfg.enabled);

  const opPill = (op) => {
    const color = op === 'release' ? 'var(--dial-warn)' : op === 'register' ? 'var(--dial-ok)' : 'var(--dial-accent)';
    return <span className="dial-pill" style={{ fontSize: 10, color, borderColor: color }}>{op}</span>;
  };

  return (
    <div className="dial-screen" style={{ maxWidth: 920, margin: '0 auto', padding: '28px 20px' }}>
      <div className="dial-eyebrow">DIAL · on-chain mirror</div>
      <h1 className="dial-h1" style={{ margin: '4px 0 6px' }}>On-chain mirror</h1>
      <p className="dial-muted" style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 640, marginTop: 0 }}>
        Every DIAL record is signed and mirrored to its supported chains. The EVM mirror is a
        <code className="dial-mono" style={{ margin: '0 4px' }}>DialRegistry</code> contract; each write below is a real transaction.
      </p>

      {/* EVM network status */}
      <div className="dial-card" style={{ padding: 16, margin: '16px 0',
        background: live ? 'var(--dial-surface)' : 'var(--dial-accent-bg)',
        borderColor: live ? 'var(--dial-ok)' : 'var(--dial-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Chain size={18} stroke={live ? 'var(--dial-ok)' : 'var(--dial-accent)'} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                EVM mirror · {cfg ? (cfg.network || 'unknown') : '…'} {live
                  ? <span className="dial-pill ok" style={{ fontSize: 10, marginLeft: 6 }}>LIVE</span>
                  : <span className="dial-pill" style={{ fontSize: 10, marginLeft: 6 }}>MOCK</span>}
              </div>
              <div className="dial-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                {live
                  ? <>Writing real transactions{cfg.chainId ? ' · chainId ' + cfg.chainId : ''}.</>
                  : <>Records are DIAL-signed and logged locally. Set <code className="dial-mono">DIAL_EVM_ENABLED=true</code> to write to chain.</>}
              </div>
            </div>
          </div>
          {cfg && cfg.contractAddress && (
            <div style={{ textAlign: 'right' }}>
              <div className="dial-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Contract</div>
              {addrUrl(cfg.contractAddress)
                ? <a className="dial-mono" style={{ fontSize: 12, color: 'var(--dial-accent)' }} href={addrUrl(cfg.contractAddress)} target="_blank" rel="noreferrer">{short(cfg.contractAddress, 8, 6)} <External size={11} /></a>
                : <span className="dial-mono" style={{ fontSize: 12 }}>{short(cfg.contractAddress, 8, 6)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Wallet — connect + switch to the right network before signing */}
      <WalletBar cfg={cfg} />

      {/* On-chain lookup — read a record straight from the contract */}
      <div className="dial-card" style={{ padding: 16, marginBottom: 18 }}>
        <h3 className="dial-h3" style={{ margin: '0 0 4px' }}>On-chain lookup</h3>
        <p className="dial-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 12px' }}>
          Read a name's record <strong>straight from the {cfg ? cfg.network : ''} contract</strong> — trustless, not from DIAL's database. This is what an external wallet or dApp does.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={lookupName} onChange={e => setLookupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doLookup(); }} placeholder="david.dial"
            style={{ flex: 1, background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
              color: 'var(--dial-text)', padding: '8px 11px', borderRadius: 'var(--dial-radius-sm)',
              fontFamily: 'var(--dial-font-mono)', fontSize: 13, outline: 'none' }} />
          <button className="dial-btn primary" onClick={doLookup} disabled={lookupBusy || !live}>
            {lookupBusy ? 'Reading chain…' : 'Read on-chain'}</button>
        </div>
        {!live && <div className="dial-muted" style={{ fontSize: 11.5, marginTop: 8 }}>Enable the EVM mirror to read on-chain.</div>}
        {lookupErr && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
          color: 'var(--dial-accent)', padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginTop: 12, fontSize: 12 }}>{lookupErr}</div>}
        {lookupResult && (lookupResult.found ? (
          <div style={{ marginTop: 14, border: 'var(--dial-border-w) solid var(--dial-border)', borderRadius: 'var(--dial-radius-sm)', overflow: 'hidden' }}>
            {[
              ['owner', lookupResult.owner],
              ['seq', String(lookupResult.seq)],
              ['expires', (() => { try { return new Date(Number(lookupResult.expiresAt)).toISOString().slice(0, 10); } catch { return lookupResult.expiresAt; } })()],
              ['released', String(lookupResult.released)],
              ['attestationHash', short(lookupResult.attestationHash, 10, 8)],
              ['addressesHash', short(lookupResult.addressesHash, 10, 8)],
              ['nameHash', short(lookupResult.nameHash, 10, 8)],
            ].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px',
                borderTop: i ? 'var(--dial-border-w) solid var(--dial-border)' : 'none', fontSize: 12 }}>
                <span className="dial-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: 10.5 }}>{k}</span>
                <code className="dial-mono" style={{ fontSize: 12 }}>{v}</code>
              </div>
            ))}
            {lookupResult.nft && (
              <div style={{ padding: '10px 12px', borderTop: 'var(--dial-border-w) solid var(--dial-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="dial-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.03em', fontSize: 10.5 }}>NFT owner</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <code className="dial-mono" style={{ fontSize: 12 }}>{short(lookupResult.nft.owner, 8, 6)}</code>
                  {lookupResult.explorerBase && <a style={{ fontSize: 11, color: 'var(--dial-accent)' }} target="_blank" rel="noreferrer"
                    href={lookupResult.explorerBase + '/nft/' + lookupResult.nft.contract + '/' + lookupResult.nft.tokenId}>view NFT <External size={11} /></a>}
                </span>
              </div>
            )}
            <div style={{ padding: '8px 12px', borderTop: 'var(--dial-border-w) solid var(--dial-border)', background: 'var(--dial-bg-soft)' }}>
              <span className="dial-muted" style={{ fontSize: 10.5 }}>read live via <code className="dial-mono">getRecord()</code> from {short(lookupResult.contract, 8, 6)} · chainId {lookupResult.chainId}{lookupResult.nft ? ' · name held as an NFT' : ''}</span>
            </div>
          </div>
        ) : (
          <div className="dial-muted" style={{ fontSize: 12.5, marginTop: 12 }}>No on-chain record for <code className="dial-mono">{lookupResult.name}</code> (seq 0) — it hasn't been mirrored yet.</div>
        ))}
      </div>

      {/* EVM mirror writes */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
        <h3 className="dial-h3" style={{ margin: 0 }}>EVM writes <span className="dial-muted" style={{ fontWeight: 400 }}>· {evm.length}</span></h3>
        <button className="dial-btn sm" onClick={load} disabled={loading}><Refresh size={12} /> {loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      {evm.length === 0 ? (
        <div className="dial-card" style={{ padding: 18, textAlign: 'center' }}>
          <span className="dial-muted" style={{ fontSize: 13 }}>No EVM writes yet — register or update a name to mirror it on-chain.</span>
        </div>
      ) : (
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          {evm.map((row, i) => (
            <div key={row.id || i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1.2fr 1.3fr', gap: 10, alignItems: 'center',
              padding: '11px 16px', borderTop: i ? 'var(--dial-border-w) solid var(--dial-border)' : 'none', fontSize: 13 }}>
              <code className="dial-mono" style={{ fontWeight: 600 }}>{row.name}</code>
              <div>{opPill(row.op)}</div>
              <span className="dial-mono dial-muted" style={{ fontSize: 11 }}>{when(row.written_at)}</span>
              <div style={{ textAlign: 'right' }}>
                {row.tx_hash
                  ? (txUrl(row.tx_hash)
                      ? <a className="dial-mono" style={{ fontSize: 11.5, color: 'var(--dial-accent)' }} href={txUrl(row.tx_hash)} target="_blank" rel="noreferrer">{short(row.tx_hash)} <External size={11} /></a>
                      : <span className="dial-mono" style={{ fontSize: 11.5 }} title={row.tx_hash}>{short(row.tx_hash)}</span>)
                  : (row.tx_status === 'pending'
                      ? <span className="dial-pill" style={{ fontSize: 10 }}>pending…</span>
                      : row.tx_status === 'failed' || row.tx_status === 'reverted'
                        ? <span className="dial-pill warn" style={{ fontSize: 10 }}>{row.tx_status}</span>
                        : <span className="dial-mono dial-muted" style={{ fontSize: 10 }} title={row.dial_sig}>sig {short(row.dial_sig, 6, 4)}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Canton mirror (secondary) */}
      <h3 className="dial-h3" style={{ margin: '22px 0 8px' }}>Canton writes <span className="dial-muted" style={{ fontWeight: 400 }}>· {canton.length}</span></h3>
      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {canton.length === 0
          ? <div style={{ padding: 16 }}><span className="dial-muted" style={{ fontSize: 13 }}>No Canton writes yet.</span></div>
          : canton.slice(0, 12).map((row, i) => (
            <div key={row.id || i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1.2fr 1.3fr', gap: 10, alignItems: 'center',
              padding: '11px 16px', borderTop: i ? 'var(--dial-border-w) solid var(--dial-border)' : 'none', fontSize: 13 }}>
              <code className="dial-mono" style={{ fontWeight: 600 }}>{row.name}</code>
              <div>{opPill(row.op)}</div>
              <span className="dial-mono dial-muted" style={{ fontSize: 11 }}>{when(row.written_at)}</span>
              <span className="dial-mono dial-muted" style={{ fontSize: 10, textAlign: 'right' }} title={row.dial_sig}>sig {short(row.dial_sig, 6, 4)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function ScreenDashboard() {
  const { state, dispatch } = useDial();
  const names   = state.names[state.org] || [];
  const domains = state.domains[state.org] || [];
  const id      = state.identity[state.org];
  const isAcme  = state.org === 'acme';

  // Pull the latest verified status (an admin may have verified the account).
  React.useEffect(() => { refreshMe(dispatch).catch(() => {}); }, []);

  const totalNamesUnderDomains = domains.reduce((n, d) => n + d.names.length, 0);

  return (
    <div className="dial-section">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="dial-eyebrow">{isAcme ? 'Enterprise account' : 'Personal account'}</span>
          <h1 className="dial-h2" style={{ fontSize: 26 }}>
            {isAcme ? id.name : `Hi, ${id.name.split(' ')[0]}`}
          </h1>
          <div className="dial-muted" style={{ fontSize: 13 }}>
            {isAcme
              ? <>{domains.length} corporate domain{domains.length === 1 ? '' : 's'} · {totalNamesUnderDomains} names issued · Identity: {id.verified
                  ? <span style={{ color: 'var(--dial-ok)' }}>{id.level}</span>
                  : <span style={{ color: 'var(--dial-warn)' }}>Not verified</span>}</>
              : <>{names.length} name{names.length === 1 ? '' : 's'} · {names.reduce((n, x) => n + (x.subnames ? x.subnames.length : 0), 0)} subnames · Identity: {id.verified
                  ? <span style={{ color: 'var(--dial-ok)' }}>{id.level || 'Verified'}</span>
                  : <span style={{ color: 'var(--dial-warn)' }}>Not verified</span>}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="dial-btn" onClick={() => dispatch({ type: 'route', route: { screen: 'home' } })}>
            <Search size={14} /> Search
          </button>
          {isAcme ? (
            <button className="dial-btn primary" onClick={() => {
              if (!id.verified) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Your account must be verified by an admin to register a corporate domain.' } }); return; }
              dispatch({ type: 'modal', modal: { kind: 'register-domain', label: '', step: 0, duration: 1, records: {} } });
            }}>
              <Building size={14} stroke="#fff" /> {id.verified ? 'Register a corporate domain' : 'Verify to register a domain'}
            </button>
          ) : (
            <button className="dial-btn primary" onClick={() => dispatch({ type: 'route', route: { screen: 'home' } })}>
              <Plus size={14} stroke="#fff" /> Register a name
            </button>
          )}
        </div>
      </div>

      <div className="dial-card" style={{ padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, background: id.verified ? 'var(--dial-surface)' : 'var(--dial-accent-bg)', borderColor: id.verified ? 'var(--dial-border)' : 'var(--dial-accent)' }}>
        <Shield size={20} stroke={id.verified ? 'var(--dial-ok)' : 'var(--dial-accent)'} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {id.verified ? 'Identity verified' : 'Identity not verified yet'}
          </div>
          <div className="dial-muted" style={{ fontSize: 12 }}>
            {id.verified
              ? <>Verified by DIAL{isAcme && id.regId && <> · {id.regId} {id.country}</>}. The {VERIFIED_DISCOUNT_PCT}% verified discount applies.</>
              : 'A DIAL admin reviews and verifies accounts. You can still register names; verification unlocks the verified badge and discount.'}
          </div>
        </div>
        {id.verified
          ? <span className="dial-pill ok"><CheckCircle size={11} /> Verified</span>
          : <span className="dial-pill warn">Pending review</span>}
      </div>

      {/* Corporate domains — only for enterprise context */}
      {isAcme && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 className="dial-h3">Corporate domains</h3>
            <span className="dial-muted" style={{ fontSize: 12 }}>FR §4.1 · Domain Issuance</span>
          </div>
          {domains.length === 0 ? (
            <DomainEmpty />
          ) : (
            <div style={{ display: 'grid', gap: 10, marginBottom: 26 }}>
              {domains.map(d => <DomainRow key={d.domain} domain={d} />)}
            </div>
          )}
        </>
      )}

      {!isAcme && (
        <>
          <h3 className="dial-h3" style={{ marginBottom: 12 }}>Your names</h3>
          {names.length === 0 ? (
            <div className="dial-card" style={{ padding: 32, textAlign: 'center' }}>
              <div className="dial-h3">No names yet</div>
              <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>Register your first DIAL name to get started.</div>
              <button className="dial-btn primary" onClick={() => dispatch({ type: 'route', route: { screen: 'home' } })}>Search names</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {names.map(n => <NameRow key={n.name} name={n} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DomainEmpty() {
  const { state, dispatch } = useDial();
  const id = state.identity[state.org];
  return (
    <div className="dial-card" style={{ padding: 28, marginBottom: 26, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ width: 48, height: 48, borderRadius: 'var(--dial-radius)', background: 'var(--dial-accent-bg)', color: 'var(--dial-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Building size={22} stroke="var(--dial-accent)" />
      </div>
      <div style={{ flex: 1 }}>
        <div className="dial-h3" style={{ marginBottom: 4 }}>Register your corporate domain</div>
        <div className="dial-muted" style={{ fontSize: 13 }}>
          Your own TLD-style namespace (e.g. <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>.acme</code>). Issue an unlimited number of names under it for teams, services, and vaults.
        </div>
      </div>
      <button className="dial-btn primary" onClick={() => {
        if (!id.verified) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Your account must be verified by an admin to register a corporate domain.' } }); return; }
        dispatch({ type: 'modal', modal: { kind: 'register-domain', label: '', step: 0, duration: 1, records: {} } });
      }}>
        {id.verified ? 'Register · from 2,400 USDC/yr' : 'Verification required'}
      </button>
    </div>
  );
}

function DomainRow({ domain }) {
  const { dispatch } = useDial();
  return (
    <button className="dial-card" style={{ padding: 16, display: 'grid', gridTemplateColumns: '44px 1fr auto auto auto',
      gap: 16, alignItems: 'center', textAlign: 'left', cursor: 'pointer', background: 'var(--dial-surface)' }}
      onClick={() => dispatch({ type: 'route', route: { screen: 'domain', domain: domain.domain } })}>
      <div style={{ width: 44, height: 44, borderRadius: 'var(--dial-radius-sm)', background: 'var(--dial-accent)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--dial-font-mono)', fontWeight: 700, fontSize: 18 }}>
        {domain.domain.slice(1, 2).toUpperCase()}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="dial-mono" style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{domain.domain}</div>
        <div className="dial-muted" style={{ fontSize: 12, marginTop: 2 }}>
          Corporate domain · {domain.names.length} name{domain.names.length === 1 ? '' : 's'} issued
        </div>
      </div>
      {domain.verified
        ? <span className="dial-pill ok"><CheckCircle size={11} /> Verified</span>
        : <span className="dial-pill warn">Unverified</span>}
      <div style={{ textAlign: 'right' }}>
        <div className="dial-muted" style={{ fontSize: 11, letterSpacing: '0.04em' }}>EXPIRES</div>
        <div style={{ fontSize: 13, fontFamily: 'var(--dial-font-mono)' }}>{domain.expires}</div>
      </div>
      <Chevron size={16} stroke="var(--dial-muted)" />
    </button>
  );
}

function NameRow({ name }) {
  const { dispatch } = useDial();
  // "Today" anchored at the seeded date so the demo's day-counts make sense.
  const expiresIn = Math.floor((new Date(name.expires) - new Date()) / (1000 * 60 * 60 * 24));
  return (
    <button className="dial-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', border: 'var(--dial-border-w) solid var(--dial-border)', background: 'var(--dial-surface)', cursor: 'pointer' }}
      onClick={() => dispatch({ type: 'route', route: { screen: 'name', name: name.name } })}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: 'var(--dial-accent-bg)', color: 'var(--dial-accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--dial-font-mono)', fontWeight: 600 }}>
        {name.name[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dial-mono" style={{ fontSize: 15, fontWeight: 600 }}>{name.name}</span>
        </div>
        <div className="dial-muted" style={{ fontSize: 12, display: 'flex', gap: 12 }}>
          {Object.keys(name.records).length} chain record{Object.keys(name.records).length === 1 ? '' : 's'}
          {name.subnames && name.subnames.length > 0 && <span>· {name.subnames.length} subnames</span>}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="dial-muted" style={{ fontSize: 11, letterSpacing: '0.04em' }}>EXPIRES</div>
        <div style={{ fontSize: 13, fontFamily: 'var(--dial-font-mono)' }}>
          {name.expires}
          <span className="dial-muted" style={{ marginLeft: 6, fontSize: 11 }}>· {expiresIn}d</span>
        </div>
      </div>
      <Chevron size={16} stroke="var(--dial-muted)" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Name detail — records / subnames / settings
// ─────────────────────────────────────────────────────────────
function ScreenNameDetail() {
  const { state, dispatch } = useDial();
  // A name can live directly under state.names[org] OR under a corporate
  // domain (state.domains[org][i].names[]). Search both.
  const ownedNames = [
    ...(state.names[state.org] || []),
    ...((state.domains[state.org] || []).flatMap(d => d.names || [])),
  ];
  const name = ownedNames.find(n => n.name === state.route.name);
  const [tab, setTab] = React.useState('profile');
  // Subnames are an enterprise/domain feature — normal (consumer) accounts
  // don't issue them, so the tab is hidden for them.
  const isEnterprise = (state.identity[state.org] || {}).kind === 'enterprise';

  if (!name) {
    return <div className="dial-section"><div className="dial-card" style={{ padding: 24 }}>Name not found.</div></div>;
  }

  return (
    <div className="dial-section wide" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button className="dial-btn ghost sm" onClick={() => dispatch({ type: 'route', route: { screen: 'dashboard' } })}>
          ← My names
        </button>
        <span style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 28 }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--dial-radius)', background: 'var(--dial-accent-bg)', color: 'var(--dial-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--dial-font-mono)', fontWeight: 700, fontSize: 24 }}>
          {name.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dial-mono" style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{name.name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="dial-pill ok"><CheckCircle size={11} /> Active</span>
            <span className="dial-pill">Owner · {state.identity[state.org].name.split(' ')[0]}</span>
            <span className="dial-pill"><Calendar size={11} /> Expires {name.expires}</span>
          </div>
        </div>
        <button className="dial-btn" onClick={() => dispatch({ type: 'route', route: { screen: 'public', name: name.name, from: 'name' } })}>
          <Globe size={14} /> View page
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: 'var(--dial-border-w) solid var(--dial-border)', marginBottom: 20 }}>
        {[
          ['profile',      'Profile',       LINK_PLATFORMS.filter(p => (name.text || {})[p.key]).length || null],
          ['modes',        'Modules',       null],
          ['receptionist', 'Receptionist',  null],
          ['records',      'Chain records', Object.keys(name.records).length],
          isEnterprise && ['subnames', 'Subnames', (name.subnames || []).length],
          ['settings',     'Settings',      null],
        ].filter(Boolean).map(([k, label, count]) => (
          <button key={k}
            onClick={() => setTab(k)}
            style={{
              border: 0, background: 'transparent',
              padding: '10px 14px',
              fontSize: 13,
              borderBottom: '2px solid ' + (tab === k ? 'var(--dial-accent)' : 'transparent'),
              color: tab === k ? 'var(--dial-text)' : 'var(--dial-muted)',
              fontWeight: tab === k ? 600 : 500,
              marginBottom: -1,
              cursor: 'pointer',
            }}>
            {label}{count !== null && <span className="dial-muted" style={{ marginLeft: 6, fontSize: 11 }}>{count}</span>}
          </button>
        ))}
      </div>

      {tab === 'records'      && <NameRecords name={name} />}
      {tab === 'profile'      && <NameProfile name={name} />}
      {tab === 'modes'        && <NameModes name={name} />}
      {tab === 'receptionist' && <NameReceptionist name={name} />}
      {tab === 'subnames'     && <NameSubnames name={name} />}
      {tab === 'settings'     && <NameSettings name={name} />}
    </div>
  );
}

// Linktree-style social links editor — one row per platform, stored as text
// records and shown on the public address page.
// A single Linktree button — used on the public page and the editor preview.
function LinkButton({ l, preview }) {
  const inner = (
    <>
      <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 'var(--dial-radius-sm)', background: l.color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{l.mark}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{l.label}</div>
        <div className="dial-muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.value}</div>
      </div>
      {!preview && <ArrowR size={14} stroke="var(--dial-muted)" />}
    </>
  );
  const style = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    border: 'var(--dial-border-w) solid var(--dial-border)', borderRadius: 'var(--dial-radius)',
    background: 'var(--dial-surface)', textDecoration: 'none', color: 'var(--dial-text)' };
  if (preview || !l.href) return <div style={style}>{inner}</div>;
  return <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" style={style}>{inner}</a>;
}

// Owner-side profile modules — toggle each module on/off, edit its copy, and
// pick which one is primary. Active modules stack on the public page, primary
// first.
function NameModes({ name }) {
  const { state, dispatch } = useDial();
  const org = state.org;
  const [modes, setModes] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let c = false;
    setLoading(true);
    loadOwnerModes(org, name.name).then(r => { if (!c) { setModes(r.modes); setLoading(false); } })
      .catch(() => { if (!c) { setModes([]); setLoading(false); } });
    return () => { c = true; };
  }, [org, name.name]);

  const toggle = async (m) => {
    try { const r = await setModeActive(org, name.name, m.key, !m.active); setModes(r.modes); }
    catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: e.message } }); }
  };

  if (loading) return <div className="dial-muted" style={{ fontSize: 13 }}>Loading modules…</div>;

  // Modules that carry an appearance list (e.g. Conferences) get an inline editor.
  const itemModes = (modes || []).filter(m => Array.isArray(m.items));
  // The "Latest posts" module (social feed) is edited with its own posts editor.
  const signalsMode = (modes || []).find(m => m.key === 'signals');

  return (
   <div style={{ display: 'grid', gap: 18 }}>
    <div style={{ display: 'grid', gap: 18, alignItems: 'flex-start' }}>
      <div>
        <h3 className="dial-h3" style={{ margin: 0 }}>Modules</h3>
        <div className="dial-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>Active modules appear on your public profile. The primary module shows first.</div>
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          {(modes || []).map((m, i) => (
            <ModuleRow key={m.key} org={org} name={name} mode={m} first={i === 0}
              onToggle={() => toggle(m)} onModes={setModes} />
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="dial-btn" onClick={() => dispatch({ type: 'route', route: { screen: 'public', name: name.name, from: 'name' } })}>
            <Globe size={13} /> View public page
          </button>
        </div>
      </div>
    </div>

    {itemModes.map(m => (
      <AppearancesEditor key={m.key} org={org} name={name.name} mode={m} onModes={setModes} />
    ))}

    {signalsMode && <LatestPostsEditor name={name} mode={signalsMode} />}
   </div>
  );
}

// A single module row: On/Off toggle plus an expandable editor for its copy
// (title, status, body, CTA, and — for availability modules — the detail cards).
function ModuleRow({ org, name, mode, first, onToggle, onModes }) {
  const { dispatch } = useDial();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  // Conference appearances and Latest posts carry their own dedicated editors
  // below; the detail-card grid only drives the availability modules.
  const supportsMinis = !Array.isArray(mode.items) && mode.key !== 'signals';

  const fresh = () => ({
    title: mode.title || '', status: mode.status || '', copy: mode.copy || '', cta: mode.cta || '',
    minis: (mode.minis || []).map(([a, b]) => [a, b]),
  });
  const [draft, setDraft] = React.useState(fresh);
  const begin = () => { setDraft(fresh()); setOpen(true); };
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setMini = (i, j, v) => setDraft(d => ({ ...d, minis: d.minis.map((p, k) => k === i ? (j === 0 ? [v, p[1]] : [p[0], v]) : p) }));
  const addMini = () => setDraft(d => ({ ...d, minis: [...d.minis, ['', '']] }));
  const delMini = (i) => setDraft(d => ({ ...d, minis: d.minis.filter((_, k) => k !== i) }));

  const save = async () => {
    if (!draft.title.trim()) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Title is required.' } }); return; }
    setSaving(true);
    try {
      const fields = { title: draft.title, status: draft.status, copy: draft.copy, cta: draft.cta };
      if (supportsMinis) fields.minis = draft.minis.filter(([a, b]) => a.trim() || b.trim());
      const r = await setModeContent(org, name.name, mode.key, fields);
      onModes(r.modes); setOpen(false);
      dispatch({ type: 'toast', toast: { kind: 'ok', text: mode.label + ' updated.' } });
    } catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Save failed: ' + e.message } }); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    setSaving(true);
    try {
      const r = await resetModeContent(org, name.name, mode.key);
      onModes(r.modes); setOpen(false);
      dispatch({ type: 'toast', toast: { kind: 'ok', text: mode.label + ' reset to default.' } });
    } catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Reset failed: ' + e.message } }); }
    finally { setSaving(false); }
  };
  const makePrimary = async () => {
    try { const r = await setModePrimary(org, name.name, mode.key); onModes(r.modes); }
    catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: e.message } }); }
  };

  const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--dial-bg-soft)',
    border: 'var(--dial-border-w) solid var(--dial-border)', color: 'var(--dial-text)', padding: '9px 11px',
    borderRadius: 'var(--dial-radius-sm)', fontSize: 13, outline: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: 'var(--dial-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ borderTop: first ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', opacity: mode.active ? 1 : 0.62 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode.title}
            {mode.active && mode.primary && <span style={{ fontFamily: 'var(--dial-font-mono)', fontSize: 10, textTransform: 'uppercase',
              color: 'var(--dial-accent)', border: '1px solid var(--dial-accent)', borderRadius: 999, padding: '2px 7px' }}>Primary</span>}
          </div>
          <div className="dial-muted" style={{ fontSize: 12 }}>{mode.label} · {mode.status}</div>
        </div>
        {mode.active && !mode.primary && <button className="dial-btn sm" onClick={makePrimary}>Make primary</button>}
        <button className="dial-btn sm" onClick={() => (open ? setOpen(false) : begin())}
          style={open ? { borderColor: 'var(--dial-accent)', color: 'var(--dial-accent)', fontWeight: 600 } : {}}>
          {open ? 'Close' : 'Edit'}
        </button>
        <button className="dial-btn sm" onClick={onToggle}
          style={mode.active ? { borderColor: 'var(--dial-accent)', color: 'var(--dial-accent)', fontWeight: 600 } : {}}>{mode.active ? 'On' : 'Off'}</button>
      </div>

      {open && (
        <div style={{ padding: '4px 14px 16px', display: 'grid', gap: 12, background: 'var(--dial-bg-soft)',
          borderTop: 'var(--dial-border-w) solid var(--dial-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Title</label><input style={inp} value={draft.title} onChange={e => set('title', e.target.value)} maxLength={120} /></div>
            <div><label style={lbl}>Status</label><input style={inp} value={draft.status} onChange={e => set('status', e.target.value)} maxLength={40} /></div>
          </div>
          <div><label style={lbl}>Body copy</label><textarea style={{ ...inp, minHeight: 64, resize: 'vertical', fontFamily: 'inherit' }}
            value={draft.copy} onChange={e => set('copy', e.target.value)} maxLength={600} /></div>
          <div><label style={lbl}>Button label</label><input style={inp} value={draft.cta} onChange={e => set('cta', e.target.value)} maxLength={60}
            placeholder="e.g. Propose a partnership" /></div>

          {supportsMinis && (
            <div>
              <label style={lbl}>Detail cards</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {draft.minis.map(([a, b], i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr auto', gap: 8, alignItems: 'center' }}>
                    <input style={inp} value={a} onChange={e => setMini(i, 0, e.target.value)} placeholder="Label" maxLength={40} />
                    <input style={inp} value={b} onChange={e => setMini(i, 1, e.target.value)} placeholder="Value" maxLength={160} />
                    <button className="dial-btn sm" onClick={() => delMini(i)} title="Remove card">✕</button>
                  </div>
                ))}
                {draft.minis.length < 6 && <button className="dial-btn sm" style={{ justifySelf: 'start' }} onClick={addMini}>+ Add card</button>}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
            <button className="dial-btn primary sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="dial-btn sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button className="dial-btn sm" style={{ marginLeft: 'auto', color: 'var(--dial-muted)' }} onClick={reset} disabled={saving}>Reset to default</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Owner-side editor for the "Latest posts" module — the X / LinkedIn featured
// post links shown on the public page. Stored as text records (x_posts /
// linkedin_posts); shares the resolver-text save path with the Links editor.
function LatestPostsEditor({ name, mode }) {
  const { state, dispatch } = useDial();
  const initial = () => ({ x_posts: (name.text || {}).x_posts || '', linkedin_posts: (name.text || {}).linkedin_posts || '' });
  const [form, setForm] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setForm(initial()); }, [name.name, JSON.stringify(name.text)]);

  const dirty = ['x_posts', 'linkedin_posts'].some(k => (form[k] || '').trim() !== ((name.text || {})[k] || '').trim());
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await saveLinks(state, dispatch, name.name, form, 'Latest posts updated.'); }
    catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Save failed: ' + e.message } }); }
    finally { setSaving(false); }
  };
  const ta = { width: '100%', boxSizing: 'border-box', background: 'var(--dial-bg-soft)',
    border: 'var(--dial-border-w) solid var(--dial-border)', color: 'var(--dial-text)', padding: '10px 12px',
    borderRadius: 'var(--dial-radius-sm)', fontSize: 12, fontFamily: 'var(--dial-font-mono)', outline: 'none', resize: 'vertical' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 className="dial-h3" style={{ margin: 0 }}>{mode.title}</h3>
        {dirty && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dial-btn sm" onClick={() => setForm(initial())} disabled={saving}>Discard</button>
            <button className="dial-btn primary sm" onClick={save} disabled={saving}>
              {saving ? <><Spinner size={12} stroke="#fff" /> Saving</> : <><Check size={12} stroke="#fff" /> Save</>}
            </button>
          </div>
        )}
      </div>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Feature posts in your “{mode.label}” module by hand — paste up to 3 post links each, newest first.
        They render as the platform's own official embeds on your public page.
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, margin: '4px 0 4px' }}>X / Twitter — tweet links</div>
      <textarea value={form.x_posts} onChange={e => set('x_posts', e.target.value)} rows={3} style={ta}
        placeholder={'https://twitter.com/yourhandle/status/1790000000000000000\nhttps://x.com/yourhandle/status/1789000000000000000'} />
      <div className="dial-muted" style={{ fontSize: 11.5, margin: '4px 0 14px' }}>
        On a tweet, use <b>···</b> → <b>Copy link</b>. (X's free auto-timeline renders blank for logged-out visitors, so we embed specific tweets.)
      </div>

      <div style={{ fontSize: 12.5, fontWeight: 600, margin: '4px 0 4px' }}>LinkedIn — post links</div>
      <textarea value={form.linkedin_posts} onChange={e => set('linkedin_posts', e.target.value)} rows={3} style={ta}
        placeholder={'https://www.linkedin.com/feed/update/urn:li:activity:7203456789012345678\nhttps://www.linkedin.com/posts/your-name_slug-activity-7201234567890123456-abcd'} />
      <div className="dial-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        On a post, use <b>···</b> → <b>Embed this post</b> (or <b>Copy link</b>).
      </div>
    </div>
  );
}

// Owner-side editor for a module's appearance list (e.g. conference dates).
// Add new appearances, edit any in place, and delete — each change re-publishes
// to the public profile. Edits return the full mode set so the parent stays in sync.
const EMPTY_APPT = { mon: '', day: '', title: '', sub: '', tag: '' };
function AppearancesEditor({ org, name, mode, onModes }) {
  const { dispatch } = useDial();
  const [editId, setEditId] = React.useState(null); // item id being edited, or 'new'
  const [draft, setDraft] = React.useState(EMPTY_APPT);
  const [busy, setBusy] = React.useState(false);
  const items = mode.items || [];

  const startAdd = () => { setEditId('new'); setDraft(EMPTY_APPT); };
  const startEdit = (it) => { setEditId(it.id); setDraft({ mon: it.mon, day: it.day, title: it.title, sub: it.sub, tag: it.tag }); };
  const cancel = () => { setEditId(null); setDraft(EMPTY_APPT); };

  const save = async () => {
    if (busy) return;
    if (!draft.title.trim() || !draft.mon.trim() || !draft.day.trim()) {
      dispatch({ type: 'toast', toast: { kind: 'info', text: 'Month, day and title are required.' } });
      return;
    }
    setBusy(true);
    try {
      const r = editId === 'new'
        ? await addModeItem(org, name, mode.key, draft)
        : await updateModeItem(org, name, mode.key, editId, draft);
      onModes(r.modes); cancel();
      dispatch({ type: 'toast', toast: { kind: 'ok', text: editId === 'new' ? 'Appearance added.' : 'Appearance updated.' } });
    } catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: e.message } }); }
    finally { setBusy(false); }
  };
  const remove = async (it) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await deleteModeItem(org, name, mode.key, it.id);
      onModes(r.modes); if (editId === it.id) cancel();
      dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Appearance removed.' } });
    } catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: e.message } }); }
    finally { setBusy(false); }
  };

  const fieldStyle = { background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
    color: 'var(--dial-text)', padding: '8px 10px', borderRadius: 'var(--dial-radius-sm)', fontSize: 13, outline: 'none', width: '100%' };
  const Form = (
    <div style={{ display: 'grid', gap: 8, padding: 12, background: 'var(--dial-bg-soft)', borderRadius: 'var(--dial-radius-sm)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 1fr', gap: 8 }}>
        <input style={fieldStyle} placeholder="JUL" value={draft.mon} maxLength={4}
          onChange={e => setDraft(d => ({ ...d, mon: e.target.value }))} />
        <input style={fieldStyle} placeholder="01" value={draft.day} maxLength={3}
          onChange={e => setDraft(d => ({ ...d, day: e.target.value }))} />
        <input style={fieldStyle} placeholder="Event title" value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
      </div>
      <input style={fieldStyle} placeholder="Location · context" value={draft.sub}
        onChange={e => setDraft(d => ({ ...d, sub: e.target.value }))} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input style={{ ...fieldStyle, maxWidth: 180 }} placeholder="Attending / Speaking" value={draft.tag}
          onChange={e => setDraft(d => ({ ...d, tag: e.target.value }))} />
        <div style={{ flex: 1 }} />
        <button className="dial-btn sm" onClick={cancel} disabled={busy}>Cancel</button>
        <button className="dial-btn sm primary" onClick={save} disabled={busy}>{editId === 'new' ? 'Add' : 'Save'}</button>
      </div>
    </div>
  );

  return (
    <div>
      <h3 className="dial-h3" style={{ margin: 0 }}>{mode.title}</h3>
      <div className="dial-muted" style={{ fontSize: 13, margin: '4px 0 12px' }}>
        Manage the appearances shown in your “{mode.label}” module. Changes publish to your public profile.
      </div>
      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.length === 0 && editId !== 'new' && (
          <div className="dial-muted" style={{ fontSize: 13, padding: 14 }}>No appearances yet.</div>
        )}
        {items.map((it, i) => (
          <div key={it.id} style={{ padding: '12px 14px', borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            {editId === it.id ? Form : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontFamily: 'var(--dial-font-mono)', fontSize: 11, textAlign: 'center', minWidth: 40, color: 'var(--dial-muted)' }}>
                  <div>{it.mon}</div><strong style={{ fontSize: 15, color: 'var(--dial-text)' }}>{it.day}</strong>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</div>
                  <div className="dial-muted" style={{ fontSize: 12 }}>{it.sub}{it.tag ? ' · ' + it.tag : ''}</div>
                </div>
                <button className="dial-btn sm" onClick={() => startEdit(it)} disabled={busy}>Edit</button>
                <button className="dial-btn sm" onClick={() => remove(it)} disabled={busy}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {editId === 'new' && (
          <div style={{ padding: '12px 14px', borderTop: items.length ? 'var(--dial-border-w) solid var(--dial-border)' : 0 }}>{Form}</div>
        )}
      </div>
      {editId !== 'new' && (
        <div style={{ marginTop: 12 }}>
          <button className="dial-btn" onClick={startAdd} disabled={busy}>+ Add appearance</button>
        </div>
      )}
    </div>
  );
}

// Profile tab — public-page identity. Hosts the profile picture for now; sits
// apart from the receptionist (the chat agent) so the two don't get conflated.
// Combined Profile editor — picture + reachable links + featured posts, with a
// live link preview. The avatar saves on its own; links and posts share one
// save bar. (Formerly two tabs: Profile and Links.)
function NameProfile({ name }) {
  const { state, dispatch } = useDial();
  const persona = state.identity[state.org] || {};
  // Links live in the name's text records; headline/bio live in the receptionist
  // config (loaded async). Both share this tab's single save bar.
  const linkBase = () => {
    const t = name.text || {};
    const o = {};
    LINK_PLATFORMS.forEach(p => { o[p.key] = t[p.key] || ''; });
    return o;
  };
  const initial = () => ({ ...linkBase(), headline: '', bio: '' });
  const [cfg, setCfg] = React.useState(null);          // receptionist config, or null if none yet
  const [base, setBase] = React.useState(initial);     // last-saved values, for dirty/discard
  const [form, setForm] = React.useState(base);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const links = linkBase();
    loadReceptionist(state.org, name.name)
      .then(c => {
        if (cancelled) return;
        const next = { ...links, headline: (c && c.headline) || '', bio: (c && c.bio) || '' };
        setCfg(c || null); setBase(next); setForm(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next = { ...links, headline: '', bio: '' };
        setCfg(null); setBase(next); setForm(next);
      });
    return () => { cancelled = true; };
  }, [name.name, state.org, JSON.stringify(name.text)]);

  const linksDirty = LINK_PLATFORMS.some(p => (form[p.key] || '').trim() !== (base[p.key] || '').trim());
  const textDirty = (form.headline || '').trim() !== (base.headline || '').trim()
                 || (form.bio || '').trim() !== (base.bio || '').trim();
  const dirty = linksDirty || textDirty;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      if (linksDirty) await saveLinks(state, dispatch, name.name, form);
      if (textDirty) {
        const ownerFirst = (persona.name || '').split(' ')[0] || 'me';
        const saved = await saveReceptionist(state, dispatch, name.name, {
          // owner_name / receptionist_name are required by the API; reuse the
          // existing config when present, otherwise fall back to the persona.
          owner_name: (cfg && cfg.owner_name) || persona.name || name.name,
          receptionist_name: (cfg && cfg.receptionist_name) || (ownerFirst + "'s Receptionist"),
          headline: form.headline, bio: form.bio,
        });
        setCfg(saved);
      }
      setBase({ ...form });
    } catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: 'Save failed: ' + e.message } }); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 className="dial-h3" style={{ margin: 0 }}>Profile</h3>
          {dirty && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="dial-btn sm" onClick={() => setForm(base)} disabled={saving}>Discard</button>
              <button className="dial-btn primary sm" onClick={save} disabled={saving}>
                {saving ? <><Spinner size={12} stroke="#fff" /> Saving</> : <><Check size={12} stroke="#fff" /> Save</>}
              </button>
            </div>
          )}
        </div>
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
          How you appear on your public page — your picture and the ways people can reach you.
        </div>

        <AvatarEditor name={name} />

        <h3 className="dial-h3" style={{ margin: '0 0 4px' }}>About</h3>
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          The headline and short bio shown beneath your name on your public page.
        </div>
        <div className="dial-card" style={{ padding: 16, display: 'grid', gap: 12, marginBottom: 18 }}>
          <div>
            <div className="dial-field-label">Headline</div>
            <input value={form.headline || ''} onChange={e => set('headline', e.target.value)}
              placeholder="e.g. Designer · non-custodial identity"
              style={{ width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
                color: 'var(--dial-text)', padding: '8px 10px', borderRadius: 'var(--dial-radius-sm)', fontSize: 13, outline: 'none' }} />
          </div>
          <div>
            <div className="dial-field-label">Bio</div>
            <textarea value={form.bio || ''} onChange={e => set('bio', e.target.value)} rows={3}
              placeholder="A short bio shown on your public page."
              style={{ width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
                color: 'var(--dial-text)', padding: '8px 10px', borderRadius: 'var(--dial-radius-sm)', fontSize: 13, outline: 'none',
                resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <h3 className="dial-h3" style={{ margin: '0 0 4px' }}>Links</h3>
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Add the ways people can reach you. These appear as buttons on your public page — like a Linktree for your DIAL name.
        </div>

        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          {LINK_PLATFORMS.map((p, i) => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 'var(--dial-radius-sm)', background: p.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{p.mark}</div>
              <div style={{ width: 84, flexShrink: 0, fontSize: 13, fontWeight: 600 }}>{p.label}</div>
              <input value={form[p.key]} onChange={e => set(p.key, e.target.value)} placeholder={p.placeholder}
                style={{ flex: 1, background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
                  color: 'var(--dial-text)', padding: '7px 10px', borderRadius: 'var(--dial-radius-sm)', fontSize: 12.5, outline: 'none' }} />
              {form[p.key] ? <button className="dial-iconbtn" title="Clear" onClick={() => set(p.key, '')}><X size={14} /></button> : <span style={{ width: 28 }} />}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="dial-btn" onClick={() => dispatch({ type: 'route', route: { screen: 'public', name: name.name, from: 'name' } })}>
            <Globe size={13} /> View public page
          </button>
        </div>
      </div>
    </div>
  );
}

// Profile picture editor — add / replace / remove the avatar shown on the
// public page hero. Saves immediately (no form); empty falls back to a default.
function AvatarEditor({ name }) {
  const { state, dispatch } = useDial();
  const current = (name.text || {}).avatar || '';
  const hasAvatar = isAvatarValue(current);
  const ownerName = (state.identity[state.org] && state.identity[state.org].name) || name.name;
  const fileRef = React.useRef(null);
  const [busy, setBusy] = React.useState(false);

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await saveAvatar(state, dispatch, name.name, dataUrl);
    } catch (err) {
      dispatch({ type: 'toast', toast: { kind: 'info', text: err.message || 'Upload failed.' } });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try { await saveAvatar(state, dispatch, name.name, ''); }
    catch (err) { dispatch({ type: 'toast', toast: { kind: 'info', text: err.message || 'Remove failed.' } }); }
    finally { setBusy(false); }
  };

  return (
    <div className="dial-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={onFile} style={{ display: 'none' }} />
      {hasAvatar
        ? <img src={current} alt="Profile picture" style={{ width: 72, height: 72, borderRadius: 'var(--dial-radius-sm)', objectFit: 'cover', border: 'var(--dial-border-w) solid var(--dial-border)', flexShrink: 0 }} />
        : <div className="dial-avatar" style={{ width: 72, height: 72, fontSize: 24, flexShrink: 0 }}>{initialsOf(ownerName)}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Profile picture</div>
        <div className="dial-muted" style={{ fontSize: 12, marginTop: 2 }}>
          {hasAvatar ? 'Shown on your public page.' : 'No picture yet — your initials are used as a default.'}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="dial-btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
            {busy ? <><Spinner size={13} /> Working</> : (hasAvatar ? 'Replace' : 'Upload')}
          </button>
          {hasAvatar && <button className="dial-btn" onClick={remove} disabled={busy}>Remove</button>}
        </div>
      </div>
    </div>
  );
}

// Owner-side receptionist setup — ported from adihus/dial's Setup page.
function NameReceptionist({ name }) {
  const { state, dispatch } = useDial();
  const persona = state.identity[state.org];
  const [cfg, setCfg] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadReceptionist(state.org, name.name).then(c => {
      if (cancelled) return;
      setCfg(c);
      const ownerFirst = (persona.name || '').split(' ')[0] || 'me';
      setForm(c || {
        owner_name: persona.name || '',
        receptionist_name: ownerFirst + "'s Receptionist",
        headline: '',
        bio: '',
        greeting: '',
        forwarding_email: persona.email || '',
        active: 1,
      });
      setLoading(false);
    }).catch(() => { if (!cancelled) { setForm({ owner_name: persona.name || '', receptionist_name: '', headline:'', bio:'', greeting:'', forwarding_email: persona.email || '', active: 1 }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [name.name, state.org]);

  if (loading || !form) return <div className="dial-muted" style={{ fontSize: 13 }}>Loading…</div>;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSave = (form.owner_name || '').trim() && (form.receptionist_name || '').trim();

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveReceptionist(state, dispatch, name.name, {
        owner_name: form.owner_name, receptionist_name: form.receptionist_name,
        headline: form.headline, bio: form.bio, greeting: form.greeting,
        forwarding_email: form.forwarding_email, active: form.active ? 1 : 0,
      });
      setCfg(saved); setForm(saved);
    } catch (e) {
      dispatch({ type: 'toast', toast: { kind: 'info', text: 'Save failed: ' + e.message } });
    } finally { setSaving(false); }
  };

  const fieldStyle = { width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
    color: 'var(--dial-text)', padding: '8px 10px', borderRadius: 'var(--dial-radius-sm)', fontSize: 13, outline: 'none' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'flex-start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 className="dial-h3" style={{ margin: 0 }}>{cfg ? 'Receptionist' : 'Set up a receptionist'}</h3>
          {cfg && <span className={`dial-pill ${cfg.active ? 'ok' : 'warn'}`}>{cfg.active ? 'Live' : 'Paused'}</span>}
        </div>
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Visitors to your public page chat with your receptionist. It takes a message, asks for the details, and drops a summary in your <a style={{ color: 'var(--dial-accent)', cursor: 'pointer' }} onClick={() => dispatch({ type: 'route', route: { screen: 'inbox' } })}>inbox</a>. It never speaks as you or makes commitments.
        </div>

        <div className="dial-card" style={{ padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="dial-field-label">Your name</div>
              <input value={form.owner_name} onChange={e => set('owner_name', e.target.value)} style={fieldStyle} placeholder="e.g. David Palmer" />
            </div>
            <div>
              <div className="dial-field-label">Receptionist name</div>
              <input value={form.receptionist_name} onChange={e => set('receptionist_name', e.target.value)} style={fieldStyle} placeholder="e.g. David's Receptionist" />
            </div>
          </div>
          <div>
            <div className="dial-field-label">Headline</div>
            <input value={form.headline || ''} onChange={e => set('headline', e.target.value)} style={fieldStyle} placeholder="e.g. Designer · non-custodial identity" />
          </div>
          <div>
            <div className="dial-field-label">About you (bio)</div>
            <textarea value={form.bio || ''} onChange={e => set('bio', e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="A short bio shown on your public page." />
          </div>
          <div>
            <div className="dial-field-label">Greeting</div>
            <input value={form.greeting || ''} onChange={e => set('greeting', e.target.value)} style={fieldStyle} placeholder="Hi, I'm … I can take a message and forward a summary." />
          </div>
          <div>
            <div className="dial-field-label">Forwarding email</div>
            <input value={form.forwarding_email || ''} onChange={e => set('forwarding_email', e.target.value)} style={{ ...fieldStyle, fontFamily: 'var(--dial-font-mono)' }} placeholder="you@example.com" />
            <div className="dial-muted" style={{ fontSize: 11, marginTop: 4 }}>PoC: summaries are delivered to your in-app inbox (no real email sent).</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.active} onChange={e => set('active', e.target.checked ? 1 : 0)} style={{ accentColor: 'var(--dial-accent)' }} />
            Receptionist is live (visitors can chat)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dial-btn primary" onClick={save} disabled={!canSave || saving}>
              {saving ? <><Spinner size={13} stroke="#fff" /> Saving</> : <><Check size={13} stroke="#fff" /> {cfg ? 'Save changes' : 'Create receptionist'}</>}
            </button>
            <button className="dial-btn" onClick={() => dispatch({ type: 'route', route: { screen: 'public', name: name.name, from: 'name' } })}>
              <Globe size={13} /> View public page
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="dial-h3">How it works</h3>
        <div className="dial-card" style={{ padding: 14, fontSize: 12.5, color: 'var(--dial-text-2)', lineHeight: 1.6 }}>
          <div style={{ marginBottom: 8 }}><strong>1 · Greet</strong> — welcomes the visitor and explains it's your receptionist.</div>
          <div style={{ marginBottom: 8 }}><strong>2 · Collect</strong> — name, contact, topic, and the next step they want.</div>
          <div style={{ marginBottom: 8 }}><strong>3 · Summarise</strong> — writes a clean summary once it has enough.</div>
          <div><strong>4 · Forward</strong> — drops it in your inbox for you to follow up.</div>
        </div>
        <div className="dial-card tint" style={{ padding: 12, marginTop: 12, fontSize: 12, color: 'var(--dial-muted)' }}>
          Adapted from a colleague's <code className="dial-mono" style={{ background: 'transparent' }}>DIAL Receptionist</code> PoC. Scripted intake — no external AI in this build.
        </div>
      </div>
    </div>
  );
}

// Add / edit the name's EVM (eip155:1) address — proof-of-control mocked,
// but the 0x + 40-hex shape is validated client- and server-side.
function EvmEditor({ name }) {
  const { state, dispatch } = useDial();
  const propAddr = name.records['eip155:1'] || '';
  // Optimistic: shown immediately after a successful on-chain write, before the
  // org refresh round-trips. Cleared when the prop catches up.
  const [savedAddr, setSavedAddr] = React.useState('');
  const current = savedAddr || propAddr;
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(current);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [nft, setNft] = React.useState(null); // minted name NFT (for the Etherscan link)
  React.useEffect(() => { setValue(propAddr); setErr(null); if (propAddr) setSavedAddr(''); }, [propAddr]);
  React.useEffect(() => {
    let c = false;
    dialApi('GET', '/v1/chains/onchain/' + encodeURIComponent(name.name))
      .then(r => { if (!c && r && r.nft && r.explorerBase) setNft({ ...r.nft, explorerBase: r.explorerBase }); })
      .catch(() => {});
    return () => { c = true; };
  }, [name.name]);

  const valid = isEvmAddress(value);
  const nftLink = nft && nft.explorerBase ? (
    <a href={nft.explorerBase + '/nft/' + nft.contract + '/' + nft.tokenId} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--dial-accent)', marginTop: 8, textDecoration: 'none' }}>
      <Shield size={12} stroke="var(--dial-accent)" /> This name is an NFT in your wallet — view on Etherscan <External size={11} />
    </a>
  ) : null;
  const save = async () => {
    setErr(null); setSaving(true);
    try {
      await addEvmAddress(state, dispatch, name.name, value);
      setOpen(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };
  // Full self-custody: the consumer's OWN wallet sends every tx and pays the gas
  // (claim control → set address → mint the name NFT). DIAL only signs an
  // off-chain voucher. Available once the wallet is linked.
  const saveSigned = async () => {
    setErr(null); setSaving(true);
    try {
      await selfCustodyOnchain(dispatch, name.name, value);
      setSavedAddr(value); // show it right away (the flow only resolves once the address is confirmed on-chain)
      setOpen(false);
    } catch (e) { setErr(e.message || String(e)); }
    finally {
      // Always refresh — even on a partial flow (e.g. address set but mint slow),
      // reflect whatever is now persisted, and pick up the minted NFT link.
      try {
        await fetchOrgNames(state, dispatch, state.org);
        const r = await dialApi('GET', '/v1/chains/onchain/' + encodeURIComponent(name.name));
        if (r && r.nft && r.explorerBase) setNft({ ...r.nft, explorerBase: r.explorerBase });
      } catch {}
      setSaving(false);
    }
  };

  if (current && !open) {
    return (
      <div>
        <div className="dial-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: '#2b6cff', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'var(--dial-font-mono)', fontWeight: 700 }}>EVM</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>EVM-compatible</span>
              <code className="dial-mono dial-muted" style={{ fontSize: 11, background: 'transparent', border: 0, padding: 0 }}>eip155:1</code>
            </div>
            <code className="dial-mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{current}</code>
          </div>
          <button className="dial-btn sm" onClick={() => setOpen(true)}><Edit size={12} /> Edit</button>
        </div>
        {nftLink}
      </div>
    );
  }

  if (!current && !open) {
    return (
      <div>
        <button className="dial-btn sm" onClick={() => setOpen(true)}>
          <Plus size={12} /> Add EVM address
        </button>
        {nftLink && <div>{nftLink}</div>}
      </div>
    );
  }

  return (
    <div className="dial-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>EVM-compatible <code className="dial-mono dial-muted" style={{ fontSize: 11 }}>eip155:1</code></span>
        <span className="dial-muted" style={{ fontSize: 11 }}>0x + 40 hex</span>
      </div>
      <input value={value} onChange={e => setValue(e.target.value)} placeholder="0x…" autoFocus
        style={{ width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid ' + (value && !valid ? 'var(--dial-warn)' : 'var(--dial-border)'),
          color: 'var(--dial-text)', padding: '8px 10px', borderRadius: 'var(--dial-radius-sm)',
          fontFamily: 'var(--dial-font-mono)', fontSize: 12, outline: 'none' }} />
      {value && !valid && <div style={{ color: 'var(--dial-warn)', fontSize: 11, marginTop: 5 }}>Expected 0x followed by 40 hex characters.</div>}
      {err && <div style={{ color: 'var(--dial-warn)', fontSize: 11, marginTop: 5 }}>{err}</div>}
      <div className="dial-muted" style={{ fontSize: 11, marginTop: 6 }}>
        Full self-custody: <strong>your</strong> wallet sends each transaction and pays the gas — claim control, set the address, mint the name NFT. DIAL only signs an off-chain voucher and can't change it. Clicking connects your wallet.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="dial-btn sm" onClick={() => { setOpen(false); setValue(current); setErr(null); }} disabled={saving}>Cancel</button>
        <button className="dial-btn sm" onClick={save} disabled={!valid || saving}>
          {saving ? <><Spinner size={12} /> Saving</> : <>{current ? 'Update' : 'Add'} (DIAL)</>}
        </button>
        <button className="dial-btn primary sm" onClick={saveSigned} disabled={!valid || saving}>
          {saving ? <><Spinner size={12} stroke="#fff" /> On-chain…</> : <><Shield size={12} stroke="#fff" /> Set on-chain (you pay gas)</>}
        </button>
      </div>
    </div>
  );
}

// Standalone: mint the name as an NFT into the wallet, paid by the consumer. (The
// "Set on-chain" flow mints too, as its last step — this is the direct path.)
function NameNftCard({ name }) {
  const { state, dispatch } = useDial();
  const [nft, setNft] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [minting, setMinting] = React.useState(false);
  const [err, setErr] = React.useState(null);

  const refresh = React.useCallback(async () => {
    try {
      const r = await dialApi('GET', '/v1/chains/onchain/' + encodeURIComponent(name.name));
      setNft(r && r.nft && r.nft.owner ? { ...r.nft, explorerBase: r.explorerBase } : null);
    } catch {} finally { setLoading(false); }
  }, [name.name]);
  React.useEffect(() => { refresh(); }, [refresh]);

  const mint = async () => {
    setErr(null); setMinting(true);
    try {
      await selfCustodyOnchain(dispatch, name.name, ''); // claim (if needed) + mint; no address change
      await refresh();
    } catch (e) { setErr(e.message || String(e)); }
    finally { setMinting(false); }
  };

  if (loading) return null;
  const minted = !!(nft && nft.owner);
  return (
    <div className="dial-card" style={{ padding: 14, marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: 'linear-gradient(135deg,#6b46ff,#2b6cff)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'var(--dial-font-mono)', fontWeight: 700 }}>NFT</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>DIAL name NFT</div>
          <div className="dial-muted" style={{ fontSize: 11 }}>
            {minted
              ? 'Minted to your wallet — this name is an ERC-721 you own on-chain.'
              : 'Mint this name as an ERC-721 into your wallet. You pay the gas.'}
          </div>
        </div>
        {minted ? (
          <a className="dial-btn sm" href={nft.explorerBase + '/nft/' + nft.contract + '/' + nft.tokenId} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            View NFT <External size={11} />
          </a>
        ) : (
          <button className="dial-btn primary sm" onClick={mint} disabled={minting}>
            {minting ? <><Spinner size={12} stroke="#fff" /> Minting…</> : <><Shield size={12} stroke="#fff" /> Mint NFT (you pay gas)</>}
          </button>
        )}
      </div>
      {err && <div style={{ color: 'var(--dial-warn)', fontSize: 11, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

function NameRecords({ name }) {
  const { state, dispatch } = useDial();
  const [records, setRecords] = React.useState(name.records);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setRecords(name.records); setDirty(false); }, [name.name, JSON.stringify(name.records)]);

  const update = (key, val) => { setRecords({ ...records, [key]: val }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      await updateRecords(state, dispatch, name.name, records);
      setDirty(false);
    } catch (e) {
      dispatch({ type: 'toast', toast: { kind: 'info', text: 'Save failed: ' + e.message } });
    } finally {
      setSaving(false);
    }
  };

  // EVM binding is out of scope for the Phase 0 PoC — only Canton shown.
  const cantonNs = (window.CANTON_NS && window.CANTON_NS.fingerprint) || '';
  const chainMeta = {
    'canton:omnibus': {
      label: 'Canton',
      sub: cantonNs
        ? `Omnibus synchronizer · party id · ns ${cantonNs.slice(0, 10)}…`
        : 'Omnibus synchronizer · party id',
      mark: 'CN',  color: '#5f6cff',
    },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 className="dial-h3">Chain addresses</h3>
          {dirty && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="dial-btn sm" onClick={() => { setRecords(name.records); setDirty(false); }} disabled={saving}>Discard</button>
              <button className="dial-btn primary sm" onClick={save} disabled={saving}>
                {saving ? <><Spinner size={12} stroke="#fff" /> Saving</> : <><Check size={12} stroke="#fff" /> Save</>}
              </button>
            </div>
          )}
        </div>
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          {Object.entries(chainMeta).map(([k, m], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: m.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'var(--dial-font-mono)', fontWeight: 700 }}>
                {m.mark}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</span>
                  <code className="dial-mono dial-muted" style={{ fontSize: 11, background: 'transparent', border: 0, padding: 0 }}>{k}</code>
                </div>
                <div className="dial-muted" style={{ fontSize: 11, marginBottom: 6 }}>{m.sub}</div>
                <input value={records[k] || ''} onChange={e => update(k, e.target.value)}
                  placeholder={`No ${m.label} address set`}
                  style={{ width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
                    color: 'var(--dial-text)', padding: '7px 10px', borderRadius: 'var(--dial-radius-sm)',
                    fontFamily: 'var(--dial-font-mono)', fontSize: 12, outline: 'none' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <EvmEditor name={name} />
          <NameNftCard name={name} />
        </div>
      </div>

      <div>
        <h3 className="dial-h3">Resolver</h3>
        <div className="dial-card" style={{ padding: 14, marginBottom: 18 }}>
          <div className="dial-muted" style={{ fontSize: 11 }}>Active resolver</div>
          <div className="dial-mono" style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-all' }}>dial.resolver.public</div>
          <div className="dial-muted" style={{ fontSize: 11, marginTop: 8 }}>
            Returns DIAL-signed attestations. Contracts on Canton and EVM verify locally.
          </div>
        </div>

        <h3 className="dial-h3">Lookup preview</h3>
        <div className="dial-card tint" style={{ padding: 14, fontFamily: 'var(--dial-font-mono)', fontSize: 11 }}>
          <div className="dial-muted">GET /v1/resolver/{name.name}</div>
          <pre style={{ margin: '8px 0 0', padding: 0, background: 'transparent', border: 0, color: 'var(--dial-text)', whiteSpace: 'pre-wrap' }}>
{`{
  "name": "${name.name}",
  "addresses": ${JSON.stringify(records, null, 2).split('\n').join('\n  ')},
  "attestation_hash": "${shortHash(name.attestation)}",
  "expires_at": "${name.expires}"
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}

function NameSubnames({ name }) {
  const { state, dispatch } = useDial();
  const subnames = name.subnames || [];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 className="dial-h3" style={{ marginBottom: 2 }}>Subnames</h3>
          <div className="dial-muted" style={{ fontSize: 12 }}>
            {state.org === 'acme'
              ? 'Issue subnames under your organisation. Each rolls up to your verified parent.'
              : 'Create subnames for projects or services under your name.'}
          </div>
        </div>
        <button className="dial-btn primary" onClick={() => dispatch({ type: 'modal', modal: { kind: 'subname', parent: name.name } })}>
          <Plus size={14} stroke="#fff" /> New subname
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span className="dial-demo-note">
          ⓘ Subnames are local-only in this PoC — backend scope is the §1–6.1 core flow.
        </span>
      </div>

      {subnames.length === 0 ? (
        <div className="dial-card" style={{ padding: 32, textAlign: 'center' }}>
          <div className="dial-h3">No subnames yet</div>
          <div className="dial-muted" style={{ fontSize: 13 }}>Use subnames to give every team, service, or vault its own DIAL handle.</div>
        </div>
      ) : (
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr 1.4fr 90px', padding: '10px 16px',
            borderBottom: 'var(--dial-border-w) solid var(--dial-border)', background: 'var(--dial-surface-2)',
            fontSize: 11, letterSpacing: '0.04em', color: 'var(--dial-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <div>Subname</div><div>Owner</div><div>Canton</div><div>EVM</div><div></div>
          </div>
          {subnames.map((s, i) => (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr 1.4fr 90px',
              padding: '12px 16px', alignItems: 'center', fontSize: 13,
              borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <div className="dial-mono" style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="dial-muted" style={{ fontSize: 12 }}>{s.owner}</div>
              <code className="dial-mono" style={{ fontSize: 11, background: 'transparent', border: 0, padding: 0 }}>{(s.records['canton:omnibus'] || '—').slice(0, 18) + ((s.records['canton:omnibus'] || '').length > 18 ? '…' : '')}</code>
              <code className="dial-mono" style={{ fontSize: 11, background: 'transparent', border: 0, padding: 0 }}>{s.records['eip155:1'] || '—'}</code>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button className="dial-iconbtn" title="Edit"><Edit size={14} /></button>
                <button className="dial-iconbtn" title="Release"
                  onClick={() => dispatch({ type: 'delete-subname', parent: name.name, name: s.name })}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NameSettings({ name }) {
  const { state, dispatch } = useDial();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 880 }}>
      <SettingCard title="Renew" desc={`Expires ${name.expires}. Renews for another year in USDC.`}
        action={<button className="dial-btn primary" onClick={() => renewName(state, dispatch, name.name)}>
          <Refresh size={14} stroke="#fff" /> Renew · 240 USDC
        </button>} />
      <SettingCard title="Release name" desc="Returns to the available pool after the 30-day grace period."
        action={<button className="dial-btn danger" onClick={() => dispatch({ type: 'modal', modal: { kind: 'release', name: name.name } })}>Release</button>} danger />
    </div>
  );
}

function SettingCard({ title, desc, action, danger }) {
  return (
    <div className="dial-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, borderColor: danger ? 'var(--dial-border)' : 'var(--dial-border)' }}>
      <div>
        <div className="dial-h3" style={{ marginBottom: 4 }}>{title}</div>
        <div className="dial-muted" style={{ fontSize: 12.5 }}>{desc}</div>
      </div>
      <div>{action}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Domain detail — corporate domain (.acme) view
//   Tabs: Issued names · Base records · Settings
// ─────────────────────────────────────────────────────────────
function ScreenDomainDetail() {
  const { state, dispatch } = useDial();
  const domain = (state.domains[state.org] || []).find(d => d.domain === state.route.domain);
  const [tab, setTab] = React.useState('names');

  if (!domain) {
    return <div className="dial-section"><div className="dial-card" style={{ padding: 24 }}>Domain not found.</div></div>;
  }

  return (
    <div className="dial-section wide" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button className="dial-btn ghost sm" onClick={() => dispatch({ type: 'route', route: { screen: 'dashboard' } })}>
          ← My account
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 28 }}>
        <div style={{ width: 64, height: 64, borderRadius: 'var(--dial-radius)', background: 'var(--dial-accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--dial-font-mono)', fontWeight: 800, fontSize: 28 }}>
          {domain.domain.slice(1, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div className="dial-mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>{domain.domain}</div>
            <span className="dial-pill red">Corporate domain</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="dial-pill ok"><CheckCircle size={11} /> Active</span>
            <span className="dial-pill"><Building size={11} /> Owner · {state.identity[state.org].name}</span>
            <span className="dial-pill"><Calendar size={11} /> Expires {domain.expires}</span>
            <span className="dial-pill">{domain.names.length} names issued</span>
            {!domain.verified && <span className="dial-pill warn">Unverified · self-attested</span>}
          </div>
        </div>
        <button className="dial-btn" onClick={() => renewDomain(state, dispatch, domain.domain)}><Refresh size={14} /> Renew</button>
        <button className="dial-btn primary"
          onClick={() => dispatch({ type: 'modal', modal: { kind: 'issue-name', parent: domain.domain } })}>
          <Plus size={14} stroke="#fff" /> Issue name
        </button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: 'var(--dial-border-w) solid var(--dial-border)', marginBottom: 20 }}>
        {[
          ['names',    'Issued names', domain.names.length],
          ['settings', 'Settings',     null],
        ].map(([k, label, count]) => (
          <button key={k}
            onClick={() => setTab(k)}
            style={{
              border: 0, background: 'transparent',
              padding: '10px 14px',
              fontSize: 13,
              borderBottom: '2px solid ' + (tab === k ? 'var(--dial-accent)' : 'transparent'),
              color: tab === k ? 'var(--dial-text)' : 'var(--dial-muted)',
              fontWeight: tab === k ? 600 : 500,
              marginBottom: -1,
              cursor: 'pointer',
            }}>
            {label}{count !== null && <span className="dial-muted" style={{ marginLeft: 6, fontSize: 11 }}>{count}</span>}
          </button>
        ))}
      </div>

      {tab === 'names'    && <DomainNames domain={domain} />}
      {tab === 'settings' && <DomainSettings domain={domain} />}
    </div>
  );
}

function DomainNames({ domain }) {
  const { state, dispatch } = useDial();
  const [filter, setFilter] = React.useState('');
  const shown = domain.names.filter(n => !filter || n.name.includes(filter) || (n.owner && n.owner.includes(filter)));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div style={{ flex: 1, maxWidth: 280 }}>
          <div className="dial-input-wrap" style={{ padding: '0 12px' }}>
            <Search size={14} stroke="var(--dial-muted)" />
            <input style={{ padding: '8px 0', fontSize: 13 }} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter names or owners…" />
          </div>
        </div>
        <div className="dial-muted" style={{ fontSize: 12 }}>
          {domain.names.length} name{domain.names.length === 1 ? '' : 's'} issued under <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{domain.domain}</code>
        </div>
      </div>

      {domain.names.length === 0 ? (
        <div className="dial-card" style={{ padding: 32, textAlign: 'center' }}>
          <div className="dial-h3">No names issued yet</div>
          <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Issue your first name under <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{domain.domain}</code> — one per team, function, or service.
          </div>
          <button className="dial-btn primary"
            onClick={() => dispatch({ type: 'modal', modal: { kind: 'issue-name', parent: domain.domain } })}>
            <Plus size={14} stroke="#fff" /> Issue first name
          </button>
        </div>
      ) : (
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 2.4fr 90px', padding: '10px 16px',
            borderBottom: 'var(--dial-border-w) solid var(--dial-border)', background: 'var(--dial-surface-2)',
            fontSize: 11, letterSpacing: '0.04em', color: 'var(--dial-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <div>Name</div><div>Owner</div><div>Canton party</div><div></div>
          </div>
          {shown.map((s, i) => (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 2.4fr 90px',
              padding: '12px 16px', alignItems: 'center', fontSize: 13,
              borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <div className="dial-mono" style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="dial-muted" style={{ fontSize: 12 }}>{s.owner || 'unassigned'}</div>
              <code className="dial-mono" style={{ fontSize: 11, background: 'transparent', border: 0, padding: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.records['canton:omnibus'] || '—'}</code>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button className="dial-iconbtn" title="Edit"
                  onClick={() => dispatch({ type: 'route', route: { screen: 'name', name: s.name } })}>
                  <Edit size={14} />
                </button>
                <button className="dial-iconbtn" title="Release"
                  onClick={() => releaseDomainName(state, dispatch, domain.domain, s.name)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
          {shown.length === 0 && filter && (
            <div className="dial-muted" style={{ padding: 24, textAlign: 'center', fontSize: 13 }}>No names match "{filter}".</div>
          )}
        </div>
      )}
    </div>
  );
}

function DomainSettings({ domain }) {
  const { state, dispatch } = useDial();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 880 }}>
      <SettingCard title="Renew domain" desc={`Expires ${domain.expires}. Renews annually in USDC. Names issued under this domain renew with it.`}
        action={<button className="dial-btn primary" onClick={() => renewDomain(state, dispatch, domain.domain)}><Refresh size={14} stroke="#fff" /> Renew · 2,400 USDC</button>} />
      <SettingCard title="Bulk import" desc="Upload a CSV to issue many names at once (e.g. one per cost-centre). Each row becomes a name under your domain."
        action={<button className="dial-btn" disabled><Plus size={14} /> Upload CSV (Phase 1)</button>} />
      <SettingCard title="Release domain" desc="Returns to the available pool after the 30-day grace period. Will release all issued names too."
        action={<button className="dial-btn danger"
          onClick={() => dispatch({ type: 'modal', modal: { kind: 'release-domain', domain: domain.domain } })}>Release</button>} danger />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cart — GoDaddy-style basket for .dial name registrations
// ─────────────────────────────────────────────────────────────
function ScreenCart() {
  const { state, dispatch } = useDial();
  const items = state.cart;
  const verified = state.loggedIn && state.identity[state.org]?.verified;

  const computed = items.map(item => {
    const label = item.name.replace(/\.dial$/, '');
    const list = dialPrice(label);
    const final = dialPrice(label, { verified });
    return {
      item,
      tier: list.tier,
      listUnit: list.usdc,
      unit: final.usdc,
      lineTotal: final.usdc * item.duration_years,
      lineList:  list.usdc  * item.duration_years,
    };
  });
  const subtotal = computed.reduce((a, c) => a + c.listUnit * c.item.duration_years, 0);
  const total    = computed.reduce((a, c) => a + c.lineTotal, 0);
  const discount = subtotal - total;

  if (items.length === 0) {
    return (
      <div className="dial-section">
        <div className="dial-card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--dial-radius)', background: 'var(--dial-bg-soft)',
            color: 'var(--dial-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Cart size={26} stroke="var(--dial-muted)" />
          </div>
          <div className="dial-h2" style={{ fontSize: 22, marginBottom: 6 }}>Your cart is empty.</div>
          <div className="dial-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Find a DIAL name and add it to your cart — you can register several at once.
          </div>
          <button className="dial-btn primary" onClick={() => dispatch({ type: 'route', route: { screen: 'home' } })}>
            <Search size={14} stroke="#fff" /> Find a name
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dial-section">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <span className="dial-eyebrow">Cart</span>
          <h1 className="dial-h2" style={{ fontSize: 26 }}>Your basket</h1>
          <div className="dial-muted" style={{ fontSize: 13 }}>{items.length} name{items.length === 1 ? '' : 's'} ready to register</div>
        </div>
        <button className="dial-btn" onClick={() => dispatch({ type: 'route', route: { screen: 'home' } })}>
          <Plus size={14} /> Find more
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 18, alignItems: 'flex-start' }}>
        {/* Items */}
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.9fr 36px', padding: '10px 16px',
            background: 'var(--dial-surface-2)', borderBottom: 'var(--dial-border-w) solid var(--dial-border)',
            fontSize: 11, letterSpacing: '0.04em', color: 'var(--dial-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            <div>Name</div><div>Duration</div><div style={{ textAlign: 'right' }}>Subtotal</div><div></div>
          </div>
          {computed.map((row, i) => (
            <div key={row.item.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.9fr 36px',
              alignItems: 'center', padding: '12px 16px',
              borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <div>
                <div className="dial-mono" style={{ fontWeight: 600, fontSize: 14 }}>{row.item.name}</div>
                <div className="dial-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {row.tier} · {row.unit} USDC / year
                  {verified && <span className="dial-pill ok" style={{ marginLeft: 6, fontSize: 9 }}>{VERIFIED_DISCOUNT_PCT}% off</span>}
                </div>
              </div>
              <div>
                <select value={row.item.duration_years} onChange={e => dispatch({ type: 'cart-set-duration', index: i, years: Number(e.target.value) })}
                  style={{ padding: '5px 8px', fontSize: 13, borderRadius: 'var(--dial-radius-sm)', border: 'var(--dial-border-w) solid var(--dial-border-strong, var(--dial-border))', background: 'var(--dial-surface)' }}>
                  <option value={1}>1 year</option>
                  <option value={2}>2 years</option>
                  <option value={3}>3 years</option>
                </select>
              </div>
              <div style={{ textAlign: 'right' }}>
                {verified && row.lineList !== row.lineTotal && (
                  <div className="dial-muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{row.lineList} USDC</div>
                )}
                <div className="dial-mono" style={{ fontWeight: 600, color: verified ? 'var(--dial-ok)' : 'inherit' }}>{row.lineTotal} USDC</div>
              </div>
              <button className="dial-iconbtn" title="Remove" onClick={() => dispatch({ type: 'cart-remove', index: i })}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Order summary */}
        <div>
          <div className="dial-card" style={{ padding: 18 }}>
            <h3 className="dial-h3" style={{ marginBottom: 12 }}>Order summary</h3>
            <Row k={`Subtotal (${items.length} name${items.length === 1 ? '' : 's'})`} v={`${subtotal} USDC`} />
            {verified && <Row k={`Verified discount (${VERIFIED_DISCOUNT_PCT}%)`} v={<span style={{ color: 'var(--dial-ok)' }}>− {discount} USDC</span>} />}
            <div style={{ height: 1, background: 'var(--dial-border)', margin: '10px 0' }} />
            <Row k="Total" v={<span style={{ fontWeight: 700, fontSize: 15 }}>{total} USDC</span>} bold />
            {!verified && (
              <div className="dial-card tint" style={{ padding: 10, marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                <Shield size={14} stroke="var(--dial-accent)" style={{ marginTop: 1 }} />
                <div className="dial-muted">
                  <strong style={{ color: 'var(--dial-text)' }}>Save {VERIFIED_DISCOUNT_PCT}%</strong> with a verified account ({(subtotal * VERIFIED_DISCOUNT_PCT / 100).toFixed(0)} USDC off this order).
                </div>
              </div>
            )}
            <button className="dial-btn primary lg" style={{ width: '100%', marginTop: 14 }}
              onClick={() => dispatch({ type: 'modal', modal: { kind: 'checkout' } })}>
              Checkout · {total} USDC <ArrowR size={14} stroke="#fff" />
            </button>
            <button className="dial-btn ghost sm" style={{ width: '100%', marginTop: 8 }}
              onClick={() => dispatch({ type: 'route', route: { screen: 'home' } })}>
              ← Continue shopping
            </button>
          </div>

          <button className="dial-btn ghost sm" style={{ marginTop: 14 }}
            onClick={() => dispatch({ type: 'cart-clear' })}>
            <Trash2 size={13} /> Clear cart
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13,
      fontWeight: bold ? 600 : 500 }}>
      <span style={{ color: bold ? 'var(--dial-text)' : 'var(--dial-text-2)' }}>{k}</span>
      <span className="dial-mono">{v}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Public address page (retail) — profile + chain addresses + receptionist
// chat. Reachable by name; no auth. Ported from adihus/dial's Public page.
// ─────────────────────────────────────────────────────────────
// Editorial public-profile design tokens (ported from the profile redesign).
const PUB = {
  paper: '#efe9dd', card: '#fffdf7', ink: '#16130d', muted: '#776f60',
  hair: 'rgba(22,19,13,.12)', red: '#e60012', black: '#121110',
  sand: '#b3a895', cream: '#f4eee2',
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
  sans: "'Archivo', 'Helvetica Neue', Helvetica, Arial, sans-serif",
};
function pubBackBtn() {
  return { background: 'transparent', border: 0, color: PUB.muted, fontFamily: PUB.mono, fontSize: 12,
    textTransform: 'uppercase', letterSpacing: '.08em', cursor: 'pointer', padding: '6px 2px', marginBottom: 14 };
}
function pubPill() {
  return { fontFamily: PUB.mono, fontSize: 12, border: '1px solid rgba(255,255,255,.24)', borderRadius: 999,
    padding: '9px 14px', color: PUB.cream, textDecoration: 'none', display: 'inline-block', whiteSpace: 'nowrap' };
}
function pubModeStatus(closed) {
  return { fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderRadius: 999,
    padding: '8px 11px', whiteSpace: 'nowrap', border: '1px solid currentColor',
    color: closed ? '#b8000e' : '#1c7c45', background: closed ? '#fff1f1' : '#f0fff4' };
}
function pubCta() {
  return { appearance: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid ' + PUB.black,
    background: PUB.black, color: PUB.cream, borderRadius: 14, padding: '12px 16px', fontWeight: 700, fontSize: 14, fontFamily: PUB.sans };
}

// Latest-posts embeds — official single-tweet embeds + official LinkedIn post
// embeds, both owner-curated (X's free timeline widget renders empty for
// logged-out viewers, so we embed specific tweets instead).
function SocialEmbeds({ embeds }) {
  const xHandle = embeds && embeds.x && embeds.x.handle;
  const xTweets = (embeds && embeds.x && embeds.x.tweets) || [];
  const liPosts = (embeds && embeds.linkedin && embeds.linkedin.embeds) || [];
  const ref = React.useRef(null);

  // Load X's widgets.js once, then (re)hydrate the tweet embeds in this block.
  React.useEffect(() => {
    if (xTweets.length === 0) return;
    const hydrate = () => { try { window.twttr && window.twttr.widgets && window.twttr.widgets.load(ref.current); } catch (e) {} };
    if (window.twttr && window.twttr.widgets) { hydrate(); return; }
    let s = document.getElementById('twitter-wjs');
    if (!s) {
      s = document.createElement('script');
      s.id = 'twitter-wjs';
      s.src = 'https://platform.twitter.com/widgets.js';
      s.async = true;
      document.body.appendChild(s);
    }
    s.addEventListener('load', hydrate);
    return () => { try { s.removeEventListener('load', hydrate); } catch (e) {} };
  }, [xTweets.join('|')]);

  if (xTweets.length === 0 && liPosts.length === 0) return null;
  const label = { fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: PUB.red };
  return (
    <div ref={ref} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
      {xTweets.length > 0 && (
        <div style={{ border: '1px solid ' + PUB.hair, borderRadius: 14, padding: '8px 10px', background: PUB.card }}>
          <div style={{ ...label, padding: '6px 4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>X · latest</span>
            {xHandle && <a href={'https://twitter.com/' + xHandle} target="_blank" rel="noopener noreferrer"
              style={{ color: PUB.muted, textDecoration: 'none' }}>@{xHandle} →</a>}
          </div>
          {xTweets.map((url) => (
            <blockquote key={url} className="twitter-tweet" data-dnt="true" data-conversation="none" style={{ margin: '4px 0' }}>
              <a href={url}>{url}</a>
            </blockquote>
          ))}
        </div>
      )}
      {liPosts.map((src, i) => (
        <div key={src} style={{ border: '1px solid ' + PUB.hair, borderRadius: 14, overflow: 'hidden', background: PUB.card }}>
          <div style={{ ...label, padding: '10px 12px 4px' }}>LinkedIn · featured</div>
          <iframe src={src} title={'LinkedIn post ' + (i + 1)} width="100%" height="480"
            frameBorder="0" allowFullScreen loading="lazy" style={{ display: 'block', border: 0 }} />
        </div>
      ))}
    </div>
  );
}

// Shared body for a mode/module block — renders whichever content fits:
// social embeds, appearances (items), social signals, or the 3 detail cards.
function PubBlockBody({ m }) {
  if (m.embeds) {
    return <SocialEmbeds embeds={m.embeds} />;
  }
  if (m.items && m.items.length > 0) {
    return (
      <div style={{ marginTop: 16 }}>
        {m.items.map((it, i) => (
          <div key={i} className="pub-appt" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16,
            alignItems: 'center', padding: '14px 0', borderTop: '1px solid ' + PUB.hair }}>
            <div style={{ fontFamily: PUB.mono, textAlign: 'center', minWidth: 56, border: '1px solid ' + PUB.hair,
              borderRadius: 12, padding: '7px 6px', background: PUB.card, lineHeight: 1.1 }}>
              <div style={{ fontSize: 10.5, color: PUB.muted, textTransform: 'uppercase', letterSpacing: '.06em' }}>{it.mon}</div>
              <strong style={{ fontSize: 18 }}>{it.day}</strong>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{it.title}</div>
              <div style={{ fontSize: 13, color: PUB.muted, marginTop: 2 }}>{it.sub}</div>
            </div>
            <span style={{ fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em',
              border: '1px solid ' + PUB.hair, borderRadius: 999, padding: '6px 10px', whiteSpace: 'nowrap', background: PUB.card,
              justifySelf: 'start' }}>{it.tag}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid ' + PUB.hair }} />
      </div>
    );
  }
  if (m.signals && m.signals.length > 0) {
    return (
      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {m.signals.map((s, i) => {
          const href = s.url && window.isSafeHref(s.url) ? s.url : null;
          const cardStyle = { display: 'block', textDecoration: 'none', color: 'inherit',
            border: '1px solid ' + PUB.hair, borderRadius: 14, padding: '14px 16px', background: PUB.card };
          const body = (
            <React.Fragment>
              <div style={{ fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: PUB.red, marginBottom: 7 }}>{s.source}</div>
              <p style={{ fontSize: 14.5, color: '#272727', lineHeight: 1.5 }}>{s.text}</p>
              <div style={{ fontFamily: PUB.mono, fontSize: 11, color: PUB.muted, marginTop: 10 }}>{s.meta}</div>
            </React.Fragment>
          );
          return href
            ? <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={cardStyle}>{body}</a>
            : <div key={i} style={cardStyle}>{body}</div>;
        })}
      </div>
    );
  }
  if (m.minis && m.minis.length > 0) {
    return (
      <div className="pub-mini" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }}>
        {m.minis.map(([a, b], i) => (
          <div key={i} style={{ border: '1px solid ' + PUB.hair, borderRadius: 14, padding: '12px 14px', background: PUB.card }}>
            <b style={{ display: 'block', fontSize: 12.5, marginBottom: 5 }}>{a}</b>
            <span style={{ fontSize: 12.5, color: PUB.muted, lineHeight: 1.45 }}>{b}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function ScreenPublic() {
  const { state, dispatch } = useDial();
  const name = state.route.name;
  const [page, setPage] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const reqRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    loadPublic(name).then(p => { if (!cancelled) { setPage(p); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [name]);

  const back = () => {
    if (state.route.from === 'name') dispatch({ type: 'route', route: { screen: 'name', name } });
    else if (state.loggedIn) dispatch({ type: 'route', route: { screen: 'dashboard' } });
    else dispatch({ type: 'route', route: { screen: 'home' } });
  };

  if (loading) return <div style={{ padding: 48, fontFamily: PUB.mono, color: PUB.muted, fontSize: 13 }}>Loading…</div>;
  if (err || !page) {
    return (
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 70px', fontFamily: PUB.sans, color: PUB.ink }}>
        <button onClick={back} style={pubBackBtn()}>← Back</button>
        <div style={{ background: PUB.card, border: '1px solid ' + PUB.hair, borderRadius: 20, padding: 40, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Nothing here yet.</div>
          <div style={{ color: PUB.muted, fontSize: 14, marginTop: 6 }}>{name} doesn't have a public page.</div>
        </div>
      </div>
    );
  }

  const prof = page.profile || {};
  const display = page.display_address;
  const ownerName = prof.owner_name || name;
  const firstName = ownerName.split(' ')[0] || ownerName;
  const addrs = page.addresses || {};
  const addrRows = [
    addrs['canton:omnibus'] && { label: 'Canton', caip: 'canton:omnibus', mark: 'CN', value: addrs['canton:omnibus'] },
    addrs['eip155:1'] && { label: 'EVM', caip: 'eip155:1', mark: 'EVM', value: addrs['eip155:1'] },
  ].filter(Boolean);
  const links = nameLinks(page.texts);
  const avatar = (page.texts && page.texts.avatar) || '';
  const avatarOk = isAvatarValue(avatar);
  const rec = page.receptionist;
  const activeMods = page.modes || []; // all active modules, stacked under each other (primary first)

  const Eyebrow = ({ children, color }) => (
    <div style={{ fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: color || PUB.muted }}>{children}</div>
  );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '22px 24px 70px', fontFamily: PUB.sans, color: PUB.ink, lineHeight: 1.4 }}>
      <style>{'@media(max-width:760px){.pub-hero{grid-template-columns:1fr !important}.pub-req{grid-template-columns:1fr !important}.pub-mini{grid-template-columns:1fr !important}.pub-appt{grid-template-columns:auto 1fr !important}}'}</style>
      <button onClick={back} style={pubBackBtn()}>← Back</button>

      <div style={{ borderRadius: 26, overflow: 'hidden', boxShadow: '0 1px 3px rgba(22,19,13,.10), 0 26px 60px rgba(22,19,13,.16)' }}>

        {/* HERO */}
        <section className="pub-hero" style={{ background: PUB.black, color: PUB.cream, padding: 44, display: 'grid',
          gridTemplateColumns: '1.3fr .7fr', gap: 38, alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: PUB.mono, fontSize: 16, textTransform: 'uppercase', letterSpacing: '.12em', color: PUB.sand }}>{display}</div>
            <h1 style={{ fontSize: 'clamp(44px,7vw,76px)', letterSpacing: '-.05em', lineHeight: .86, fontWeight: 800, margin: '16px 0 0' }}>
              {ownerName}<span style={{ color: PUB.red }}>.</span>
            </h1>
            {prof.headline && <div style={{ fontSize: 18, color: '#ece3d4', marginTop: 18, maxWidth: 460 }}>{prof.headline}</div>}
            {prof.bio && <p style={{ fontSize: 15, color: '#cfc6b6', marginTop: 10, maxWidth: 460, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{prof.bio}</p>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 22 }}>
              {rec && rec.active !== 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: PUB.red, color: '#fff',
                  fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderRadius: 999, padding: '9px 14px' }}>● Receptionist on duty</span>
              )}
              {page.owner_verified ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#d8cfbf', fontFamily: PUB.mono,
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7fe0a3' }} />Pairpoint-verified
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#b8ae9c', fontFamily: PUB.mono,
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c9a14a' }} />Identity not verified
                </span>
              )}
            </div>

            {links.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 24 }}>
                {links.map(l => (
                  l.href
                    ? <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer nofollow" style={pubPill()}>{l.label} ↗</a>
                    : <span key={l.key} style={pubPill()}>{l.label}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            {avatarOk
              ? <img src={avatar} alt={ownerName} style={{ display: 'block', width: '100%', aspectRatio: '4 / 5',
                  objectFit: 'cover', borderRadius: 20, border: '1px solid rgba(255,255,255,.14)' }} />
              : <div aria-label={ownerName} style={{ width: '100%', aspectRatio: '4 / 5', borderRadius: 20,
                  border: '1px solid rgba(255,255,255,.14)', background: 'linear-gradient(150deg,#2c2722,#15120c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: PUB.sans, fontWeight: 800, fontSize: 'clamp(48px,9vw,104px)',
                    letterSpacing: '-.04em', color: PUB.sand }}>{initialsOf(ownerName)}</span>
                </div>}
          </div>
        </section>

        {/* MODS — every active mod stacked under each other (no tab switcher). */}
        {activeMods.map((m, i) => (
          <section key={m.key} style={{ background: PUB.paper, padding: '30px 44px',
            borderTop: i === 0 ? '8px solid ' + PUB.red : '1px solid ' + PUB.hair }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 32, letterSpacing: '-.045em', lineHeight: 1, fontWeight: 800, maxWidth: 560 }}>{m.title}</h2>
              <span style={pubModeStatus(m.closed)}>{m.status}</span>
            </div>
            {m.copy && <p style={{ fontSize: 15.5, color: '#2b2b2b', marginTop: 13, maxWidth: 680, lineHeight: 1.5 }}>{m.copy}</p>}
            <PubBlockBody m={m} />
            {m.cta && (
              <div style={{ marginTop: 18 }}>
                <button onClick={() => reqRef.current && reqRef.current.scrollIntoView({ behavior: 'smooth' })} style={pubCta()}>{m.cta} →</button>
              </div>
            )}
          </section>
        ))}

        {/* ON-CHAIN ADDRESSES */}
        {addrRows.length > 0 && (
          <section style={{ background: PUB.paper, padding: '34px 44px', borderTop: activeMods.length ? '1px solid ' + PUB.hair : 'none' }}>
            <Eyebrow>On-chain addresses</Eyebrow>
            <h2 style={{ fontSize: 32, letterSpacing: '-.04em', lineHeight: 1, fontWeight: 700, margin: '8px 0 0' }}>Send to {firstName}</h2>
            <div style={{ marginTop: 16 }}>
              {addrRows.map(a => <AddrRow key={a.caip} a={a} />)}
              <div style={{ borderTop: '1px solid ' + PUB.hair }} />
            </div>
          </section>
        )}

        {/* ROUTE A REQUEST — the receptionist */}
        <section ref={reqRef} style={{ background: PUB.black, color: PUB.cream, padding: 44 }}>
          <div className="pub-req" style={{ display: 'grid', gridTemplateColumns: '.85fr 1.15fr', gap: 30, alignItems: 'start' }}>
            <div>
              <Eyebrow color={PUB.sand}>Route a request</Eyebrow>
              <h2 style={{ fontSize: 30, letterSpacing: '-.04em', lineHeight: 1.05, fontWeight: 700, margin: '12px 0 0' }}>
                What do you want to reach {firstName} about?
              </h2>
              <p style={{ color: '#d8cfbf', fontSize: 14.5, marginTop: 14, lineHeight: 1.5 }}>
                Leave a message with {firstName}'s receptionist. It's screened for relevance and summarised
                before it reaches {firstName} — generic outreach is filtered.
              </p>
            </div>
            <div>
              {rec
                ? <VisitorChat key={name} name={name} receptionist={rec} />
                : <div style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, padding: 24, color: '#afa79a',
                    fontFamily: PUB.mono, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>No receptionist on duty.</div>}
            </div>
          </div>
        </section>

      </div>

      <footer style={{ marginTop: 22, padding: '0 4px', display: 'flex', justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap', color: PUB.muted, fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        <div>{display} · public-facing profile</div>
        <div>Powered by DIAL</div>
      </footer>
    </div>
  );
}

function AddrRow({ a }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => { try { navigator.clipboard?.writeText(a.value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const short = a.value.length > 32 ? a.value.slice(0, 16) + '…' + a.value.slice(-12) : a.value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 0', borderTop: '1px solid ' + PUB.hair }}>
      <span style={{ fontFamily: PUB.mono, fontSize: 14, fontWeight: 700, letterSpacing: '.02em', minWidth: 52, color: PUB.ink }}>{a.mark}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 700, fontSize: 16 }}>{a.label}</b>
        <span style={{ display: 'block', fontFamily: PUB.mono, fontSize: 12, color: PUB.muted, marginTop: 3, wordBreak: 'break-all' }}>{short}</span>
      </span>
      <button onClick={copy} style={{ fontFamily: PUB.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em',
        border: '1px solid ' + PUB.hair, borderRadius: 999, padding: '7px 13px', whiteSpace: 'nowrap', background: PUB.card, color: PUB.ink, cursor: 'pointer' }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function VisitorChat({ name, receptionist }) {
  const [convId, setConvId] = React.useState(null);
  const [token, setToken] = React.useState(null);
  const [messages, setMessages] = React.useState(() => [{ role: 'assistant', content: receptionist.greeting }]);
  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || completed) return;
    setMessages(m => [...m, { role: 'user', content: text }]);
    setInput(''); setSending(true);
    try {
      const res = await sendVisitorMessage(name, convId, token, text);
      setConvId(res.conversation_id); setToken(res.session_token);
      setMessages(m => [...m, { role: 'assistant', content: res.reply }]);
      if (res.completed) setCompleted(true);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry — something went wrong. Please try again.' }]);
    } finally { setSending(false); }
  };

  const hairW = '1px solid rgba(255,255,255,.12)';
  return (
    <div style={{ border: '1px solid rgba(255,255,255,.14)', borderRadius: 16, overflow: 'hidden', background: '#191817' }}>
      <div style={{ padding: '12px 16px', borderBottom: hairW, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: '#7fe0a3' }} />
        <strong style={{ fontSize: 13, color: PUB.cream }}>{receptionist.receptionist_name}</strong>
        <span style={{ fontSize: 11, color: '#afa79a' }}>· for {receptionist.owner_name}</span>
      </div>

      <div ref={scrollRef} style={{ maxHeight: 300, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.45,
              background: m.role === 'user' ? PUB.red : '#262422',
              color: m.role === 'user' ? '#fff' : '#ece3d4' }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '9px 13px', borderRadius: 12, background: '#262422', color: '#afa79a', fontSize: 13 }}>typing…</div>
          </div>
        )}
      </div>

      {completed ? (
        <div style={{ padding: 14, borderTop: hairW, background: '#13110f' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#7fe0a3' }}>✓ Message sent</div>
          <div style={{ fontSize: 12, color: '#afa79a', marginTop: 2 }}>Summarised and forwarded to {receptionist.owner_name}.</div>
        </div>
      ) : (
        <div style={{ padding: 12, borderTop: hairW, display: 'flex', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…" disabled={sending}
            style={{ flex: 1, background: '#0f0e0d', border: '1px solid rgba(255,255,255,.16)', color: PUB.cream,
              padding: '10px 12px', borderRadius: 10, fontSize: 13, outline: 'none' }} />
          <button onClick={send} disabled={sending || !input.trim()}
            style={{ background: PUB.red, color: '#fff', border: 0, borderRadius: 10, padding: '0 16px', fontFamily: PUB.mono,
              fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', cursor: 'pointer', opacity: (sending || !input.trim()) ? .5 : 1 }}>Send</button>
        </div>
      )}
      <div style={{ fontSize: 10, padding: '0 14px 12px', color: '#8b8377', fontFamily: PUB.mono, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        AI receptionist · collects messages, doesn't speak for {receptionist.owner_name}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Admin — list accounts and verify their identity.
// ─────────────────────────────────────────────────────────────
function ScreenAdmin() {
  const { dispatch } = useDial();
  const [authed, setAuthed] = React.useState(hasAdminToken());
  const [users, setUsers] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  // admin login form
  const [u, setU] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [loginBusy, setLoginBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!authed) return;
    let c = false;
    loadAdminUsers().then(list => { if (!c) setUsers(list); })
      .catch(e => { if (!c) { if (/auth|401/i.test(e.message)) { adminLogout(); setAuthed(false); } setUsers([]); } });
    return () => { c = true; };
  }, [authed]);

  const doLogin = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setError(null); setLoginBusy(true);
    try { await adminLogin(u.trim(), pw); setUsers(null); setAuthed(true); }
    catch (err) { setError(/invalid admin/i.test(err.message) ? 'Incorrect username or password.' : err.message); }
    finally { setLoginBusy(false); }
  };
  const signOut = () => { adminLogout(); setAuthed(false); setUsers(null); setU(''); setPw(''); };
  const toggle = async (user) => {
    setBusy(user.id);
    try { const up = await adminSetVerified(user.id, !user.verified); setUsers(list => list.map(x => x.id === user.id ? up : x)); }
    catch (e) { dispatch({ type: 'toast', toast: { kind: 'info', text: e.message } }); }
    finally { setBusy(null); }
  };

  // ── password gate ──
  if (!authed) {
    return (
      <div className="dial-section" style={{ maxWidth: 400 }}>
        <div className="dial-eyebrow accent">Admin</div>
        <h1 className="dial-h1" style={{ fontSize: 28, margin: '2px 0 4px' }}>Admin sign in</h1>
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 16 }}>Restricted area — enter the admin credentials.</div>
        {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
          color: 'var(--dial-accent)', padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 12, fontSize: 12 }}>{error}</div>}
        <form onSubmit={doLogin} className="dial-card" style={{ padding: 16 }} autoComplete="off">
          <div style={{ marginBottom: 12 }}>
            <div className="dial-field-label">Username</div>
            <div className="dial-input-wrap"><input value={u} onChange={e => setU(e.target.value)} placeholder="username" autoFocus /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="dial-field-label">Password</div>
            <div className="dial-input-wrap"><input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" /></div>
          </div>
          <button type="submit" className="dial-btn primary lg" style={{ width: '100%' }} disabled={loginBusy}>
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  if (!users) return <div className="dial-section"><div className="dial-muted">Loading users…</div></div>;
  const verifiedCount = users.filter(x => x.verified).length;

  return (
    <div className="dial-section" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="dial-eyebrow accent">Admin</div>
          <h1 className="dial-h1" style={{ fontSize: 30, margin: '2px 0 2px' }}>Users</h1>
          <div className="dial-muted" style={{ fontSize: 13, marginBottom: 18 }}>
            {users.length} account{users.length === 1 ? '' : 's'} · {verifiedCount} verified. Verify an identity to grant the verified badge and discount.
          </div>
        </div>
        <button className="dial-btn ghost sm" onClick={signOut}>Sign out</button>
      </div>
      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {users.map((user, i) => (
          <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
            borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            <div className="dial-avatar" style={{ width: 34, height: 34, fontSize: 12, flexShrink: 0 }}>{initialsOf(user.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user.name}</div>
              <div className="dial-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email || '—'} · {user.provider} · <code className="dial-mono" style={{ fontSize: 11 }}>{user.owner_address.slice(0, 12)}…</code>
              </div>
            </div>
            {user.verified
              ? <span className="dial-pill ok" style={{ fontSize: 10 }}>Verified</span>
              : <span className="dial-pill warn" style={{ fontSize: 10 }}>Unverified</span>}
            <button className="dial-btn sm" disabled={busy === user.id} onClick={() => toggle(user)}
              style={user.verified ? {} : { borderColor: 'var(--dial-accent)', color: 'var(--dial-accent)', fontWeight: 600 }}>
              {busy === user.id ? '…' : (user.verified ? 'Unverify' : 'Verify')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Owner inbox (retail) — message summaries from the receptionist.
// ─────────────────────────────────────────────────────────────
function ScreenInbox() {
  const { state, dispatch } = useDial();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadInbox(state.org).then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setData({ items: [] }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [state.org]);

  return (
    <div className="dial-section">
      <div style={{ marginBottom: 22 }}>
        <span className="dial-eyebrow">Receptionist</span>
        <h1 className="dial-h2" style={{ fontSize: 26 }}>Inbox</h1>
        <div className="dial-muted" style={{ fontSize: 13 }}>Message summaries your receptionist forwarded to you.</div>
      </div>

      {loading ? <div className="dial-muted">Loading…</div>
        : (!data || data.items.length === 0) ? (
          <div className="dial-card" style={{ padding: 32, textAlign: 'center' }}>
            <div className="dial-h3">No messages yet</div>
            <div className="dial-muted" style={{ fontSize: 13 }}>When a visitor messages your receptionist, the summary lands here.</div>
          </div>
        ) : (
          <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
            {data.items.map((it, i) => (
              <button key={it.id} className="dial-card" onClick={() => dispatch({ type: 'route', route: { screen: 'conversation', inboxId: it.id } })}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, textAlign: 'left', width: '100%',
                  border: 0, borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)', background: 'transparent', cursor: 'pointer', borderRadius: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: it.is_read ? 'var(--dial-border)' : 'var(--dial-accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: it.is_read ? 500 : 700 }}>{it.visitor_name || 'Anonymous visitor'}
                    <span className="dial-mono dial-muted" style={{ fontSize: 11, marginLeft: 8 }}>{it.name}</span>
                  </div>
                  <div className="dial-muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.topic || it.subject}</div>
                </div>
                <span className="dial-muted" style={{ fontSize: 11, fontFamily: 'var(--dial-font-mono)', flexShrink: 0 }}>{fmtDate(it.created_at)}</span>
                <Chevron size={16} stroke="var(--dial-muted)" />
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

function ScreenConversation() {
  const { state, dispatch } = useDial();
  const id = state.route.inboxId;
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadInboxItem(state.org, id).then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [id, state.org]);

  if (loading) return <div className="dial-section"><div className="dial-muted">Loading…</div></div>;
  if (!data) return (
    <div className="dial-section">
      <button className="dial-btn ghost sm" onClick={() => dispatch({ type: 'route', route: { screen: 'inbox' } })}>← Inbox</button>
      <div className="dial-card" style={{ padding: 24, marginTop: 16 }}>Not found.</div>
    </div>
  );

  const conv = data.conversation || {};
  const item = data.item || {};
  // Pull the summary block (everything before "Original conversation:") for display.
  const summaryBlock = (item.body || '').split('Original conversation:')[0].trim();

  return (
    <div className="dial-section" style={{ maxWidth: 760 }}>
      <button className="dial-btn ghost sm" onClick={() => dispatch({ type: 'route', route: { screen: 'inbox' } })} style={{ marginBottom: 16 }}>← Inbox</button>

      <div className="dial-card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div className="dial-h3" style={{ margin: 0 }}>{conv.visitor_name || 'Anonymous visitor'}</div>
          <span className="dial-mono dial-muted" style={{ fontSize: 12 }}>{item.name}</span>
        </div>
        <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5, color: 'var(--dial-text-2)' }}>{summaryBlock}</pre>
      </div>

      <h3 className="dial-h3">Transcript</h3>
      <div className="dial-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data.messages || []).map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'visitor' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: 'var(--dial-radius)', fontSize: 13, lineHeight: 1.45,
              background: m.role === 'visitor' ? 'var(--dial-text)' : 'var(--dial-surface)',
              color: m.role === 'visitor' ? 'var(--dial-bg)' : 'var(--dial-text)',
              border: m.role === 'visitor' ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              {m.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.DialTopBar         = DialTopBar;
window.ScreenHome         = ScreenHome;
window.ScreenDashboard    = ScreenDashboard;
window.ScreenNameDetail   = ScreenNameDetail;
window.ScreenDomainDetail = ScreenDomainDetail;
window.ScreenCart         = ScreenCart;
window.ScreenPublic       = ScreenPublic;
window.ScreenInbox        = ScreenInbox;
window.ScreenConversation = ScreenConversation;
window.ScreenAdmin        = ScreenAdmin;
