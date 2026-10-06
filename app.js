'use strict';
const $ = id => document.getElementById(id);
const logEl = $('softpay_log');
const log = m => { logEl.textContent += (typeof m === 'string' ? m : JSON.stringify(m)) + '\n'; };

// Inputs are remembered in localStorage on this device only (never in the repo).
const FIELDS = ['cid', 'sec', 'mref', 'appid', 'amount', 'cur', 'authurl', 'pkg'];
for (const f of FIELDS) {
  try { const v = localStorage.getItem('sp_' + f); if (v) $(f).value = v; } catch (e) {}
  $(f).addEventListener('input', () => { try { localStorage.setItem('sp_' + f, $(f).value); } catch (e) {} });
}

try { localStorage.removeItem('sp_api'); } catch (e) {}   // the API base is never remembered, so an old saved version cannot linger
let token = null, tokenExp = 0, client = null;
const last = () => { try { return localStorage.getItem('sp_last'); } catch (e) { return null; } };

function makeClient() {
  if (client) client.dispose('recreate');
  client = Softpay.newClient({
    env: { pkg: $('pkg').value.trim() },          // 3rd party app: package name only, no variant
    callback: '#',                                // same tab, hash callback (Chrome)
    fallback: false,
    log: true,
    onSuccess: (c, r) => { log(['onSuccess', r]); if (r.action === 'pending') { const id = r.requestId || last(); if (id) check(id); } },
    onFailure: (c, r, f) => { log(['onFailure', f && f.code, f && f.message, r]); if (r.action === 'pending') { const id = r.requestId || last(); if (id) check(id); } },
  });
}

async function bearer() {
  if (token && Date.now() < tokenExp) return token;
  const basic = btoa($('cid').value.trim() + ':' + $('sec').value.trim());
  const res = await fetch($('authurl').value.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + basic },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('token ' + res.status + ' ' + await res.text());
  const j = await res.json();
  token = j.access_token; tokenExp = Date.now() + (j.expires_in - 60) * 1000;
  return token;
}

async function api(method, path, body, noMerchant) {
  const headers = { 'Authorization': 'Bearer ' + await bearer(), 'Content-Type': 'application/json' };
  const mref = $('mref').value.trim();
  if (mref && !noMerchant) headers['X-Softpay-Merchant-Reference'] = mref;
  const res = await fetch($('api').value.trim() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(method + ' ' + path + ' ' + res.status + ' ' + text);
  return text ? JSON.parse(text) : {};
}

async function check(id) {
  if (!id && !last()) { log('no transaction created yet'); return; }
  try { log(['transaction', await api('GET', '/transactions/' + (id || last()))]); }
  catch (e) { log('check failed: ' + e.message); }
}

// Step 1 (needs no user gesture): create + start the transaction. Step 2 must run in a fresh tap,
// because the browser blocks the app switch unless it is called directly from a user gesture.
let pending = null;
$('pay').addEventListener('click', async () => {
  if (pending) {                                   // second tap: do the switch
    const id = pending; pending = null;
    $('pay').textContent = 'Create transaction and switch';
    log('switching with ' + id);
    client.processPending(id, 5000);
    return;
  }
  try {
    makeClient();
    $('pay').disabled = true;
    const created = await api('POST', '/transactions', { action: $('action').value.trim() });
    log(['created', created]);
    try { localStorage.setItem('sp_last', created.requestId); } catch (e) {}
    await api('PUT', '/transactions/' + created.requestId, {
      appId: $('appid').value.trim(),
      amount: parseInt($('amount').value, 10),
      currencyCode: $('cur').value.trim(),
      options: { suppressAppNotification: true },
    });
    try { localStorage.setItem('sp_last', created.requestId); } catch (e) {}
    pending = created.requestId;
    $('pay').textContent = 'Tap again to open the Softpay app';
    log('transaction started; tap the button again');
  } catch (e) { log('FAILED: ' + e.message); }
  finally { $('pay').disabled = false; }
});

$('getapp').addEventListener('click', () => { makeClient(); client.processAppId(); });
$('check').addEventListener('click', () => check());
$('merchants').addEventListener('click', async () => {
  try { log(['merchants', await api('GET', '/merchants', null, true)]); }
  catch (e) { log('merchants failed: ' + e.message); }
});
$('terminals').addEventListener('click', async () => {
  try {
    const stores = await api('GET', '/stores');
    for (const st of (stores.content || stores)) {
      log(['terminals of store', st.id, st.name, await api('GET', '/stores/' + st.id + '/terminals')]);
    }
  } catch (e) { log('terminals failed: ' + e.message); }
});
$('stores').addEventListener('click', async () => {
  try { log(['stores', await api('GET', '/stores')]); }
  catch (e) { log('stores failed: ' + e.message); }
});

window.addEventListener('load', () => { makeClient(); log('ready, build 9, client v' + Softpay.version.major + '.' + Softpay.version.minor); });
// Show app id when the app returns it.
window.addEventListener('hashchange', () => log('callback: ' + location.hash));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
