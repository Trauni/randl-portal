const fetch = require('node-fetch');

const SHOP_API  = process.env.SHOP_ADMIN_API;
const EMAIL     = process.env.SHOP_ADMIN_EMAIL;
const PASSWORD  = process.env.SHOP_ADMIN_PASSWORD;

let cachedToken = process.env.SHOP_ADMIN_JWT || null;

async function refreshToken() {
  const res = await fetch(`${SHOP_API}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  if (!res.ok) throw new Error(`Shop-Auth fehlgeschlagen: ${res.status}`);
  const data = await res.json();
  cachedToken = data.token;
  return cachedToken;
}

async function shopFetch(path, options = {}, retry = true) {
  if (!cachedToken) await refreshToken();

  const res = await fetch(`${SHOP_API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cachedToken}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401 && retry) {
    await refreshToken();
    return shopFetch(path, options, false);
  }

  return res;
}

module.exports = { shopFetch };
