// DIAL app entry — wires reducer, theme switcher, screens, modals.

function DialApp() {
  const [state, dispatch] = React.useReducer(dialReducer, DIAL_INITIAL);
  // Theme switcher removed from the UI; the app uses Mono (C) only.
  const themeName = 'mono';
  const setThemeName = () => {};

  // On load: capture an OAuth redirect token / restore an existing session.
  React.useEffect(() => { authBootstrap(dispatch).catch(() => {}); }, []);

  // Toast auto-dismiss.
  React.useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'toast', toast: null }), 2400);
    return () => clearTimeout(t);
  }, [state.toast]);

  // Hydrate org names + identity from the backend on login + persona switch.
  // No fetch when logged out — search still works against the public endpoint.
  React.useEffect(() => {
    if (!state.loggedIn) return;
    fetchOrgNames(state, dispatch, state.org).catch(e => {
      console.error('fetchOrgNames failed', e);
      dispatch({ type: 'toast', toast: { kind: 'info', text: 'Could not load names: ' + e.message } });
    });
  }, [state.org, state.loggedIn]);

  const themeDef = DIAL_THEMES[themeName] || DIAL_THEMES.cream;
  const themeClass = `theme-${themeDef.name}`;

  const ctx = { state, dispatch, theme: themeDef, themeName, setThemeName };

  // Routes that require an authenticated user. Falls back to home if hit
  // while logged out (e.g. after logout while on dashboard). Cart is open
  // to anyone — you fill the basket first and sign in at checkout.
  const isProtected = ['dashboard', 'name', 'domain', 'inbox', 'conversation'].includes(state.route.screen);
  const showHome = state.route.screen === 'home' || (isProtected && !state.loggedIn);

  return (
    <DialCtx.Provider value={ctx}>
      <div className={`dial-root ${themeClass}`} style={themeDef.vars}>
        <DialTopBar />
        <div className="dial-body">
          {showHome && <ScreenHome />}
          {state.route.screen === 'dashboard'    && state.loggedIn && <ScreenDashboard />}
          {state.route.screen === 'name'         && state.loggedIn && <ScreenNameDetail />}
          {state.route.screen === 'domain'       && state.loggedIn && <ScreenDomainDetail />}
          {state.route.screen === 'inbox'        && state.loggedIn && <ScreenInbox />}
          {state.route.screen === 'conversation' && state.loggedIn && <ScreenConversation />}
          {state.route.screen === 'public'       && <ScreenPublic />}
          {state.route.screen === 'cart'         && <ScreenCart />}
        </div>
        <DialModals />
        {state.toast && (
          <div className="dial-toast">
            {state.toast.kind === 'ok' ? '✓' : 'ⓘ'} {state.toast.text}
          </div>
        )}
      </div>
    </DialCtx.Provider>
  );
}

window.DialApp = DialApp;
