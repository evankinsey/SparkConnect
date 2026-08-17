// ─── ATTACH THE REAL PRODUCTS TO THE OFFERING'S PACKAGES ─────────────────────
// Runs in GitHub Actions (the sandbox that wrote it cannot reach RevenueCat's
// API; the runner can). Fixes the misconfiguration that has broken every
// subscription purchase since build 32:
//
//   The "default" offering was created 2026-06-06, two days before the real
//   App Store app existed in the RevenueCat project. Its packages were built
//   against Test Store products and nobody came back — so a real iPhone asks
//   for the current offering, finds no product it can buy through the App
//   Store, and the paywall dies with "This plan is not available".
//
// This script attaches the App Store products to the packages and NOTHING
// ELSE. It does not detach anything (packages carry one product per platform;
// the Test Store rows are harmless), it does not touch entitlements (already
// verified correct by hand), and it re-lists everything afterwards so the log
// is its own proof.
//
// Requires: RC_API_KEY — a RevenueCat v2 secret key. Read & write on project
// configuration. Passed as a secret; never printed.

const BASE = 'https://api.revenuecat.com/v2';
const KEY = process.env.RC_API_KEY;

// What the app sells, by App Store identifier → the package that offers it.
const WANTED = {
  sparkconnect_pro_yearly: '$rc_annual',
  sparkconnect_pro_monthly: '$rc_monthly',
  sparkconnect_lifetime_tools: '$rc_lifetime',
};

if (!KEY) {
  console.error('RC_API_KEY is not set. Add it as a GitHub Actions secret.');
  process.exit(1);
}

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* error bodies are still useful as text */ }
  if (!res.ok) {
    // 403 has one overwhelmingly likely meaning here, so say it.
    const hint = res.status === 403
      ? '\n  → The key lacks permission. Mint a new secret API key with '
        + '"Project configuration" Read & Write and update the RC_API_KEY secret.'
      : '';
    throw new Error(`${method} ${path} → ${res.status}\n${text}${hint}`);
  }
  return json;
};

const items = async (path) => {
  // v2 list endpoints paginate; every list here fits in one page of 100, but
  // follow next_page anyway so a 101st product cannot silently vanish.
  let out = [];
  let url = `${path}${path.includes('?') ? '&' : '?'}limit=100`;
  while (url) {
    const page = await api('GET', url);
    out = out.concat(page.items ?? []);
    url = page.next_page ? page.next_page.replace(/^\/v2/, '') : null;
  }
  return out;
};

const main = async () => {
  // 1. The project. There is one; verify rather than assume.
  const projects = await items('/projects');
  if (projects.length !== 1) {
    console.log('Projects:', projects.map((p) => `${p.id} (${p.name})`).join(', '));
  }
  const project = projects.find((p) => /spark/i.test(p.name)) ?? projects[0];
  if (!project) throw new Error('No RevenueCat project visible to this key.');
  const P = `/projects/${project.id}`;
  console.log(`project   ${project.id} (${project.name})`);

  // 2. The App Store app — the one whose products a real iPhone can buy.
  const apps = await items(`${P}/apps`);
  for (const a of apps) console.log(`app       ${a.id} type=${a.type} (${a.name})`);
  const appStore = apps.find((a) => a.type === 'app_store');
  if (!appStore) throw new Error('No App Store app in this project.');

  // 3. Its products, by store identifier.
  const products = await items(`${P}/products?app_id=${appStore.id}`);
  console.log(`products  ${products.length} on the App Store app:`);
  for (const p of products) console.log(`          ${p.store_identifier} → ${p.id}`);
  const productFor = (storeId) => products.find((p) => p.store_identifier === storeId) ?? null;

  // 4. The current offering and its packages.
  const offerings = await items(`${P}/offerings`);
  const offering = offerings.find((o) => o.is_current) ?? offerings.find((o) => o.lookup_key === 'default');
  if (!offering) throw new Error(`No current offering. Saw: ${offerings.map((o) => o.lookup_key).join(', ')}`);
  console.log(`offering  ${offering.id} (${offering.lookup_key}) current=${offering.is_current}`);

  const packages = await items(`${P}/offerings/${offering.id}/packages`);

  // 5. Attach what is missing. Idempotent: already-attached is a skip, not an error.
  let changed = 0;
  for (const [storeId, pkgKey] of Object.entries(WANTED)) {
    const product = productFor(storeId);
    const pkg = packages.find((k) => k.lookup_key === pkgKey);
    if (!product) { console.log(`SKIP      ${storeId}: no such product on the App Store app`); continue; }
    if (!pkg) { console.log(`SKIP      ${storeId}: offering has no ${pkgKey} package`); continue; }

    const attached = await items(`${P}/packages/${pkg.id}/products`);
    if (attached.some((x) => (x.product?.id ?? x.id) === product.id)) {
      console.log(`OK        ${pkgKey} already has ${storeId}`);
      continue;
    }
    await api('POST', `${P}/packages/${pkg.id}/actions/attach_products`, {
      products: [{ product_id: product.id, eligibility_criteria: 'all' }],
    });
    console.log(`ATTACHED  ${storeId} → ${pkgKey}`);
    changed++;
  }

  // 6. Re-list, so the log carries the proof rather than the promise.
  console.log('\nFinal state:');
  for (const pkg of packages) {
    const attached = await items(`${P}/packages/${pkg.id}/products`);
    const names = attached.map((x) => {
      const prod = x.product ?? x;
      return `${prod.store_identifier ?? prod.id}`;
    });
    console.log(`  ${pkg.lookup_key}: ${names.join(', ') || '(empty)'}`);
  }
  console.log(`\n${changed} attachment(s) made.`);
};

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
