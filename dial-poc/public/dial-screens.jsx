// DIAL — TopBar + main screens (Home, Dashboard, NameDetail).
// Reads state from useDial(), mutates only via dispatch / async actions in dial-state.jsx.

const { Search, ArrowR, ArrowL, Check, CheckCircle, X, Plus, Edit, Copy, External,
  Shield, User, Building, Wallet, Globe, Hash, Chevron, ChevronDown, Bell,
  Wand, Refresh, Code, Dollar, Calendar, Spinner, Cart, Trash2 } = window.DialIcons;

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
        <button className="dial-nav-item" onClick={() => dispatch({ type: 'toast', toast: { kind: 'info', text: 'Developer docs are out of scope for this demo.' } })}>Developers</button>
      </div>

      <div className="dial-topbar-spacer" />


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
              {id.initials || (isAcme ? 'A' : 'AM')}
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
  const { state, dispatch } = useDial();
  // Stays mounted across hover open/close so typed credentials, intent,
  // and form state are preserved.
  const [intent, setIntent] = React.useState('signin');
  const LF = window.LoginForm;
  const G  = window.GoogleIcon;
  const A  = window.AppleIcon;

  const socialLogin = (provider, org) => {
    dispatch({ type: 'login', org });
    const persona = window.PERSONAS && window.PERSONAS[org];
    if (persona) dispatch({ type: 'toast', toast: { kind: 'ok', text: `Mock: signed in as ${persona.name.split(' ')[0]} via ${provider}.` } });
    onClose();
  };
  const submitForm = async (org, opts) => {
    if (opts && opts.fresh && window.freshSignup) await window.freshSignup(state, dispatch, org);
    else dispatch({ type: 'login', org });
    onClose();
  };

  return (
    <div className="dial-signin-popover" onClick={e => e.stopPropagation()}
      style={open ? undefined : { display: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>
          {intent === 'register' ? 'Create your DIAL account' : 'Sign in to DIAL'}
        </strong>
      </div>
      <div className="dial-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {intent === 'register'
          ? 'Create a DIAL account. You can verify your identity afterwards to unlock the 25% discount.'
          : 'Sign in to manage your DIAL names and check out your cart.'}
      </div>

      {LF && <LF intent={intent} onSubmit={submitForm} />}

      <div className="dial-divider-text">or continue with</div>

      <button type="button" className="dial-social-btn" onClick={() => socialLogin('Google', 'bob')}>
        {G && <G size={18} />} Continue with Google
      </button>
      <button type="button" className="dial-social-btn apple" onClick={() => socialLogin('Apple', 'personal')}>
        {A && <A size={18} />} Continue with Apple
      </button>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: 'var(--dial-border-w) dashed var(--dial-border)',
        textAlign: 'center', fontSize: 12, color: 'var(--dial-muted)' }}>
        {intent === 'register' ? (
          <>Already have an account? <a onClick={() => setIntent('signin')}
            style={{ color: 'var(--dial-accent)', cursor: 'pointer', fontWeight: 600 }}>Sign in</a></>
        ) : (
          <>New to DIAL? <a onClick={() => setIntent('register')}
            style={{ color: 'var(--dial-accent)', cursor: 'pointer', fontWeight: 600 }}>Create an account</a></>
        )}
      </div>
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
      <button onClick={logout} style={{
        width: '100%', padding: '11px 16px', textAlign: 'left',
        border: 0, background: 'transparent', cursor: 'pointer',
        fontSize: 13, color: 'var(--dial-text)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--dial-bg-soft)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        Logout
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
    : ['alice', 'acme', 'satoshi', 'vodafone-treasury', 'dao-of-dao'];

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
            : <>Register a DIAL name — like <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>alice.dial</code> — and map it to your Canton party and EVM address. Counterparties send to the name. Identity verified through Pairpoint.</>}
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
            placeholder={mode === 'domain' ? 'acme' : 'alice'}
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
          if (!id.verified) { dispatch({ type: 'modal', modal: { kind: 'verify-only' } }); return; }
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
function ScreenDashboard() {
  const { state, dispatch } = useDial();
  const names   = state.names[state.org] || [];
  const domains = state.domains[state.org] || [];
  const id      = state.identity[state.org];
  const isAcme  = state.org === 'acme';

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
              if (!id.verified) { dispatch({ type: 'modal', modal: { kind: 'verify-only' } }); return; }
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
            {id.verified ? 'Vodafone Pairpoint identity attestation on file' : 'Identity not verified yet'}
          </div>
          <div className="dial-muted" style={{ fontSize: 12 }}>
            {id.verified
              ? <>Level <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{id.level}</code> · attestation hash <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{id.hash}</code>
                {isAcme && id.regId && <> · {id.regId} {id.country}</>}</>
              : 'You need to verify through Pairpoint before you can register a name.'}
          </div>
        </div>
        <DemoVerifyToggle />
        {!id.verified && (
          <button className="dial-btn primary" onClick={() => dispatch({ type: 'modal', modal: { kind: 'verify-only' } })}>
            Verify account
          </button>
        )}
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

// Mockup-only toggle that flips the persona's verified flag in React state.
// Verify calls /v1/idh/verify to get a real attestation hash; unverify just
// clears the UI state locally. Useful for demoing both dashboard states.
function DemoVerifyToggle() {
  const { state, dispatch } = useDial();
  const id = state.identity[state.org];
  const [working, setWorking] = React.useState(false);
  const onClick = async () => {
    setWorking(true);
    try {
      if (id.verified) {
        dispatch({ type: 'set-identity', org: state.org, patch: { verified: false, level: null, hash: null, fullHash: null } });
        dispatch({ type: 'toast', toast: { kind: 'info', text: 'Mock: ' + id.name.split(' ')[0] + ' is now unverified.' } });
      } else {
        await verifyIdentity(state, dispatch, state.org);
        dispatch({ type: 'toast', toast: { kind: 'ok', text: 'Mock: ' + id.name.split(' ')[0] + ' is now verified.' } });
      }
    } catch (e) {
      dispatch({ type: 'toast', toast: { kind: 'info', text: 'Toggle failed: ' + e.message } });
    } finally {
      setWorking(false);
    }
  };
  return (
    <button className="dial-btn ghost sm" onClick={onClick} disabled={working}
      title="Mockup-only: flip the persona's verified state for demoing both UI states">
      <span style={{ fontSize: 9.5, color: 'var(--dial-muted)', letterSpacing: '0.08em', marginRight: 6 }}>MOCK</span>
      {id.verified ? 'Unverify' : 'Verify'}
    </button>
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
        if (!id.verified) { dispatch({ type: 'modal', modal: { kind: 'verify-only' } }); return; }
        dispatch({ type: 'modal', modal: { kind: 'register-domain', label: '', step: 0, duration: 1, records: {} } });
      }}>
        {id.verified ? 'Register · from 2,400 USDC/yr' : 'Verify to register a domain'}
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
  const [tab, setTab] = React.useState('records');

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
        <button className="dial-btn" onClick={() => renewName(state, dispatch, name.name)}><Refresh size={14} /> Renew</button>
        <button className="dial-btn" onClick={() => setTab('records')}><Edit size={14} /> Edit</button>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: 'var(--dial-border-w) solid var(--dial-border)', marginBottom: 20 }}>
        {[
          ['records',  'Chain records', Object.keys(name.records).length],
          ['subnames', 'Subnames',      (name.subnames || []).length],
          ['settings', 'Settings',      null],
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

      {tab === 'records'  && <NameRecords name={name} />}
      {tab === 'subnames' && <NameSubnames name={name} />}
      {tab === 'settings' && <NameSettings name={name} />}
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
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="dial-btn sm" disabled><Plus size={12} /> Add chain (Phase 1)</button>
        </div>

        <h3 className="dial-h3" style={{ marginTop: 26, marginBottom: 10 }}>Text records</h3>
        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          {Object.entries(name.text || {}).map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <code className="dial-mono" style={{ fontSize: 11, color: 'var(--dial-muted)', minWidth: 90, background: 'transparent', border: 0, padding: 0 }}>{k}</code>
              <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--dial-font-mono)' }}>{v || <span className="dial-muted">—</span>}</span>
              <Edit size={13} stroke="var(--dial-muted)" />
            </div>
          ))}
          {Object.keys(name.text || {}).length === 0 && <div className="dial-muted" style={{ padding: 14, fontSize: 13 }}>No text records.</div>}
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
  // 'base' tab removed — the apex domain doesn't bind a Canton party.
  React.useEffect(() => { if (tab === 'base') setTab('names'); }, [tab]);

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

