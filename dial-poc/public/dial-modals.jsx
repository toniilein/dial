// DIAL — modals. Registration flow (multi-step) wired to real IDH + registrar.
// Subname modal stays UI-only (out of Phase 0 backend scope).

const { Search: SearchIcon, ArrowR: ArrowR2, ArrowL: ArrowL2, Check: CheckIcon,
  CheckCircle: CheckCircleIcon, X: XIcon, Plus: PlusIcon, Shield: ShieldIcon,
  Wallet: WalletIcon, Globe: GlobeIcon, Hash: HashIcon, Spinner: SpinnerIcon,
  User: UserIcon, Building: BuildingIcon, Dollar: DollarIcon,
  Calendar: CalendarIcon } = window.DialIcons;

function DialModalFrame({ title, eyebrow, onClose, foot, children, wide }) {
  return (
    <div className="dial-modal-backdrop" onClick={onClose}>
      <div className={`dial-modal ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="dial-modal-head">
          <div style={{ flex: 1 }}>
            {eyebrow && <div className="dial-eyebrow" style={{ marginBottom: 2 }}>{eyebrow}</div>}
            <div className="dial-modal-title">{title}</div>
          </div>
          <button className="dial-iconbtn" onClick={onClose}><XIcon size={16} /></button>
        </div>
        <div className="dial-modal-body">{children}</div>
        {foot && <div className="dial-modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Registration flow
//   0 · Duration  →  1 · Identity (Pairpoint IDH)  →  2 · Records  →  3 · Review/Pay  →  4 · Done
// ─────────────────────────────────────────────────────────────
function RegisterFlow() {
  const { state, dispatch } = useDial();
  const m = state.modal;
  const id = state.identity[state.org];
  const [duration, setDuration] = React.useState(m.duration || 1);
  const [step, setStep] = React.useState(0);
  const [verifying, setVerifying] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState(null);
  // When the user opts to skip Pairpoint verification, the registration goes
  // through with no attestation hash (§4.6 demo-mode bypass).
  const [skipVerify, setSkipVerify] = React.useState(false);
  // Canton party id is populated after payment — shown on the Done step.
  const [cantonParty, setCantonParty] = React.useState('');

  // Pricing — verified consumers on .dial get a discount unless they opt to
  // skip verification.
  const eligibleDiscount = id.verified && !skipVerify;
  const price     = dialPrice(m.label, { verified: eligibleDiscount });
  const listPrice = dialPrice(m.label);

  const steps = ['Duration', 'Identity', 'Review', 'Done'];
  const stepDone = (i) => i < step || (i === 1 && (id.verified || skipVerify));

  const totalUsdc = price ? (price.perYear ? price.usdc * duration : price.usdc) : 0;
  const networkFee = 2;
  const grandTotal = totalUsdc + networkFee;

  const close = () => dispatch({ type: 'modal', modal: null });
  const next = () => {
    if (step === 1 && !id.verified && !skipVerify) return;
    setStep(s => Math.min(s + 1, steps.length - 1));
  };
  const back = () => setStep(s => Math.max(s - 1, 0));

  const skipIdentity = () => { setSkipVerify(true); setStep(2); };

  const runVerify = async () => {
    setError(null);
    setVerifying(true);
    try {
      await verifyIdentity(state, dispatch, state.org);
      setTimeout(() => setStep(2), 350);
    } catch (e) {
      setError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  const runPay = async () => {
    setError(null);
    setPaying(true);
    try {
      const party = await registerName(state, dispatch, m.label, duration, { skipVerify: skipVerify && !id.verified });
      setCantonParty(party);
      setStep(3);
      // The Done step stays open so the user can read the receipt — they
      // click "View name" in the foot to dismiss.
    } catch (e) {
      setError(e.message);
    } finally {
      setPaying(false);
    }
  };

  // Identity step is always shown — when the persona is already verified,
  // it renders the green "Verified" card so the step is visible in the flow.

  return (
    <DialModalFrame title={`Register ${m.label}.dial`} eyebrow={state.org === 'acme' ? 'Acme Industries' : 'Personal'} onClose={close} wide
      foot={
        step === 3
          ? <button className="dial-btn primary lg" onClick={() => {
              dispatch({ type: 'modal', modal: null });
              dispatch({ type: 'route', route: { screen: 'name', name: m.label + '.dial' } });
            }}>View name</button>
          : step === 2
            ? <>
                <button className="dial-btn" onClick={back} disabled={paying}><ArrowL2 size={14} /> Back</button>
                <button className="dial-btn primary lg" onClick={runPay} disabled={paying}>
                  {paying ? <><SpinnerIcon size={14} stroke="#fff" /> Submitting via Pairpoint AA…</> : <><DollarIcon size={14} stroke="#fff" /> Pay {grandTotal} USDC</>}
                </button>
              </>
            : <>
                {step > 0 && <button className="dial-btn" onClick={back}><ArrowL2 size={14} /> Back</button>}
                <button className="dial-btn primary" onClick={next}
                  disabled={(step === 1 && !id.verified && !skipVerify)}>
                  Continue <ArrowR2 size={14} stroke="#fff" />
                </button>
              </>
      }>
      <div className="dial-steps">
        {steps.map((label, i) => (
          <React.Fragment key={i}>
            <div className={`dial-step ${i === step ? 'active' : ''} ${stepDone(i) ? 'done' : ''}`}>
              <span className="num">{stepDone(i) ? <CheckIcon size={11} stroke="#fff" /> : i + 1}</span>
              {label}
            </div>
            {i < steps.length - 1 && <div className="bar" />}
          </React.Fragment>
        ))}
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 14, fontSize: 12 }}>
        Error: {error}
      </div>}

      {step === 0 && <RegStepDuration label={m.label} duration={duration} setDuration={setDuration} price={price} listPrice={listPrice} eligibleDiscount={eligibleDiscount} verifiedAvailable={!id.verified} />}
      {step === 1 && <RegStepIdentity verifying={verifying} runVerify={runVerify} skipIdentity={skipIdentity} skipVerify={skipVerify} />}
      {step === 2 && <RegStepReview   label={m.label} duration={duration} totalUsdc={totalUsdc} networkFee={networkFee} skipVerify={skipVerify && !id.verified} price={price} listPrice={listPrice} />}
      {step === 3 && <RegStepDone     label={m.label} cantonParty={cantonParty} />}
    </DialModalFrame>
  );
}

function RegStepDuration({ label, duration, setDuration, price, listPrice, eligibleDiscount, verifiedAvailable }) {
  return (
    <div>
      <div className="dial-card tint" style={{ padding: 14, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="dial-pill ok"><CheckCircleIcon size={11} /> Available</span>
        <div style={{ flex: 1 }}>
          <div className="dial-mono" style={{ fontSize: 16, fontWeight: 600 }}>{label}.dial</div>
          <div className="dial-muted" style={{ fontSize: 12 }}>
            {price.tier}
            {eligibleDiscount && <span className="dial-pill ok" style={{ marginLeft: 8, fontSize: 10 }}>{price.discountPct}% verified</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {eligibleDiscount && (
            <div className="dial-muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{listPrice.usdc} USDC</div>
          )}
          <div className="dial-mono" style={{ fontSize: 16, fontWeight: 600, color: eligibleDiscount ? 'var(--dial-ok)' : 'inherit' }}>{price.usdc} USDC</div>
          <div className="dial-muted" style={{ fontSize: 11 }}>{price.perYear ? 'per year' : 'flat'}</div>
        </div>
      </div>

      {verifiedAvailable && (
        <div className="dial-card" style={{ padding: 12, marginBottom: 14, borderColor: 'var(--dial-accent)',
          background: 'var(--dial-accent-bg)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <ShieldIcon size={16} stroke="var(--dial-accent)" />
          <div style={{ flex: 1, fontSize: 12.5 }}>
            <strong>Save {VERIFIED_DISCOUNT_PCT}% with a verified account.</strong>
            <span className="dial-muted">  Verify identity in the next step to unlock {((listPrice.usdc - (listPrice.usdc * (100 - VERIFIED_DISCOUNT_PCT)) / 100) * duration).toFixed(0)} USDC off over {duration} year{duration > 1 ? 's' : ''}.</span>
          </div>
        </div>
      )}

      <div className="dial-field-label">Registration duration</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        {[1, 2, 3].map(y => (
          <button key={y} onClick={() => setDuration(y)}
            className="dial-card"
            style={{
              padding: 14, textAlign: 'left', cursor: 'pointer',
              borderColor: duration === y ? 'var(--dial-accent)' : 'var(--dial-border)',
              background: duration === y ? 'var(--dial-accent-bg)' : 'var(--dial-surface)',
              borderWidth: duration === y ? '2px' : 'var(--dial-border-w)',
            }}>
            <div className="dial-h3" style={{ marginBottom: 2 }}>{y} year{y > 1 ? 's' : ''}</div>
            <div className="dial-muted" style={{ fontSize: 12 }}>
              {eligibleDiscount && <span style={{ textDecoration: 'line-through', marginRight: 4 }}>{listPrice.usdc * y}</span>}
              <span style={{ color: eligibleDiscount ? 'var(--dial-ok)' : 'inherit', fontWeight: eligibleDiscount ? 600 : 'inherit' }}>
                {price.usdc * y} USDC
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <CalendarIcon size={14} stroke="var(--dial-muted)" style={{ marginTop: 2 }} />
        Annual renewal with a 30-day grace period before the name lapses. We'll remind you 30 days before expiry.
      </div>
    </div>
  );
}

function RegStepIdentity({ verifying, runVerify, skipIdentity, skipVerify }) {
  const { state } = useDial();
  const id = state.identity[state.org];
  const isOrg = state.org === 'acme';

  return (
    <div>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 16, marginBottom: 16, display: 'flex', gap: 12 }}>
        <div style={{ width: 38, height: 38, background: 'var(--dial-accent)', color: '#fff',
          borderRadius: 'var(--dial-radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShieldIcon size={20} stroke="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Vodafone Pairpoint Identity Hub</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            DIAL stores only the resulting attestation hash — never your PII. {isOrg
              ? 'For enterprises this is a one-time check against the corporate register.'
              : 'For consumers this is a one-time KYC walkthrough via the Pairpoint app.'}
          </div>
        </div>
      </div>

      {id.verified ? (
        <div className="dial-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckCircleIcon size={20} stroke="var(--dial-ok)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{id.level} on file</div>
            <div className="dial-muted" style={{ fontSize: 12 }}>Attestation hash <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{id.hash}</code></div>
          </div>
        </div>
      ) : (
        <>
          <div className="dial-card" style={{ padding: 18, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: 'var(--dial-bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isOrg ? <BuildingIcon size={18} /> : <UserIcon size={18} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{id.name}</div>
                {isOrg && <div className="dial-muted" style={{ fontSize: 12 }}>{id.regId} · {id.country}</div>}
                {!isOrg && <div className="dial-muted" style={{ fontSize: 12 }}>Consumer · Pairpoint walkthrough</div>}
              </div>
            </div>
            <button className="dial-btn primary lg" style={{ width: '100%' }} onClick={runVerify} disabled={verifying}>
              {verifying ? <><SpinnerIcon size={14} stroke="#fff" /> Verifying via Pairpoint…</> : <>Verify with Pairpoint <ArrowR2 size={14} stroke="#fff" /></>}
            </button>
          </div>
          <div className="dial-muted" style={{ fontSize: 11, textAlign: 'center' }}>
            By continuing, you authorise Vodafone Pairpoint to share an attestation hash with DIAL. No personal data leaves Pairpoint.
          </div>

          {skipIdentity && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: 'var(--dial-border-w) dashed var(--dial-border)', textAlign: 'center' }}>
              <button onClick={skipIdentity} disabled={verifying}
                style={{ background: 'transparent', border: 0, color: 'var(--dial-muted)', fontSize: 12, cursor: 'pointer',
                  textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Skip — register without verification
              </button>
              <div className="dial-muted" style={{ fontSize: 11, marginTop: 6 }}>
                The name will carry no Pairpoint attestation. <strong>Demo mode</strong> — diverges from §4.6 (MUST verify).
              </div>
            </div>
          )}
        </>
      )}

      {skipVerify && !id.verified && (
        <div className="dial-card" style={{ padding: 14, marginTop: 12, borderColor: 'var(--dial-warn)',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="dial-pill warn">Self-attested</span>
          <div className="dial-muted" style={{ fontSize: 12.5, flex: 1 }}>
            This registration will skip Pairpoint. The name will show as <em>unverified</em> on the dashboard.
          </div>
        </div>
      )}
    </div>
  );
}

function RegStepRecords({ label, records, setRecords }) {
  return (
    <div>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Bind your <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{label}.dial</code> to addresses on the chains you use.
        You can update or add chains any time. Each binding requires proof of control (EIP-712 / Daml party auth).
      </div>

      <ChainField mark="CN"  label="Canton party"     color="#5f6cff" caip="canton:omnibus"
        placeholder={dialCantonParty(label + '.dial') || '<hint>::1220<fingerprint>'}
        value={records['canton:omnibus']}
        onChange={v => setRecords({ ...records, 'canton:omnibus': v })} />

      <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 4 }}>
        <ShieldIcon size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
        Non-custodial — your signing key never leaves your device. EVM binding is out of scope for the Phase 0 PoC; add it later from the name detail page.
      </div>
    </div>
  );
}

function ChainField({ mark, label, color, caip, placeholder, value, onChange }) {
  return (
    <div className="dial-card" style={{ padding: 14, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: color, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontFamily: 'var(--dial-font-mono)', fontWeight: 700, flexShrink: 0 }}>
        {mark}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
          <code className="dial-mono dial-muted" style={{ fontSize: 11, background: 'transparent', border: 0, padding: 0 }}>{caip}</code>
        </div>
        <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
            color: 'var(--dial-text)', padding: '7px 10px', borderRadius: 'var(--dial-radius-sm)',
            fontFamily: 'var(--dial-font-mono)', fontSize: 12, outline: 'none' }} />
      </div>
    </div>
  );
}

function RegStepReview({ label, duration, totalUsdc, networkFee, skipVerify, price, listPrice }) {
  const exYear = new Date().getFullYear() + duration;
  const today = new Date().toISOString().slice(0, 10);
  const discounted = price.discountPct > 0;
  const listTotal = listPrice.usdc * duration;
  const savings = listTotal - totalUsdc;
  return (
    <div>
      {skipVerify && (
        <div className="dial-card" style={{ padding: 12, marginBottom: 14, borderColor: 'var(--dial-warn)',
          display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
          <span className="dial-pill warn">Self-attested</span>
          <span className="dial-muted">No Pairpoint attestation — this name will be flagged unverified, and the verified discount doesn't apply.</span>
        </div>
      )}
      <div className="dial-card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="dial-field-label">Name</div>
        <div className="dial-mono" style={{ fontSize: 20, fontWeight: 700, marginBottom: 14 }}>{label}.dial</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div className="dial-field-label">Duration</div>
            <div style={{ fontSize: 13 }}>{duration} year{duration > 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="dial-field-label">Expires</div>
            <div className="dial-mono" style={{ fontSize: 13 }}>{today} → {exYear}-{today.slice(5)}</div>
          </div>
        </div>
      </div>

      <div className="dial-card tint" style={{ padding: 12, marginBottom: 14, fontSize: 12, color: 'var(--dial-muted)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <ShieldIcon size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
        DIAL issues a Canton party id for this name automatically, under the DIAL namespace. You'll see it on the receipt after payment.
      </div>

      <div className="dial-card" style={{ padding: 16, background: 'var(--dial-surface-2)' }}>
        <div className="dial-field-label">Settlement</div>
        {discounted ? (
          <>
            <Line k="Registration · list price" v={`${listTotal} USDC`} muted />
            <Line k={`Verified consumer discount · ${price.discountPct}%`} v={<span style={{ color: 'var(--dial-ok)' }}>− {savings} USDC</span>} />
            <Line k="Registration" v={`${totalUsdc} USDC`} />
          </>
        ) : (
          <Line k="Registration" v={`${totalUsdc} USDC`} />
        )}
        <Line k="Network fee (Pairpoint AA · sponsored)" v={`${networkFee} USDC`} muted />
        <div style={{ height: 1, background: 'var(--dial-border)', margin: '8px 0' }} />
        <Line k="Total" v={<span style={{ fontWeight: 700, fontSize: 15 }}>{totalUsdc + networkFee} USDC</span>} />
        {discounted && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--dial-ok)', textAlign: 'right' }}>
            You're saving {savings} USDC with the verified discount.
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ k, v, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 13,
      color: muted ? 'var(--dial-muted)' : 'var(--dial-text)' }}>
      <span>{k}</span>
      <span className="dial-mono">{v}</span>
    </div>
  );
}

function RegStepDone({ label, cantonParty }) {
  return (
    <div style={{ padding: '20px 4px 4px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ width: 64, height: 64, borderRadius: '999px', background: 'var(--dial-accent-bg)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <CheckIcon size={32} stroke="var(--dial-accent)" strokeWidth={2.2} />
        </div>
        <div className="dial-h2" style={{ fontSize: 24 }}>{label}.dial is yours.</div>
        <div className="dial-muted" style={{ fontSize: 13, marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
          On-chain copies are propagating to Canton. We'll send a receipt to your verified email.
        </div>
      </div>

      <div className="dial-card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="dial-field-label">DIAL name</div>
        <div className="dial-mono" style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{label}.dial</div>
        <div className="dial-field-label">Canton party id <span style={{ color: 'var(--dial-accent)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· issued by DIAL</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code className="dial-mono" style={{ fontSize: 11, padding: '8px 10px', borderRadius: 'var(--dial-radius-sm)',
            background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)',
            flex: 1, wordBreak: 'break-all' }}>{cantonParty || '(propagating…)'}</code>
          <button className="dial-btn sm" onClick={() => navigator.clipboard?.writeText(cantonParty)}
            disabled={!cantonParty} title="Copy">Copy</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Subname modal — UI-only in the PoC.
// ─────────────────────────────────────────────────────────────
function SubnameModal() {
  const { state, dispatch } = useDial();
  const m = state.modal;
  const [label, setLabel] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [canton, setCanton] = React.useState('');

  const norm = dialNormalise(label);
  const parent = state.names[state.org].find(n => n.name === m.parent);
  const fullName = norm.valid ? `${norm.label}.${m.parent}` : null;
  const conflict = parent && (parent.subnames || []).some(s => s.name === fullName);

  const close = () => dispatch({ type: 'modal', modal: null });
  const create = () => {
    if (!norm.valid || conflict) return;
    const records = {};
    if (canton) records['canton:omnibus'] = canton;
    dispatch({ type: 'add-subname-local',
      parent: m.parent,
      name: fullName,
      owner: owner || 'unassigned',
      records,
      created: new Date().toISOString().slice(0, 10) });
  };

  return (
    <DialModalFrame title={`New subname under ${m.parent}`} eyebrow="Subnames · UI-only" onClose={close}
      foot={
        <>
          <button className="dial-btn" onClick={close}>Cancel</button>
          <button className="dial-btn primary" onClick={create} disabled={!norm.valid || conflict}>
            <PlusIcon size={14} stroke="#fff" /> Create subname
          </button>
        </>
      }>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Subnames roll up to your verified <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{m.parent}</code> parent. The owner is whoever in your org controls it.
      </div>
      <div style={{ marginBottom: 14 }}>
        <span className="dial-demo-note">ⓘ Subname management is local-only in this PoC.</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="dial-field-label">Subname</div>
        <div className="dial-input-wrap">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="finance" autoFocus />
          <span className="suffix">.{m.parent}</span>
        </div>
        {label && !norm.valid && <div style={{ color: 'var(--dial-warn)', fontSize: 12, marginTop: 6 }}>{norm.reason}</div>}
        {conflict && <div style={{ color: 'var(--dial-warn)', fontSize: 12, marginTop: 6 }}>A subname with this label already exists.</div>}
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

      <ChainField mark="CN"  label="Canton party"  color="#5f6cff" caip="canton:omnibus"
        placeholder={fullName ? dialCantonParty(fullName) : '<hint>::1220<fingerprint>'}
        value={canton} onChange={setCanton} />
    </DialModalFrame>
  );
}

// ─────────────────────────────────────────────────────────────
// User registration — multi-step account setup.
//   Consumer:   Welcome → Identity (Pairpoint KYC) → Done
//   Enterprise: Welcome → Corporate register → Beneficial owners → Done
// ─────────────────────────────────────────────────────────────
function VerifyOnlyModal() {
  const { state, dispatch } = useDial();
  const id = state.identity[state.org];
  const isOrg = state.org === 'acme';
  // Consumer: simple Pairpoint verify (optional). Enterprise: full KYB.
  const steps = isOrg
    ? ['Welcome', 'Corporate register', 'Business profile', 'Beneficial owners', 'Done']
    : ['Welcome', 'Identity', 'Done'];
  const lastStep = steps.length - 1;

  const [step, setStep] = React.useState(0);
  const [verifying, setVerifying] = React.useState(false);
  const [error, setError] = React.useState(null);

  const close = () => dispatch({ type: 'modal', modal: null });
  const stepDone = (i) => i < step || (i === lastStep - 1 && id.verified);
  const next = () => setStep(s => Math.min(s + 1, lastStep));
  const back = () => setStep(s => Math.max(s - 1, 0));

  // Pairpoint verify runs at the end of the verification stage:
  // - Consumer: after the user clicks "Verify with Pairpoint" (step 1)
  // - Enterprise: after the user confirms UBOs (step 3 = last step before Done)
  const run = async () => {
    setError(null); setVerifying(true);
    try {
      await verifyIdentity(state, dispatch, state.org);
      setStep(lastStep);
    } catch (e) {
      setError(e.message);
    } finally {
      setVerifying(false);
    }
  };

  // Step-dependent footer.
  let foot;
  if (step === lastStep) {
    foot = <button className="dial-btn primary lg" onClick={close}>Done</button>;
  } else if (step === 0) {
    foot = <>
      <button className="dial-btn" onClick={close}>Cancel</button>
      <button className="dial-btn primary" onClick={next}>Continue <ArrowR2 size={14} stroke="#fff" /></button>
    </>;
  } else if (isOrg && (step === 1 || step === 2)) {
    // Corporate register + Business profile — passive review pages.
    foot = <>
      <button className="dial-btn" onClick={back}><ArrowL2 size={14} /> Back</button>
      <button className="dial-btn primary" onClick={next}>
        Continue <ArrowR2 size={14} stroke="#fff" />
      </button>
    </>;
  } else {
    // Final verification step (consumer Identity OR enterprise UBO) —
    // Back only; the step triggers run() internally.
    foot = <button className="dial-btn" onClick={back} disabled={verifying}><ArrowL2 size={14} /> Back</button>;
  }

  return (
    <DialModalFrame
      title={isOrg ? 'Verify your business · KYB' : 'Verify your DIAL account'}
      eyebrow={isOrg ? 'Know Your Business · FR §4.6 Tier-2' : 'Pairpoint identity verification · FR §4.6'}
      onClose={close} wide foot={foot}>
      <div className="dial-steps">
        {steps.map((lbl, i) => (
          <React.Fragment key={i}>
            <div className={`dial-step ${i === step ? 'active' : ''} ${stepDone(i) ? 'done' : ''}`}>
              <span className="num">{stepDone(i) ? <CheckIcon size={11} stroke="#fff" /> : i + 1}</span>
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

      {step === 0 && <UserStepWelcome />}
      {!isOrg && step === 1 && <RegStepIdentity verifying={verifying} runVerify={run} />}
      {isOrg && step === 1 && <EntStepCorporate />}
      {isOrg && step === 2 && <EntStepBusiness />}
      {isOrg && step === 3 && <EntStepBeneficials verifying={verifying} runVerify={run} />}
      {step === lastStep && <UserStepDone />}
    </DialModalFrame>
  );
}

// KYB step 2 — business profile. Industry, activity, scale, key documents.
// Mocked roster for the demo persona Acme Industries GmbH.
function EntStepBusiness() {
  const docs = [
    { label: 'Articles of incorporation',     state: 'on-file' },
    { label: 'Last annual filing (2025)',     state: 'on-file' },
    { label: 'Certificate of good standing',  state: 'verified' },
    { label: 'Trade register extract',        state: 'verified' },
  ];
  return (
    <div>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 16, marginBottom: 14, display: 'flex', gap: 12 }}>
        <div style={{ width: 38, height: 38, background: 'var(--dial-accent)', color: '#fff',
          borderRadius: 'var(--dial-radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BuildingIcon size={20} stroke="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Business profile</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            Pairpoint cross-references your activity, scale, and key documents against the corporate register. KYB documentation is held by Pairpoint — DIAL only receives the attestation.
          </div>
        </div>
      </div>

      <div className="dial-card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
          <div>
            <div className="dial-field-label">Industry</div>
            <div style={{ fontSize: 13 }}>Industrial · Manufacturing</div>
            <div className="dial-muted" style={{ fontSize: 11, marginTop: 2 }}>NACE 28.99 · Other special-purpose machinery</div>
          </div>
          <div>
            <div className="dial-field-label">Founded</div>
            <div style={{ fontSize: 13 }}>2012-09-04 · 13 years operating</div>
          </div>
          <div>
            <div className="dial-field-label">Headquarters</div>
            <div style={{ fontSize: 13 }}>Munich, DE</div>
          </div>
          <div>
            <div className="dial-field-label">Scale</div>
            <div style={{ fontSize: 13 }}>~150 employees · €25–50M turnover</div>
          </div>
        </div>
        <div className="dial-field-label">Activity description</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--dial-text-2)' }}>
          Designs, manufactures, and services industrial automation equipment for the European automotive supply chain. Treasury operations are EUR-denominated with a Canton-cleared settlement program.
        </div>
      </div>

      <div className="dial-field-label" style={{ marginTop: 12 }}>Documents &amp; filings</div>
      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {docs.map((d, i) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 'var(--dial-radius-sm)', background: 'var(--dial-bg-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📄</div>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{d.label}</div>
            <span className="dial-pill ok"><CheckIcon size={11} stroke="var(--dial-ok)" /> {d.state === 'on-file' ? 'On file' : 'Verified'}</span>
          </div>
        ))}
      </div>

      <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', marginTop: 12,
        display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <ShieldIcon size={14} stroke="var(--dial-muted)" style={{ marginTop: 1 }} />
        Source-of-funds &amp; adverse-media screening run automatically as part of Pairpoint Tier-2. Results feed the final attestation.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Note: the richer Pairpoint KYC components below (PairpointHeader,
// ConStepPersonal, ConStepDocument, QRMock, ConStepLiveness, FaceFrame)
// are no longer wired — the consumer flow uses the simpler RegStepIdentity
// step. Kept here for reference / future toggling.
// ─────────────────────────────────────────────────────────────

function PairpointHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 14,
      background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
      borderRadius: 'var(--dial-radius-sm)' }}>
      <div style={{ width: 28, height: 28, background: 'var(--dial-accent)', color: '#fff',
        borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ShieldIcon size={16} stroke="#fff" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12.5 }}>Powered by Vodafone Pairpoint Identity Hub</div>
        <div className="dial-muted" style={{ fontSize: 11 }}>End-to-end encrypted · documents never leave Pairpoint</div>
      </div>
      <span className="dial-pill" style={{ fontSize: 10 }}>eIDAS · AMLD</span>
    </div>
  );
}

function ConStepPersonal() {
  const { state } = useDial();
  const id = state.identity[state.org];
  // Mocked baseline from the demo persona.
  const data = state.org === 'bob'
    ? { full: 'Bob Schäfer',     dob: '1989-11-03', country: 'DE — Germany', email: 'bob.schaefer@vodafone.example', phone: '+49 170 ••••• 4231' }
    : { full: id.name,           dob: '1992-04-12', country: 'DE — Germany', email: 'alice.mueller@proton.me',        phone: '+49 152 ••••• 9088' };
  return (
    <div>
      <PairpointHeader />
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Pairpoint pre-fills your identity from your Vodafone account. Confirm the details below — these are matched against your ID document in the next step.
      </div>

      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {[
          ['Full name',          data.full],
          ['Date of birth',      data.dob],
          ['Country of residence', data.country],
          ['Email',              data.email],
          ['Phone',              data.phone],
        ].map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '12px 16px', borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            <span className="dial-muted" style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>{k}</span>
            <span style={{ fontSize: 13, fontFamily: k.includes('email') || k.includes('Phone') || k.includes('Date') ? 'var(--dial-font-mono)' : 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>
      <div className="dial-card tint" style={{ padding: 12, fontSize: 12, color: 'var(--dial-muted)', marginTop: 12 }}>
        ✓ Phone number matched to active Vodafone subscriber<br/>
        ✓ Email verified · primary address on file
      </div>
    </div>
  );
}

function ConStepDocument({ docType, setDocType, scanned, setScanned }) {
  const [scanning, setScanning] = React.useState(false);
  const startScan = () => {
    setScanning(true);
    setTimeout(() => { setScanning(false); setScanned(true); }, 1500);
  };
  const reset = () => { setDocType(null); setScanned(false); };

  if (!docType) {
    const docs = [
      { id: 'passport',  label: 'Passport',          sub: 'Most countries', glyph: '📘' },
      { id: 'id-card',   label: 'National ID card',  sub: 'EU / EEA',        glyph: '🪪' },
      { id: 'license',   label: "Driver's licence",  sub: 'Photocard',       glyph: '🚗' },
    ];
    return (
      <div>
        <PairpointHeader />
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Choose the government-issued document you'll use to verify your identity. Pairpoint reads it via OCR + chip if supported (eMRTD).
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {docs.map(d => (
            <button key={d.id} className="dial-card" onClick={() => setDocType(d.id)}
              style={{ padding: 16, textAlign: 'center', cursor: 'pointer', background: 'var(--dial-surface)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{d.glyph}</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{d.label}</div>
              <div className="dial-muted" style={{ fontSize: 11, marginTop: 2 }}>{d.sub}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!scanned) {
    return (
      <div>
        <PairpointHeader />
        <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Open the Pairpoint app on your phone and scan the QR code, then hold your {docType.replace('-', ' ')} steady in the frame.
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <QRMock />
          <div style={{ flex: 1 }}>
            <div className="dial-h3" style={{ marginBottom: 6 }}>Scan with Pairpoint</div>
            <div className="dial-muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
              The app reads the machine-readable zone (MRZ) and chip data, then transmits a one-time encrypted parcel back to this session. The document image never leaves Pairpoint.
            </div>
            <button className="dial-btn" onClick={reset} style={{ marginRight: 8 }}>Change document type</button>
            <button className="dial-btn primary" onClick={startScan} disabled={scanning}>
              {scanning ? <><SpinnerIcon size={14} stroke="#fff" /> Scanning…</> : <>Simulate scan complete</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mock OCR result.
  const docs = {
    'passport': { type: 'Passport',         num: 'C0••••2841',  expiry: '2031-08-15', mrz: true },
    'id-card':  { type: 'National ID card', num: 'IDDE••••5293', expiry: '2029-03-22', mrz: true },
    'license':  { type: "Driver's licence", num: 'B27••••4719',  expiry: '2034-11-04', mrz: false },
  };
  const d = docs[docType];
  return (
    <div>
      <PairpointHeader />
      <div className="dial-card" style={{ padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
        <CheckCircleIcon size={28} stroke="var(--dial-ok)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{d.type} verified</div>
          <div className="dial-muted" style={{ fontSize: 12 }}>Document authenticated · matched against personal info</div>
        </div>
        <button className="dial-btn sm" onClick={reset}>Rescan</button>
      </div>
      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {[
          ['Type',           d.type],
          ['Document number', d.num],
          ['Expiry',          d.expiry],
          ['MRZ / chip',      d.mrz ? <span className="dial-pill ok" style={{ fontSize: 10 }}>✓ Read OK</span> : <span className="dial-muted">N/A</span>],
          ['Tamper check',    <span className="dial-pill ok" style={{ fontSize: 10 }}>✓ Pass</span>],
        ].map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '10px 16px', borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            <span className="dial-muted" style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>{k}</span>
            <span style={{ fontSize: 13, fontFamily: typeof v === 'string' ? 'var(--dial-font-mono)' : 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QRMock() {
  // Simple 9x9 stylised QR — deterministic dot pattern + corner markers.
  const cells = [];
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const inFinder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
    const finderRing = inFinder && (x === 0 || x === 2 || y === 0 || y === 2 || (x > 5 && (x === 6 || x === 8)) || (y > 5 && (y === 6 || y === 8)));
    const finderCenter = (x === 1 && y === 1) || (x === 7 && y === 1) || (x === 1 && y === 7);
    const random = !inFinder && ((x * 7 + y * 13 + 5) % 3 === 0);
    const fill = finderRing || finderCenter || random;
    cells.push(<rect key={`${x},${y}`} x={x * 10} y={y * 10} width="10" height="10" fill={fill ? 'currentColor' : 'transparent'} />);
  }
  return (
    <div style={{ width: 132, height: 132, padding: 10, background: '#fff',
      border: 'var(--dial-border-w) solid var(--dial-border)', borderRadius: 'var(--dial-radius-sm)', color: '#000', flexShrink: 0 }}>
      <svg viewBox="0 0 90 90" width="112" height="112">{cells}</svg>
    </div>
  );
}

function ConStepLiveness({ livenessOk, setLivenessOk, verifying, runVerify }) {
  const [running, setRunning] = React.useState(false);
  const start = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); setLivenessOk(true); }, 1700);
  };
  return (
    <div>
      <PairpointHeader />
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Final step: a 3-second liveness selfie. Pairpoint matches your face to the document photo and confirms you're a live person — not a static image or video.
      </div>

      <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginBottom: 14 }}>
        <FaceFrame status={running ? 'running' : livenessOk ? 'ok' : 'idle'} />
        <div style={{ flex: 1 }}>
          {!livenessOk && !running && <>
            <div className="dial-h3" style={{ marginBottom: 6 }}>Start liveness check</div>
            <div className="dial-muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 12 }}>
              You'll be asked to turn your head left, right, and blink. Your face data is hashed locally — Pairpoint stores a biometric template, not the photo.
            </div>
          </>}
          {running && <>
            <div className="dial-h3" style={{ marginBottom: 6 }}>Performing liveness check…</div>
            <div className="dial-muted" style={{ fontSize: 12.5 }}>Turn your head slowly. Blink when prompted.</div>
          </>}
          {livenessOk && <>
            <div className="dial-h3" style={{ marginBottom: 6 }}>Liveness confirmed</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <span className="dial-pill ok" style={{ marginRight: 6 }}>✓ Match 99.4%</span>
              <span className="dial-pill ok" style={{ marginRight: 6 }}>✓ Liveness</span>
              <span className="dial-pill ok">✓ Single face</span>
            </div>
          </>}
        </div>
      </div>

      {!livenessOk
        ? <button className="dial-btn primary lg" onClick={start} disabled={running} style={{ width: '100%' }}>
            {running ? <><SpinnerIcon size={14} stroke="#fff" /> Capturing…</> : <>Start liveness check</>}
          </button>
        : <button className="dial-btn primary lg" onClick={runVerify} disabled={verifying} style={{ width: '100%' }}>
            {verifying
              ? <><SpinnerIcon size={14} stroke="#fff" /> Issuing Consumer · Verified attestation…</>
              : <>Issue attestation &amp; finish <ArrowR2 size={14} stroke="#fff" /></>}
          </button>}

      <div className="dial-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10 }}>
        By confirming you authorise Pairpoint to issue a Consumer · Verified attestation to DIAL. No PII or biometric data leaves Pairpoint.
      </div>
    </div>
  );
}

function FaceFrame({ status }) {
  // Stylised circular camera frame with a face glyph + state ring.
  const ringColor = status === 'ok' ? 'var(--dial-ok)' : status === 'running' ? 'var(--dial-accent)' : 'var(--dial-border)';
  const bg = status === 'ok' ? 'rgba(31,138,91,0.08)' : status === 'running' ? 'var(--dial-accent-bg)' : 'var(--dial-bg-soft)';
  return (
    <div style={{ width: 132, height: 132, borderRadius: '50%', background: bg,
      border: '3px solid ' + ringColor, position: 'relative', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'border-color 0.3s, background 0.3s' }}>
      <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="var(--dial-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="30" cy="22" r="8"/>
        <path d="M16 50c0-7 6-12 14-12s14 5 14 12"/>
      </svg>
      {status === 'running' && (
        <svg style={{ position: 'absolute', inset: -3 }} width="138" height="138" viewBox="0 0 138 138">
          <circle cx="69" cy="69" r="66" fill="none" stroke="var(--dial-accent)" strokeWidth="3"
            strokeLinecap="round" strokeDasharray="60 350">
            <animateTransform attributeName="transform" type="rotate" from="0 69 69" to="360 69 69" dur="0.9s" repeatCount="indefinite"/>
          </circle>
        </svg>
      )}
      {status === 'ok' && (
        <div style={{ position: 'absolute', bottom: 0, right: 0, transform: 'translate(20%, 20%)',
          width: 36, height: 36, borderRadius: '50%', background: 'var(--dial-ok)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '3px solid var(--dial-surface)' }}>
          <CheckIcon size={18} stroke="#fff" strokeWidth={2.4} />
        </div>
      )}
    </div>
  );
}

// Tier-2 corporate-register lookup. Mocked — pretends to query the
// Handelsregister with the entity's HRB number and surfaces the result.
function EntStepCorporate() {
  const { state } = useDial();
  const id = state.identity[state.org];
  return (
    <div>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 16, marginBottom: 14, display: 'flex', gap: 12 }}>
        <div style={{ width: 38, height: 38, background: 'var(--dial-accent)', color: '#fff',
          borderRadius: 'var(--dial-radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BuildingIcon size={20} stroke="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Corporate register lookup</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            Pairpoint queries the official corporate register in your country of incorporation. DIAL only sees the resulting attestation hash — register documents stay with Pairpoint.
          </div>
        </div>
      </div>

      <div className="dial-card" style={{ padding: 16, marginBottom: 12 }}>
        <div className="dial-field-label">Legal entity</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{id.name}</div>
        <div className="dial-muted" style={{ fontSize: 12, marginBottom: 14 }}>Registered in {id.country || 'DE'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div className="dial-field-label">Register</div>
            <code className="dial-mono" style={{ fontSize: 13 }}>{id.regId || 'HRB 218447'}</code>
            <div className="dial-muted" style={{ fontSize: 11, marginTop: 4 }}>Handelsregister, Amtsgericht München</div>
          </div>
          <div>
            <div className="dial-field-label">Status</div>
            <span className="dial-pill ok"><CheckCircleIcon size={11} /> Active</span>
          </div>
        </div>
      </div>

      <div className="dial-card tint" style={{ padding: 12, fontSize: 12.5, color: 'var(--dial-text-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <CheckIcon size={14} stroke="var(--dial-ok)" /> Entity found in <code className="dial-mono" style={{ background: 'transparent', border: 0, padding: 0 }}>Handelsregister · {id.country || 'DE'}</code>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <CheckIcon size={14} stroke="var(--dial-ok)" /> Authorized signatory recorded (Geschäftsführer)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <CheckIcon size={14} stroke="var(--dial-ok)" /> Last filing within the last 12 months
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <CheckIcon size={14} stroke="var(--dial-ok)" /> No insolvency / dissolution markers
        </div>
      </div>
    </div>
  );
}

// Tier-2 UBO declaration — every beneficial owner over 25% is identified
// and screened (PEP, sanctions). Mocked roster for the demo.
function EntStepBeneficials({ verifying, runVerify }) {
  const owners = [
    { name: 'Aiko Tanaka',         share: '45%', role: 'Founder & CEO',        country: 'JP' },
    { name: 'Maria Garcia',        share: '30%', role: 'Co-founder & CFO',     country: 'ES' },
    { name: 'Acme Holding GmbH',   share: '25%', role: 'Corporate shareholder', country: 'DE' },
  ];
  const initials = (n) => n.split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 16, marginBottom: 14, display: 'flex', gap: 12 }}>
        <div style={{ width: 38, height: 38, background: 'var(--dial-accent)', color: '#fff',
          borderRadius: 'var(--dial-radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ShieldIcon size={20} stroke="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Beneficial owners · UBO declaration</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            AMLD-compliant: every beneficial owner with ≥25% is identified by Pairpoint. PEP + sanctions screening is automatic — DIAL only sees the resulting hash.
          </div>
        </div>
      </div>

      <div className="dial-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        {owners.map((o, i) => (
          <div key={o.name} style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'center',
            borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            <div style={{ width: 36, height: 36, background: 'var(--dial-bg-soft)',
              border: 'var(--dial-border-w) solid var(--dial-border)',
              borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: 'var(--dial-text-2)', flexShrink: 0 }}>
              {initials(o.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
              <div className="dial-muted" style={{ fontSize: 11 }}>{o.role} · {o.country}</div>
            </div>
            <div style={{ fontFamily: 'var(--dial-font-mono)', fontSize: 13, fontWeight: 600, minWidth: 48, textAlign: 'right' }}>{o.share}</div>
            <span className="dial-pill ok"><CheckIcon size={11} stroke="var(--dial-ok)" /> PEP/sanctions clear</span>
          </div>
        ))}
      </div>

      <button className="dial-btn primary lg" style={{ width: '100%' }} onClick={runVerify} disabled={verifying}>
        {verifying
          ? <><SpinnerIcon size={14} stroke="#fff" /> Issuing Tier-2 attestation…</>
          : <>Confirm UBOs &amp; complete verification <ArrowR2 size={14} stroke="#fff" /></>}
      </button>
      <div className="dial-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10 }}>
        By confirming you authorise Pairpoint to issue a Tier-2 enterprise attestation to DIAL. No PII or filings leave Pairpoint.
      </div>
    </div>
  );
}

function UserStepWelcome() {
  const { state } = useDial();
  const persona = state.identity[state.org];
  const isOrg = state.org === 'acme';
  return (
    <div>
      <div className="dial-card tint" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Welcome to DIAL{persona.name ? ', ' + persona.name.split(' ')[0] : ''}.</div>
        <div className="dial-muted" style={{ fontSize: 13 }}>
          Before you can register a DIAL name, you need a verified account. We use Vodafone Pairpoint to confirm your identity once — DIAL never stores your PII, only a one-way attestation hash.
        </div>
      </div>

      <div className="dial-card" style={{ padding: 14, marginBottom: 14 }}>
        <div className="dial-field-label">What happens next</div>
        <ol style={{ margin: '8px 0 0', paddingLeft: 22, color: 'var(--dial-text-2)', fontSize: 13, lineHeight: 1.7 }}>
          <li>{isOrg ? 'Tier-2 corporate check — register, country, beneficial owners.' : 'Quick consumer KYC through the Pairpoint app.'}</li>
          <li>Pairpoint returns an attestation hash to DIAL. No PII leaves Pairpoint.</li>
          <li>Your account is ready — register names, issue Canton parties, settle in USDC.</li>
        </ol>
      </div>

      <div className="dial-muted" style={{ fontSize: 11, textAlign: 'center' }}>
        By continuing you agree to share an attestation hash with DIAL. No personal data leaves Pairpoint.
      </div>
    </div>
  );
}

function UserStepDone() {
  const { state } = useDial();
  const id = state.identity[state.org];
  return (
    <div style={{ padding: '20px 4px 4px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ width: 64, height: 64, borderRadius: '999px', background: 'var(--dial-accent-bg)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <CheckIcon size={32} stroke="var(--dial-accent)" strokeWidth={2.2} />
        </div>
        <div className="dial-h2" style={{ fontSize: 24 }}>Account ready.</div>
        <div className="dial-muted" style={{ fontSize: 13, marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
          You're now verified through Vodafone Pairpoint. You can register DIAL names and bind them to Canton parties.
        </div>
      </div>

      <div className="dial-card" style={{ padding: 14 }}>
        <div className="dial-field-label">Identity level</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{id.level}</div>
        <div className="dial-field-label">Attestation hash</div>
        <code className="dial-mono" style={{ fontSize: 12, padding: '8px 10px', display: 'block', borderRadius: 'var(--dial-radius-sm)',
          background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)' }}>
          {id.fullHash || id.hash}
        </code>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Release-name confirmation modal
// ─────────────────────────────────────────────────────────────
function ReleaseModal() {
  const { state, dispatch } = useDial();
  const m = state.modal;
  const [confirm, setConfirm] = React.useState('');
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState(null);
  const close = () => dispatch({ type: 'modal', modal: null });
  const canRelease = confirm.trim().toLowerCase() === m.name.toLowerCase();
  const run = async () => {
    setError(null); setWorking(true);
    try {
      await releaseName(state, dispatch, m.name);
    } catch (e) {
      setError(e.message);
      setWorking(false);
    }
  };
  return (
    <DialModalFrame title={`Release ${m.name}`} eyebrow="Danger zone" onClose={close}
      foot={
        <>
          <button className="dial-btn" onClick={close} disabled={working}>Cancel</button>
          <button className="dial-btn danger" onClick={run} disabled={!canRelease || working}>
            {working ? <><SpinnerIcon size={14} /> Releasing…</> : <>Release {m.name}</>}
          </button>
        </>
      }>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 14, marginBottom: 16, display: 'flex', gap: 12 }}>
        <ShieldIcon size={20} stroke="var(--dial-accent)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>This name will return to the available pool.</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            Records on Canton and the EVM mirror will be tombstoned. After the 30-day grace window the name can be claimed by anyone — including someone else.
          </div>
        </div>
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 14, fontSize: 12 }}>
        Error: {error}
      </div>}

      <div className="dial-field-label">Type <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{m.name}</code> to confirm</div>
      <div className="dial-input-wrap">
        <input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={m.name} autoFocus />
      </div>
    </DialModalFrame>
  );
}

// ─────────────────────────────────────────────────────────────
// Sign-in modal — pick which account to log in as (3 demo personas).
// ─────────────────────────────────────────────────────────────
// Demo username → persona mapping. Any non-empty password accepted.
const DEMO_USERS = { alice: 'personal', bob: 'bob', acme: 'acme' };

function LoginModal() {
  const { state, dispatch } = useDial();
  const [intent, setIntent] = React.useState(state.modal?.intent === 'register' ? 'register' : 'signin');
  const close = () => dispatch({ type: 'modal', modal: null });

  // Social login mock — Apple → Alice (personal), Google → Bob.
  // (In production these would go through Pairpoint federated identity.)
  const socialLogin = (provider, org) => {
    dispatch({ type: 'login', org });
    const persona = PERSONAS[org];
    dispatch({ type: 'toast', toast: { kind: 'ok', text: `Mock: signed in as ${persona.name.split(' ')[0]} via ${provider}.` } });
  };

  return (
    <div className="dial-drawer-backdrop" onClick={close}>
      <div className="dial-drawer" onClick={e => e.stopPropagation()}>
        <div className="dial-drawer-head">
          <div style={{ flex: 1 }}>
            <div className="dial-eyebrow" style={{ marginBottom: 2 }}>
              {intent === 'register' ? 'Sign up' : 'Sign in'}
            </div>
            <div className="dial-modal-title">
              {intent === 'register' ? 'Create your DIAL account' : 'Welcome back'}
            </div>
          </div>
          <button className="dial-iconbtn" onClick={close}><XIcon size={16} /></button>
        </div>

        <div className="dial-drawer-body">
          <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            {intent === 'register'
              ? 'Create a DIAL account to start registering names. You can verify your identity afterwards to unlock the 25% discount.'
              : 'Sign in to manage your DIAL names and check out your cart.'}
          </div>

          {/* Username/password (or registration) form first */}
          <LoginForm intent={intent} onSubmit={async (org, opts) => {
            if (opts && opts.fresh) await freshSignup(state, dispatch, org);
            else dispatch({ type: 'login', org });
          }} />

          <div className="dial-divider-text">or continue with</div>

          {/* Social login below the form */}
          <button type="button" className="dial-social-btn" onClick={() => socialLogin('Google', 'bob')}>
            <GoogleIcon size={18} />
            Continue with Google
          </button>
          <button type="button" className="dial-social-btn apple" onClick={() => socialLogin('Apple', 'personal')}>
            <AppleIcon size={18} />
            Continue with Apple
          </button>

          {/* In-drawer mode toggle */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: 'var(--dial-border-w) dashed var(--dial-border)',
            textAlign: 'center', fontSize: 12.5, color: 'var(--dial-muted)' }}>
            {intent === 'register' ? (
              <>Already have an account? <a onClick={() => setIntent('signin')}
                style={{ color: 'var(--dial-accent)', cursor: 'pointer', fontWeight: 600 }}>Sign in</a></>
            ) : (
              <>New to DIAL? <a onClick={() => setIntent('register')}
                style={{ color: 'var(--dial-accent)', cursor: 'pointer', fontWeight: 600 }}>Create an account</a></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Google + Apple icons used by the social login buttons.
function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}
function AppleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.04 12.13c-.02-2.13 1.74-3.16 1.82-3.21-.99-1.45-2.54-1.65-3.09-1.67-1.31-.13-2.57.77-3.24.77-.68 0-1.71-.76-2.82-.73-1.45.02-2.79.84-3.54 2.14-1.51 2.62-.39 6.5 1.08 8.62.72 1.04 1.58 2.21 2.7 2.16 1.08-.04 1.49-.7 2.8-.7s1.68.7 2.82.68c1.17-.02 1.9-1.05 2.61-2.1.82-1.2 1.16-2.37 1.18-2.43-.03-.01-2.26-.87-2.28-3.43zM14.86 5.6c.59-.71.99-1.7.88-2.69-.85.03-1.88.57-2.49 1.28-.55.63-1.03 1.64-.9 2.61.95.07 1.92-.48 2.51-1.2z"/>
    </svg>
  );
}

function LoginForm({ intent, onSubmit }) {
  return intent === 'register'
    ? <RegisterForm onSubmit={onSubmit} />
    : <SigninForm   onSubmit={onSubmit} />;
}

function SigninForm({ onSubmit }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPw, setShowPw]     = React.useState(false);
  const [error, setError]       = React.useState(null);

  const submit = (e) => {
    e && e.preventDefault && e.preventDefault();
    const u = username.trim().toLowerCase();
    const org = DEMO_USERS[u];
    if (!org)      { setError(`Unknown user. Try ${Object.keys(DEMO_USERS).join(', ')}.`); return; }
    if (!password) { setError('Password required.'); return; }
    setError(null);
    onSubmit(org);
  };

  return (
    <form onSubmit={submit} autoComplete="off">
      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 12, fontSize: 12 }}>
        {error}
      </div>}

      {/* Honeypot inputs to absorb browser autofill heuristics. */}
      <input type="text" name="fakeusernameremembered" autoComplete="username" tabIndex={-1}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />
      <input type="password" name="fakepasswordremembered" autoComplete="current-password" tabIndex={-1}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />

      <div style={{ marginBottom: 12 }}>
        <div className="dial-field-label">Username</div>
        <div className="dial-input-wrap">
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="alice, bob, or acme" autoFocus
            name="dial-signin-user" autoComplete="off"
            data-form-type="other" data-lpignore="true" data-1p-ignore />
        </div>
      </div>

      <div style={{ marginBottom: 6 }}>
        <div className="dial-field-label">Password</div>
        <div className="dial-input-wrap">
          <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            name="dial-signin-secret" autoComplete="new-password"
            data-form-type="other" data-lpignore="true" data-1p-ignore />
          <button type="button" className="dial-btn ghost sm" onClick={() => setShowPw(v => !v)}
            style={{ padding: '4px 8px', fontSize: 11 }}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className="dial-muted" style={{ fontSize: 11, marginTop: 8, marginBottom: 12 }}>
        Demo: any password works for the three personas.
      </div>

      <button type="submit" className="dial-btn primary lg" style={{ width: '100%' }}>
        Sign in <ArrowR2 size={14} stroke="#fff" />
      </button>
    </form>
  );
}

function RegisterForm({ onSubmit }) {
  const [name, setName]         = React.useState('');
  const [email, setEmail]       = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm]   = React.useState('');
  const [showPw, setShowPw]     = React.useState(false);
  const [terms, setTerms]       = React.useState(false);
  const [error, setError]       = React.useState(null);

  const submit = (e) => {
    e && e.preventDefault && e.preventDefault();
    if (!name.trim())              { setError('Please enter your full name.');         return; }
    if (!/.+@.+\..+/.test(email))  { setError('Please enter a valid email address.'); return; }
    if (password.length < 6)       { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)      { setError('Passwords do not match.');             return; }
    if (!terms)                    { setError('You must agree to the terms.');        return; }
    setError(null);
    // Demo: registration signs you in as the fresh "Bob" persona AND wipes
    // any leftover backend names/domains so the dashboard starts clean.
    onSubmit('bob', { fresh: true });
  };

  return (
    <form onSubmit={submit} autoComplete="off">
      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 12, fontSize: 12 }}>
        {error}
      </div>}

      <input type="text" name="fakeusernameremembered" autoComplete="username" tabIndex={-1}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />
      <input type="password" name="fakepasswordremembered" autoComplete="current-password" tabIndex={-1}
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />

      <div style={{ marginBottom: 12 }}>
        <div className="dial-field-label">Full name</div>
        <div className="dial-input-wrap">
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Bob Schäfer" autoFocus
            name="dial-reg-name" autoComplete="off"
            data-form-type="other" data-lpignore="true" data-1p-ignore />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="dial-field-label">Email</div>
        <div className="dial-input-wrap">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            name="dial-reg-email" autoComplete="off"
            data-form-type="other" data-lpignore="true" data-1p-ignore />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="dial-field-label">Password</div>
        <div className="dial-input-wrap">
          <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            name="dial-reg-secret" autoComplete="new-password"
            data-form-type="other" data-lpignore="true" data-1p-ignore />
          <button type="button" className="dial-btn ghost sm" onClick={() => setShowPw(v => !v)}
            style={{ padding: '4px 8px', fontSize: 11 }}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="dial-field-label">Confirm password</div>
        <div className="dial-input-wrap">
          <input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            name="dial-reg-secret-confirm" autoComplete="new-password"
            data-form-type="other" data-lpignore="true" data-1p-ignore />
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, marginTop: 6, marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
          style={{ marginTop: 2, accentColor: 'var(--dial-accent)' }} />
        <span style={{ color: 'var(--dial-text-2)', lineHeight: 1.5 }}>
          I agree to DIAL's <a style={{ color: 'var(--dial-accent)', cursor: 'pointer' }}>Terms of Service</a> and <a style={{ color: 'var(--dial-accent)', cursor: 'pointer' }}>Privacy Policy</a>.
        </span>
      </label>

      <button type="submit" className="dial-btn primary lg" style={{ width: '100%' }}>
        Create account <ArrowR2 size={14} stroke="#fff" />
      </button>

      <div className="dial-muted" style={{ fontSize: 11, marginTop: 10, textAlign: 'center' }}>
        Demo: this creates a Bob-style account — verify identity from the dashboard to unlock the {VERIFIED_DISCOUNT_PCT}% discount.
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Checkout — GoDaddy-style multi-step purchase flow for the cart.
//   Review → Account (login if needed) → Verify (optional) → Pay → Done
// ─────────────────────────────────────────────────────────────
function CheckoutFlow() {
  const { state, dispatch } = useDial();
  const items = state.cart;

  // 4-step checkout: Review → Account → Pay → Done. Identity verification is
  // intentionally NOT part of checkout — it's a separate flow surfaced via
  // the dashboard "Verify account" CTA / Create account button. If the user
  // isn't verified when paying, they're charged the list price (no discount).
  const id = state.identity[state.org];
  const stepsLabel = ['Review', 'Account', 'Pay', 'Done'];

  const [step, setStep] = React.useState(0);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [registered, setRegistered] = React.useState([]); // [{ name, canton_party }]

  const verified = state.loggedIn && id.verified;
  // Discounted vs list pricing for the entire cart.
  const subtotal = items.reduce((a, c) => a + dialPrice(c.name.replace(/\.dial$/, '')).usdc * c.duration_years, 0);
  const total = items.reduce((a, c) =>
    a + dialPrice(c.name.replace(/\.dial$/, ''), { verified }).usdc * c.duration_years, 0);
  const discount = subtotal - total;
  const networkFee = 2;
  const grandTotal = total + networkFee;

  const close = () => dispatch({ type: 'modal', modal: null });
  const stepDone = (i) => i < step;
  const next = () => setStep(s => Math.min(s + 1, stepsLabel.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const onSignIn = (org) => dispatch({ type: 'login', org, keepRoute: true, keepModal: true });

  const runPay = async () => {
    setError(null); setWorking(true);
    try {
      const out = [];
      for (const item of items) {
        const label = item.name.replace(/\.dial$/, '');
        // Unverified users register with skipVerify so we don't force a
        // KYC walk mid-checkout — they pay the list price (no discount).
        const cantonParty = await registerName(state, dispatch, label, item.duration_years, { skipVerify: !id.verified });
        out.push({ name: item.name, canton_party: cantonParty });
      }
      setRegistered(out);
      dispatch({ type: 'cart-clear' });
      setStep(3); // → Done
    } catch (e) { setError(e.message); }
    finally { setWorking(false); }
  };

  // Footer is step-dependent.
  let foot;
  if (step === 3) {
    foot = <button className="dial-btn primary lg" onClick={() => {
      close();
      dispatch({ type: 'route', route: { screen: 'dashboard' } });
    }}>View my names</button>;
  } else if (step === 2) {
    foot = <>
      <button className="dial-btn" onClick={back} disabled={working}><ArrowL2 size={14} /> Back</button>
      <button className="dial-btn primary lg" onClick={runPay} disabled={working || items.length === 0}>
        {working ? <><SpinnerIcon size={14} stroke="#fff" /> Submitting via Pairpoint AA…</> : <><DollarIcon size={14} stroke="#fff" /> Pay {grandTotal} USDC</>}
      </button>
    </>;
  } else if (step === 1) {
    foot = <>
      <button className="dial-btn" onClick={back}><ArrowL2 size={14} /> Back</button>
      <button className="dial-btn primary" onClick={next} disabled={!state.loggedIn}>
        Continue <ArrowR2 size={14} stroke="#fff" />
      </button>
    </>;
  } else {
    foot = <>
      <button className="dial-btn" onClick={close}>Cancel</button>
      <button className="dial-btn primary" onClick={next} disabled={items.length === 0}>
        Continue <ArrowR2 size={14} stroke="#fff" />
      </button>
    </>;
  }

  return (
    <DialModalFrame title="Checkout" eyebrow={`Cart · ${items.length} item${items.length === 1 ? '' : 's'}`} onClose={close} wide foot={foot}>
      <div className="dial-steps">
        {stepsLabel.map((lbl, i) => (
          <React.Fragment key={i}>
            <div className={`dial-step ${i === step ? 'active' : ''} ${stepDone(i) ? 'done' : ''}`}>
              <span className="num">{stepDone(i) ? <CheckIcon size={11} stroke="#fff" /> : i + 1}</span>
              {lbl}
            </div>
            {i < stepsLabel.length - 1 && <div className="bar" />}
          </React.Fragment>
        ))}
      </div>

      {error && <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)', color: 'var(--dial-accent)',
        padding: '8px 12px', borderRadius: 'var(--dial-radius-sm)', marginBottom: 14, fontSize: 12 }}>
        Error: {error}
      </div>}

      {step === 0 && <CheckoutReview items={items} verified={verified} subtotal={subtotal} total={total} discount={discount} skipVerify={false} />}
      {step === 1 && <CheckoutAccount onSignIn={onSignIn} />}
      {step === 2 && <CheckoutPay items={items} verified={verified} subtotal={subtotal} total={total} discount={discount} networkFee={networkFee} grandTotal={grandTotal} />}
      {step === 3 && <CheckoutDone registered={registered} />}
    </DialModalFrame>
  );
}

function CheckoutReview({ items, verified, subtotal, total, discount, skipVerify }) {
  return (
    <div>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Review your basket before paying. You can change durations or remove items in the cart.
      </div>
      <div className="dial-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        {items.map((item, i) => {
          const label = item.name.replace(/\.dial$/, '');
          const list = dialPrice(label);
          const eligibleDiscount = verified && !skipVerify;
          const final = dialPrice(label, { verified: eligibleDiscount });
          return (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14,
              borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--dial-radius-sm)', background: 'var(--dial-accent-bg)',
                color: 'var(--dial-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--dial-font-mono)', fontWeight: 700 }}>
                {item.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="dial-mono" style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                <div className="dial-muted" style={{ fontSize: 11.5 }}>{list.tier} · {item.duration_years} year{item.duration_years > 1 ? 's' : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {eligibleDiscount && <div className="dial-muted" style={{ fontSize: 11, textDecoration: 'line-through' }}>{list.usdc * item.duration_years} USDC</div>}
                <div className="dial-mono" style={{ fontSize: 13, fontWeight: 600, color: eligibleDiscount ? 'var(--dial-ok)' : 'inherit' }}>
                  {final.usdc * item.duration_years} USDC
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="dial-card" style={{ padding: 16, background: 'var(--dial-surface-2)' }}>
        <Line k="Subtotal" v={`${subtotal} USDC`} muted />
        {discount > 0 && <Line k={`Verified discount · ${VERIFIED_DISCOUNT_PCT}%`} v={<span style={{ color: 'var(--dial-ok)' }}>− {discount} USDC</span>} />}
        <div style={{ height: 1, background: 'var(--dial-border)', margin: '8px 0' }} />
        <Line k="Total before fees" v={<span style={{ fontWeight: 700 }}>{total} USDC</span>} />
      </div>
    </div>
  );
}

function CheckoutAccount({ onSignIn }) {
  const { state, dispatch } = useDial();
  // Step 2 is sign-in only. Creating an account is its own flow surfaced
  // from the top-bar "Create account" button outside checkout.

  if (state.loggedIn) {
    const id = state.identity[state.org];
    const persona = PERSONAS[state.org] || {};
    return (
      <div>
        <div className="dial-card" style={{ padding: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="dial-avatar" style={{ width: 44, height: 44, fontSize: 14 }}>{id.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{id.name}</div>
            <div className="dial-muted" style={{ fontSize: 12, marginTop: 2 }}>
              {id.verified
                ? <>Verified · <code className="dial-mono" style={{ color: 'var(--dial-text)' }}>{id.hash}</code></>
                : 'Not verified · paying list price'}
            </div>
          </div>
          {id.verified
            ? <span className="dial-pill ok"><CheckCircleIcon size={11} /> {persona.fallbackLevel || 'Verified'}</span>
            : <span className="dial-pill warn">Not verified</span>}
        </div>

        <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
          {[
            ['Email',           persona.email],
            ['Phone',           persona.phone],
            ['Billing address', persona.address ? <>{persona.address.line1}<br/>{persona.address.city}, {persona.address.country}</> : '—'],
            ['Account type',    persona.kind === 'enterprise' ? 'Enterprise account' : 'Personal account'],
            persona.regId ? ['Corporate register', <code className="dial-mono" style={{ background: 'transparent', border: 0, padding: 0 }}>{persona.regId} · {persona.country}</code>] : null,
          ].filter(Boolean).map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14,
              padding: '12px 16px',
              borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
              <span className="dial-muted" style={{ fontSize: 11.5, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600, paddingTop: 1 }}>{k}</span>
              <span style={{ fontSize: 13, textAlign: 'right', lineHeight: 1.5 }}>{v || <span className="dial-muted">—</span>}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
          <span className="dial-muted" style={{ fontSize: 12 }}>
            {id.verified
              ? <>{VERIFIED_DISCOUNT_PCT}% verified discount applies on the next step.</>
              : <>Verify your account separately to unlock the {VERIFIED_DISCOUNT_PCT}% discount.</>}
          </span>
          <button className="dial-btn ghost sm" onClick={() => dispatch({ type: 'logout' })}>
            Use a different account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <LoginForm intent="signin" onSubmit={(org) => onSignIn(org)} />
      <div className="dial-divider-text">or continue with</div>
      <button type="button" className="dial-social-btn" onClick={() => onSignIn('bob')}>
        <GoogleIcon size={18} />
        Continue with Google
      </button>
      <button type="button" className="dial-social-btn apple" onClick={() => onSignIn('personal')}>
        <AppleIcon size={18} />
        Continue with Apple
      </button>
    </div>
  );
}

function CheckoutVerify({ verified, working, runVerify, subtotal }) {
  if (verified) {
    return (
      <div>
        <div className="dial-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <CheckCircleIcon size={22} stroke="var(--dial-ok)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Identity already verified</div>
            <div className="dial-muted" style={{ fontSize: 12 }}>
              {VERIFIED_DISCOUNT_PCT}% discount applies automatically. Continue to payment.
            </div>
          </div>
          <span className="dial-pill ok">Discount on</span>
        </div>
      </div>
    );
  }
  const savings = Math.round(subtotal * VERIFIED_DISCOUNT_PCT / 100);
  return (
    <div>
      <div style={{ background: 'var(--dial-accent-bg)', border: 'var(--dial-border-w) solid var(--dial-accent)',
        borderRadius: 'var(--dial-radius)', padding: 14, marginBottom: 14, display: 'flex', gap: 12 }}>
        <ShieldIcon size={22} stroke="var(--dial-accent)" style={{ marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Save {savings} USDC by verifying</div>
          <div className="dial-muted" style={{ fontSize: 12.5 }}>
            Verified consumers get {VERIFIED_DISCOUNT_PCT}% off every .dial registration. One-time Pairpoint check — DIAL only stores an attestation hash.
          </div>
        </div>
      </div>
      <button className="dial-btn primary lg" style={{ width: '100%' }} onClick={runVerify} disabled={working}>
        {working ? <><SpinnerIcon size={14} stroke="#fff" /> Verifying via Pairpoint…</> : <>Verify with Pairpoint &amp; save {savings} USDC</>}
      </button>
      <div className="dial-muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10 }}>
        Prefer to skip? You can verify later from your dashboard. The discount won't apply to this order.
      </div>
    </div>
  );
}

function CheckoutPay({ items, verified, subtotal, total, discount, networkFee, grandTotal }) {
  return (
    <div>
      <div className="dial-muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Final settlement. Pairpoint sponsors the network fee — only USDC leaves your wallet.
      </div>
      <div className="dial-card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="dial-field-label">Order ({items.length} item{items.length === 1 ? '' : 's'})</div>
        {items.map(item => (
          <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
            <code className="dial-mono">{item.name}</code>
            <span className="dial-muted">{item.duration_years}y</span>
          </div>
        ))}
      </div>
      <div className="dial-card" style={{ padding: 16, background: 'var(--dial-surface-2)' }}>
        <div className="dial-field-label">Settlement</div>
        {verified ? <>
          <Line k="Subtotal · list" v={`${subtotal} USDC`} muted />
          <Line k={`Verified discount · ${VERIFIED_DISCOUNT_PCT}%`} v={<span style={{ color: 'var(--dial-ok)' }}>− {discount} USDC</span>} />
          <Line k="Registrations" v={`${total} USDC`} />
        </> : (
          <Line k="Registrations" v={`${total} USDC`} />
        )}
        <Line k="Network fee (Pairpoint AA · sponsored)" v={`${networkFee} USDC`} muted />
        <div style={{ height: 1, background: 'var(--dial-border)', margin: '8px 0' }} />
        <Line k="Total" v={<span style={{ fontWeight: 700, fontSize: 15 }}>{grandTotal} USDC</span>} />
      </div>
    </div>
  );
}

function CheckoutDone({ registered }) {
  return (
    <div style={{ padding: '14px 4px 4px' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{ width: 64, height: 64, borderRadius: '999px', background: 'var(--dial-accent-bg)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <CheckIcon size={32} stroke="var(--dial-accent)" strokeWidth={2.2} />
        </div>
        <div className="dial-h2" style={{ fontSize: 24 }}>{registered.length} name{registered.length === 1 ? '' : 's'} registered.</div>
        <div className="dial-muted" style={{ fontSize: 13, marginTop: 6 }}>
          DIAL has bound a Canton party for each name under the DIAL namespace.
        </div>
      </div>

      <div className="dial-card" style={{ padding: 0, overflow: 'hidden' }}>
        {registered.map((r, i) => (
          <div key={r.name} style={{ padding: 12,
            borderTop: i === 0 ? 0 : 'var(--dial-border-w) solid var(--dial-border)' }}>
            <div className="dial-mono" style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
            <code className="dial-mono" style={{ fontSize: 10.5, padding: '4px 8px', display: 'inline-block', borderRadius: 'var(--dial-radius-sm)',
              background: 'var(--dial-bg-soft)', border: 'var(--dial-border-w) solid var(--dial-border)', wordBreak: 'break-all' }}>
              {r.canton_party}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

function DialModals() {
  const { state } = useDial();
  if (!state.modal) return null;
  if (state.modal.kind === 'login')           return <LoginModal />;
  if (state.modal.kind === 'register')        return <RegisterFlow />;
  if (state.modal.kind === 'subname')         return <SubnameModal />;
  if (state.modal.kind === 'verify-only')     return <VerifyOnlyModal />;
  if (state.modal.kind === 'release')         return <ReleaseModal />;
  if (state.modal.kind === 'register-domain') return <RegisterDomainFlow />;
  if (state.modal.kind === 'issue-name')      return <IssueNameModal />;
  if (state.modal.kind === 'release-domain')  return <ReleaseDomainModal />;
  if (state.modal.kind === 'checkout')        return <CheckoutFlow />;
  return null;
}

// Re-exposed for the domain-modals + screens files (Babel per-script scope).
window.DialModals      = DialModals;
window.DialModalFrame  = DialModalFrame;
window.RegStepIdentity = RegStepIdentity;
window.ChainField      = ChainField;
window.Line            = Line;
window.LoginForm       = LoginForm;
window.GoogleIcon      = GoogleIcon;
window.AppleIcon       = AppleIcon;
