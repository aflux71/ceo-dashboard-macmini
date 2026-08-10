// Does a filtered endpoint actually APPLY its filter?
//
// Standing acceptance rule, written after the third silent-ignore in this
// codebase (see ACCEPTANCE.md § "Silent-ignore rule"). An upstream API can
// accept a filter parameter, return 200, and quietly discard it. Verifying that
// a parameter is ACCEPTED proves nothing. Two assertions prove it is APPLIED:
//
//   1. DIFFERENTIAL WINDOW — two different windows, queried the same day, must
//      return DIFFERENT results. Identical results mean the window is inert.
//   2. ABSURD WINDOW — a range that cannot contain data (2019, years before the
//      business had any) must return ZERO. A non-zero answer means the range is
//      being ignored and you are looking at everything.
//
// The absurd-window test is the one that caught the loyalty bug on 2026-08-09;
// the differential test would have caught it too. Both are one-liners. Neither
// requires knowing the correct answer in advance — which is the point, because
// the broken numbers looked entirely plausible for eight months.
//
// Usage:  node server/tools/assert_window_honoured.mjs [baseUrl]
// Default baseUrl is the live service. Exit code 1 on any failure, so this can
// gate a deploy.

const BASE = process.argv[2] || 'http://127.0.0.1:3001';

// Windows chosen so the assertions hold for any store that trades at all.
const NARROW = { from: '2026-08-08', to: '2026-08-08' };   // one day
const WIDE   = { from: '2026-07-10', to: '2026-08-08' };   // thirty days
const ABSURD = { from: '2019-01-01', to: '2019-01-02' };   // predates the business

// Add an entry per filtered endpoint. `measure` must return a NUMBER that is
// expected to grow with the window — a count or a sum, never a rate (a rate can
// legitimately be equal across two windows by coincidence).
const ENDPOINTS = [
  {
    name: '/api/stats/loyalty-signups',
    url: (w) => `${BASE}/api/stats/loyalty-signups?date_from=${w.from}&date_to=${w.to}`,
    measure: (j) => j.retail_total.signups,
    unit: 'retail signups'
  }
];

async function measure(ep, w) {
  const res = await fetch(ep.url(w));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${w.from}..${w.to}`);
  return ep.measure(await res.json());
}

let failures = 0;
const mark = (ok) => (ok ? 'PASS' : 'FAIL');

for (const ep of ENDPOINTS) {
  console.log(`\n${ep.name}   (${ep.unit})`);

  const narrow = await measure(ep, NARROW);
  const wide = await measure(ep, WIDE);
  const differs = narrow !== wide;
  if (!differs) failures++;
  console.log(`  1. differential window  ${NARROW.from}..${NARROW.to} = ${narrow}`);
  console.log(`                          ${WIDE.from}..${WIDE.to} = ${wide}`);
  console.log(`     must DIFFER          ${mark(differs)}${differs ? '' : '   <- window is inert; the filter is being ignored'}`);

  const absurd = await measure(ep, ABSURD);
  const zero = absurd === 0;
  if (!zero) failures++;
  console.log(`  2. absurd window        ${ABSURD.from}..${ABSURD.to} = ${absurd}`);
  console.log(`     must be ZERO         ${mark(zero)}${zero ? '' : '   <- returning data from before the business existed'}`);
}

console.log(`\n${failures === 0 ? 'ALL ASSERTIONS PASS' : failures + ' ASSERTION(S) FAILED'}`);
process.exit(failures ? 1 : 0);