function DomainBase({ domain }) {
  const { state, dispatch } = useDial();
  const [records, setRecords] = React.useState(domain.base);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { setRecords(domain.base); setDirty(false); }, [domain.domain, JSON.stringify(domain.base)]);
  const update = (key, val) => { setRecords({ ...records, [key]: val }); setDirty(true); };
  const save = async () => {
    setSaving(true);
    try {
      await updateDomainRecords(state, dispatch, domain.domain, records);
      setDirty(false);
    } catch (e) {
      dispatch({ type: 'toast', toast: { kind: 'info', text: 'Save failed: ' + e.message } });
    } finally {
      setSaving(false);
    }
  };

  const cantonNs = (window.CANTON_NS && window.CANTON_NS.fingerprint) || '';
  const chainMeta = {
    'canton:omnibus': {
      label: 'Canton',
      sub: cantonNs
        ? `Apex party id · DIAL ns ${cantonNs.slice(0, 10)}…`
        : 'Default Canton party for the apex domain',
      mark: 'CN',  color: '#5f6cff',
    },
    'eip155:1':       { label: 'EVM-compatible', sub: 'Default EVM account for the apex domain',  mark: 'EVM', color: '#3ddc97' },
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 className="dial-h3">Apex records · resolved by <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{domain.domain}</code></h3>
          {dirty && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="dial-btn sm" onClick={() => { setRecords(domain.base); setDirty(false); }} disabled={saving}>Discard</button>
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
                  style={{ width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
                    color: 'var(--dial-text)', padding: '7px 10px', borderRadius: 'var(--dial-radius-sm)',
                    fontFamily: 'var(--dial-font-mono)', fontSize: 12, outline: 'none' }} />
              </div>
            </div>
          ))}
        </div>
        <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10 }}>
          <Shield size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
          Resolving <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{domain.domain}</code> directly returns these records.
          Issued names like <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>finance{domain.domain}</code> override them with their own.
        </div>
      </div>

      <div>
        <h3 className="dial-h3">Resolver preview</h3>
        <div className="dial-card tint" style={{ padding: 14, fontFamily: 'var(--dial-font-mono)', fontSize: 11 }}>
          <div className="dial-muted">GET /v1/domains/{domain.domain.slice(1)}</div>
          <pre style={{ margin: '8px 0 0', padding: 0, background: 'transparent', border: 0, color: 'var(--dial-text)', whiteSpace: 'pre-wrap' }}>
{`{
  "domain": "${domain.domain}",
  "addresses": ${JSON.stringify(records, null, 2).split('\n').join('\n  ')},
  "attestation_hash": "${shortHash(domain.attestation)}",
  "expires_at": "${domain.expires}"
}`}
          </pre>
        </div>
      </div>
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

window.DialTopBar         = DialTopBar;
window.ScreenHome         = ScreenHome;
window.ScreenDashboard    = ScreenDashboard;
window.ScreenNameDetail   = ScreenNameDetail;
window.ScreenDomainDetail = ScreenDomainDetail;
window.ScreenCart         = ScreenCart;
