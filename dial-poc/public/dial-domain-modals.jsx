// DIAL — corporate-domain modals (FR §4.1). 4-step domain registration,
// issue-a-name-under-domain, and release-domain confirmation.

const { ArrowR: _DAR, ArrowL: _DAL, Check: _DCK, CheckCircle: _DCC, X: _DX,
  Plus: _DP, Shield: _DSH, Spinner: _DSP, Building: _DB, Dollar: _DD,
  Calendar: _DCA, Hash: _DH, Search: _DSE } = window.DialIcons;

// Shared modal primitives live in dial-modals.jsx, re-exposed via window.
const { DialModalFrame, RegStepIdentity, ChainField, Line } = window;

// ─────────────────────────────────────────────────────────────
// Register a corporate domain (.acme)
//   0 · Domain  ·  1 · Identity (Pairpoint Tier-2)  ·  2 · Apex records  ·  3 · Review  ·  4 · Done
// ─────────────────────────────────────────────────────────────
function RegisterDomainFlow() {
  const { state, dispatch } = useDial();
  const m = state.modal;
  const id = state.identity[state.org];

  const [label, setLabel] = React.useState(m.label || '');
  const norm = dialNormalise(label);
  const price = dialDomainPrice(norm.valid ? norm.label : null);
  const [duration, setDuration] = React.useState(1);
  const [step, setStep] = React.useState(label && norm.valid ? 1 : 0);
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState(null);
  // Corporate-domain apex doesn't bind a Canton party — names issued under
  // the domain (finance.acme, …) are the ones that bind parties. EVM dropped.
  const records = {};

  const [checking, setChecking] = React.useState(false);
  const [avail, setAvail] = React.useState(null);
  React.useEffect(() => {
    if (!norm.valid) { setAvail(null); return; }
    setChecking(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const a = await dialDomainCheck(norm.label);
        if (!cancelled) setAvail(a);
      } catch (e) {
        if (!cancelled) setAvail({ available: false, reason: 'error', error: e.message });
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [label]);

  // Identity check removed — corporate-domain registration trusts the
  // account-level verification (handled via the dashboard's Verify-account
  // KYB flow). No second identity step inside the domain flow.
  const steps = ['Domain', 'Review', 'Done'];
  const stepDone = (i) => i < step;
  const totalUsdc = price ? price.usdc * duration : 0;
  const networkFee = 5;
  const close = () => dispatch({ type: 'modal', modal: null });
  const back  = () => setStep(s => Math.max(s - 1, 0));
  const next  = () => {
    if (step === 0 && (!norm.valid || !avail || !avail.available)) return;
    setStep(s => Math.min(s + 1, steps.length - 1));
  };

  const runPay = async () => {
    setError(null);
    setPaying(true);
    try {
      await registerDomain(state, dispatch, norm.label, duration, records);
      setStep(2);
      setTimeout(() => dispatch({ type: 'modal', modal: null }), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setPaying(false);
    }
  };

  return (
    <DialModalFrame title={norm.valid ? `Register .${norm.label}` : 'Register a corporate domain'} eyebrow="Domain issuance · FR §4.1" onClose={close} wide
      foot={
        step === 2
          ? <button className="dial-btn primary lg" onClick={close}>View domain</button>
          : step === 1
            ? <>
                <button className="dial-btn" onClick={back} disabled={paying}><_DAL size={14} /> Back</button>
                <button className="dial-btn primary lg" onClick={runPay} disabled={paying}>
                  {paying ? <><_DSP size={14} stroke="#fff" /> Submitting via Pairpoint AA…</> : <><_DD size={14} stroke="#fff" /> Pay {(totalUsdc + networkFee).toLocaleString()} USDC</>}
                </button>
              </>
            : <>
                {step > 0 && <button className="dial-btn" onClick={back}><_DAL size={14} /> Back</button>}
                <button className="dial-btn primary" onClick={next}
                  disabled={step === 0 && !(norm.valid && avail && avail.available)}>
                  Continue <_DAR size={14} stroke="#fff" />
                </button>
              </>
      }>
      <div className="dial-steps">
        {steps.map((lbl, i) => (
          <React.Fragment key={i}>
            <div className={`dial-step ${i === step ? 'active' : ''} ${stepDone(i) ? 'done' : ''}`}>
              <span className="num">{stepDone(i) ? <_DCK size={11} stroke="#fff" /> : i + 1}</span>
              {lbl}
            </div>
            {i < steps.length - 1 && <div className="bar" />}
          </React.Fragment>
        ))}
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 14, fontSize: 12 }}>
        Error: {error}
      </div>}

      {step === 0 && <DomStepLabel label={label} setLabel={setLabel} norm={norm} avail={avail} checking={checking} price={price} duration={duration} setDuration={setDuration} />}
      {step === 1 && <DomStepReview  label={norm.label} duration={duration} totalUsdc={totalUsdc} networkFee={networkFee} />}
      {step === 2 && <DomStepDone    label={norm.label} />}
    </DialModalFrame>
  );
}

