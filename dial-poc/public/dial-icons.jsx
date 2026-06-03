// Small icon set used across DIAL screens. All 1.6 stroke-width outlines so
// they harmonise with mono + cream + dark themes without per-theme variants.

function makeIcon(d, opts = {}) {
  return ({ size = 16, stroke = 'currentColor', strokeWidth = 1.6, fill = 'none', style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d}
    </svg>
  );
}

const DialIcons = {
  Search:   makeIcon(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>),
  ArrowR:   makeIcon(<><path d="M5 12h14M13 5l7 7-7 7"/></>),
  ArrowL:   makeIcon(<><path d="M19 12H5M11 19l-7-7 7-7"/></>),
  ArrowDR:  makeIcon(<><path d="M7 7h10v10M7 17 17 7"/></>),
  Check:    makeIcon(<><path d="m4 12 5 5L20 6"/></>),
  CheckCircle: makeIcon(<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>),
  X:        makeIcon(<><path d="M6 6l12 12M18 6 6 18"/></>),
  Plus:     makeIcon(<><path d="M12 5v14M5 12h14"/></>),
  Minus:    makeIcon(<><path d="M5 12h14"/></>),
  Edit:     makeIcon(<><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m13 6 4 4"/></>),
  Trash:    makeIcon(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>),
  Copy:     makeIcon(<><rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></>),
  External: makeIcon(<><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>),
  Shield:   makeIcon(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></>),
  User:     makeIcon(<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></>),
  Building: makeIcon(<><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></>),
  Wallet:   makeIcon(<><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M17 14h.01"/></>),
  Globe:    makeIcon(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>),
  Link:     makeIcon(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L13 17"/></>),
  Chain:    makeIcon(<><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M8 6h8M6 8v8M8 18h8M18 8v8"/></>),
  Hash:     makeIcon(<><path d="M4 9h16M4 15h16M10 4 8 20M16 4l-2 16"/></>),
  Dot:      makeIcon(<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>),
  Chevron:  makeIcon(<><path d="m9 6 6 6-6 6"/></>),
  ChevronDown: makeIcon(<><path d="m6 9 6 6 6-6"/></>),
  Menu:     makeIcon(<><path d="M4 7h16M4 12h16M4 17h16"/></>),
  Bell:     makeIcon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"/><path d="M10 21a2 2 0 0 0 4 0"/></>),
  Wand:     makeIcon(<><path d="M5 19 19 5M14 5l5 5M4 10h2M9 4v2M4 16h2"/></>),
  Refresh:  makeIcon(<><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>),
  Code:     makeIcon(<><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/></>),
  Logo:     makeIcon(<><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></>, { stroke: '#e60000' }),
  Calendar: makeIcon(<><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/></>),
  Dollar:   makeIcon(<><path d="M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7"/></>),
  Cart:     makeIcon(<><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6"/></>),
  Trash2:   makeIcon(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>),
  Spinner:  ({ size = 16, stroke = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 1-9 9" opacity="0.9">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
      </path>
    </svg>
  ),
};

window.DialIcons = DialIcons;
