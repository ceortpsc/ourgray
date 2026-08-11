const AUTH_STORAGE_KEY = 'ggh.oauth.pkce.v1';

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes).slice(0, length);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function decodeJwtPayload(token) {
  if (!token || token.split('.').length < 2) return null;
  const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
  const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    return JSON.parse(decodeURIComponent(Array.from(atob(padded), character => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
  } catch {
    return null;
  }
}

function resolveAuthority(config) {
  const segment = config.authorityMode === 'tenant' ? config.tenantId : (config.authorityMode || 'common');
  return `https://login.microsoftonline.com/${encodeURIComponent(segment)}/oauth2/v2.0`;
}

function redirectUri(config) {
  if (config.redirectUri) return config.redirectUri;
  return new URL(config.redirectPath || '/candidate-access.html', window.location.origin).href;
}

export function oauthConfigured(config) {
  return Boolean(config?.oauthEnabled && config?.clientId && config.clientId !== 'REPLACE_WITH_APP_CLIENT_ID');
}

export async function beginOAuth(config, { loginHint = '' } = {}) {
  if (!oauthConfigured(config)) throw new Error('OAuth application registration is not configured yet.');

  const verifier = randomString(96);
  const challenge = base64Url(await sha256(verifier));
  const state = randomString(40);
  const nonce = randomString(40);
  const request = {
    verifier,
    state,
    nonce,
    createdAt: new Date().toISOString(),
    redirectUri: redirectUri(config)
  };
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(request));

  const authorizeUrl = new URL(`${resolveAuthority(config)}/authorize`);
  authorizeUrl.searchParams.set('client_id', config.clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', request.redirectUri);
  authorizeUrl.searchParams.set('response_mode', 'query');
  authorizeUrl.searchParams.set('scope', (config.scopes || ['openid', 'profile', 'email']).join(' '));
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('prompt', 'select_account');
  if (loginHint) authorizeUrl.searchParams.set('login_hint', loginHint);
  window.location.assign(authorizeUrl.href);
}

export async function completeOAuth(config) {
  const url = new URL(window.location.href);
  const error = url.searchParams.get('error');
  if (error) {
    const description = url.searchParams.get('error_description') || error;
    clearOAuthCallback();
    throw new Error(description);
  }

  const code = url.searchParams.get('code');
  if (!code) return null;

  const saved = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  if (!saved?.verifier || !saved?.state) throw new Error('OAuth state is missing or expired.');
  if (url.searchParams.get('state') !== saved.state) throw new Error('OAuth state validation failed.');

  const body = new URLSearchParams({
    client_id: config.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: saved.redirectUri,
    code_verifier: saved.verifier,
    scope: (config.scopes || ['openid', 'profile', 'email']).join(' ')
  });

  const response = await fetch(`${resolveAuthority(config)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const tokenResponse = await response.json();
  if (!response.ok) throw new Error(tokenResponse.error_description || tokenResponse.error || 'OAuth token exchange failed.');

  const claims = decodeJwtPayload(tokenResponse.id_token) || {};
  if (saved.nonce && claims.nonce && claims.nonce !== saved.nonce) throw new Error('OAuth nonce validation failed.');

  const session = {
    authenticatedAt: new Date().toISOString(),
    expiresIn: tokenResponse.expires_in || null,
    claims: {
      subject: claims.sub || null,
      objectId: claims.oid || null,
      tenantId: claims.tid || null,
      name: claims.name || null,
      email: claims.email || claims.preferred_username || null,
      username: claims.preferred_username || null
    },
    assurance: 'OAUTH2_PKCE_BROWSER_SESSION',
    authorizationBoundary: 'Server-side token validation and RBAC remain required for protected operations.'
  };

  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.setItem('ggh.oauth.session.v1', JSON.stringify(session));
  clearOAuthCallback();
  return session;
}

export function getOAuthSession() {
  try {
    return JSON.parse(sessionStorage.getItem('ggh.oauth.session.v1') || 'null');
  } catch {
    return null;
  }
}

export function signOutOAuth() {
  sessionStorage.removeItem('ggh.oauth.session.v1');
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function clearOAuthCallback() {
  const clean = new URL(window.location.href);
  for (const key of ['code', 'state', 'session_state', 'error', 'error_description']) clean.searchParams.delete(key);
  window.history.replaceState({}, document.title, clean.href);
}