function DomStepLabel({ label, setLabel, norm, avail, checking, price, duration, setDuration }) {
  const display = norm.valid ? '.' + norm.label : '.<your-brand>';
  return (
    <div>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Your corporate domain is your own verifiable TLD — owned by your enterprise, signed by Vodafone Pairpoint, and resolvable on every supported chain.
      </div>

      <div className="dial-field-label">Corporate domain</div>
      <div className="dial-input-wrap lg">
        <span className="suffix">.</span>
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="acme" autoFocus />
        {checking && <_DSP size={16} stroke="var(--dial-muted)" />}
      </div>

      {label && !norm.valid && <div style={{ color: 'var(--dial-warn)', fontSize: 12, marginTop: 6 }}>{norm.reason}</div>}
      {norm.valid && avail && !avail.available && (
        <div className="dial-card" style={{ padding: 12, marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="dial-pill warn">{avail.reason === 'reserved' ? 'Reserved' : 'Taken'}</span>
          <code className="dial-mono" style={{ fontSize: 14, fontWeight: 600, background: 'transparent', border: 0, padding: 0 }}>{display}</code>
          <span className="dial-muted" style={{ fontSize: 12 }}>
            {avail.reason === 'reserved' ? 'On the reserved / trademark blocklist.' : 'Already registered.'}
          </span>
        </div>
      )}

      {norm.valid && avail && avail.available && price && (
        <>
          <div className="dial-card" style={{ padding: 14, marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="dial-pill ok"><_DCC size={11} /> Available</span>
            <div style={{ flex: 1 }}>
              <div className="dial-mono" style={{ fontSize: 16, fontWeight: 600 }}>{display}</div>
              <div className="dial-muted" style={{ fontSize: 12 }}>{price.tier}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="dial-mono" style={{ fontSize: 16, fontWeight: 600 }}>{price.usdc.toLocaleString()} USDC</div>
              <div className="dial-muted" style={{ fontSize: 11 }}>per year</div>
            </div>
          </div>

          <div className="dial-field-label" style={{ marginTop: 16 }}>Registration duration</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[1, 2, 3].map(y => (
              <button key={y} onClick={() => setDuration(y)} className="dial-card"
                style={{
                  padding: 12, textAlign: 'left', cursor: 'pointer',
                  borderColor: duration === y ? 'var(--dial-accent)' : 'var(--dial-border)',
                  background: duration === y ? 'var(--dial-accent-bg)' : 'var(--dial-surface)',
                  borderWidth: duration === y ? '2px' : 'var(--dial-border-w)',
                }}>
                <div className="dial-h3" style={{ marginBottom: 2 }}>{y} year{y > 1 ? 's' : ''}</div>
                <div className="dial-muted" style={{ fontSize: 12 }}>{(price.usdc * y).toLocaleString()} USDC</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
        <_DB size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
        Corporate domains require Tier-2 enterprise verification (corporate register, country, beneficial owners) and entitle you to issue an unlimited number of names under the domain.
      </div>
    </div>
  );
}

function DomStepReview({ label, duration, totalUsdc, networkFee }) {
  return (
    <div>
      <div className="dial-card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="dial-field-label">Corporate domain</div>
        <div className="dial-mono" style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>.{label}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div className="dial-field-label">Duration</div>
            <div style={{ fontSize: 13 }}>{duration} year{duration > 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="dial-field-label">Expires</div>
            <div className="dial-mono" style={{ fontSize: 13 }}>{2026 + duration}-05-15</div>
          </div>
        </div>
      </div>
      <div className="dial-card tint" style={{ padding: 12, marginBottom: 14, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <_DSH size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
        The apex domain itself doesn't bind a Canton party. Names you issue under it (e.g. <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>finance.{label}</code>) bind their own Canton parties under the DIAL namespace.
      </div>
      <div className="dial-card" style={{ padding: 16, background: 'var(--dial-surface-2)' }}>
        <div className="dial-field-label">Settlement</div>
        <Line k="Domain registration" v={`${totalUsdc.toLocaleString()} USDC`} />
        <Line k="Network fee (Pairpoint AA · sponsored)" v={`${networkFee} USDC`} muted />
        <div style={{ height: 1, background: 'var(--dial-border)', margin: '8px 0' }} />
        <Line k="Total" v={<span style={{ fontWeight: 700, fontSize: 15 }}>{(totalUsdc + networkFee).toLocaleString()} USDC</span>} />
      </div>
    </div>
  );
}

function DomStepDone({ label }) {
  return (
    <div style={{ textAlign: 'center', padding: '28px 12px 12px' }}>
      <div style={{ width: 64, height: 64, borderRadius: '999px', background: 'var(--dial-accent-bg)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <_DCK size={32} stroke="var(--dial-accent)" strokeWidth={2.2} />
      </div>
      <div className="dial-h2" style={{ fontSize: 24 }}>.{label} is yours.</div>
      <div className="dial-muted" style={{ fontSize: 13, marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
        You can now issue names under your corporate domain. On-chain copies are propagating to Canton + EVM.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Issue a name under a corporate domain (e.g. finance.acme)
// ─────────────────────────────────────────────────────────────
function IssueNameModal() {
  const { state, dispatch } = useDial();
  const m = state.modal;
  const [label, setLabel] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [issuing, setIssuing] = React.useState(false);
  const [error, setError] = React.useState(null);

  const norm = dialNormalise(label);
  const domain = state.domains[state.org].find(d => d.domain === m.parent);
  const fullName = norm.valid && domain ? `${norm.label}${domain.domain}` : null;
  const conflict = domain && fullName && domain.names.some(n => n.name === fullName);

  const close = () => dispatch({ type: 'modal', modal: null });
  const create = async () => {
    if (!norm.valid || conflict) return;
    setError(null);
    setIssuing(true);
    try {
      // Canton party is auto-bound by the backend (DIAL namespace).
      await issueNameUnderDomain(state, dispatch, m.parent, norm.label, owner || 'unassigned');
    } catch (e) {
      setError(e.message);
    } finally {
      setIssuing(false);
    }
  };

  return (
    <DialModalFrame title={`Issue a name under ${m.parent}`} eyebrow="Issue name · FR §4.2.7" onClose={close}
      foot={
        <>
          <button className="dial-btn" onClick={close} disabled={issuing}>Cancel</button>
          <button className="dial-btn primary" onClick={create} disabled={!norm.valid || conflict || issuing}>
            {issuing ? <><_DSP size={14} stroke="#fff" /> Issuing…</> : <><_DP size={14} stroke="#fff" /> Issue name</>}
          </button>
        </>
      }>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Names roll up to your verified <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{m.parent}</code> parent. The owner is whoever in your org controls the keys for it.
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 14, fontSize: 12 }}>
        Error: {error}
      </div>}

      <div style={{ marginBottom: 14 }}>
        <div className="dial-field-label">Name</div>
        <div className="dial-input-wrap">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="finance" autoFocus />
          <span className="suffix">{m.parent}</span>
        </div>
        {label && !norm.valid && <div style={{ color: 'var(--dial-warn)', fontSize: 12, marginTop: 6 }}>{norm.reason}</div>}
        {conflict && <div style={{ color: 'var(--dial-warn)', fontSize: 12, marginTop: 6 }}>A name with this label has already been issued.</div>}
        {norm.valid && !conflict && fullName && <div style={{ color: 'var(--dial-ok)', fontSize: 12, marginTop: 6 }}>
          ✓ <code className="dial-mono" style={{ color: 'var(--dial-ok)' }}>{fullName}</code> is available under your domain.
        </div>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="dial-field-label">Owner / team</div>
        <div className="dial-input-wrap">
          <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="finance-ops" />
        </div>
      </div>

      <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <_DSH size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
        Canton party id is issued automatically under the DIAL namespace once you confirm — it'll show on the issued names table.
      </div>
    </DialModalFrame>
  );
}

// ─────────────────────────────────────────────────────────────
// Release corporate domain confirmation
// ─────────────────────────────────────────────────────────────
function ReleaseDomainModal() {
  const { state, dispatch } = useDial();
  const m = state.modal;
  const [confirm, setConfirm] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState(null);
  const close = () => dispatch({ type: 'modal', modal: null });
  const canRelease = confirm.trim().toLowerCase() === m.domain.toLowerCase();
  const run = async () => {
    setError(null); setWorking(true);
    try {
      await releaseDomain(state, dispatch, m.domain);
    } catch (e) {
      setError(e.message);
      setWorking(false);
    }
  };
  return (
    <DialModalFrame title={`Release ${m.domain}`} eyebrow="Danger zone" onClose={close}
      foot={
        <>
          <button className="dial-btn" onClick={close} disabled={working}>Cancel</button>
          <button className="dial-btn danger" onClick={run} disabled={!canRelease || working}>
            {working ? <><_DSP size={14} /> Releasing…</> : <>Release {m.domain}</>}
          </button>
        </>
      }>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 14, marginBottom: 16, display: 'flex', gap: 12 }}>
        <_DSH size={20} stroke="var(--dial-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>This will release the corporate domain.</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            Names issued under <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{m.domain}</code> remain in the registry until they expire, but new issuance is no longer possible. After the 30-day grace window the TLD can be claimed by anyone.
          </div>
        </div>
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 14, fontSize: 12 }}>
        Error: {error}
      </div>}

      <div className="dial-field-label">Type <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{m.domain}</code> to confirm</div>
      <div className="dial-input-wrap">
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={m.domain} autoFocus />
      </div>
    </DialModalFrame>
  );
}

window.RegisterDomainFlow = RegisterDomainFlow;
window.IssueNameModal     = IssueNameModal;
window.ReleaseDomainModal = ReleaseDomainModal;
