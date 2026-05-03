import { OAUTH_SCOPES, WEB_OAUTH_CLIENT_ID } from './config';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

interface StoredToken {
  access_token: string;
  expires_at: number;
}

const TOKEN_KEY = 'oauth_token';

async function getStoredToken(): Promise<StoredToken | null> {
  const res = (await chrome.storage.local.get(TOKEN_KEY)) as { [TOKEN_KEY]?: StoredToken };
  return res[TOKEN_KEY] ?? null;
}

async function setStoredToken(token: StoredToken | null): Promise<void> {
  if (token === null) {
    await chrome.storage.local.remove(TOKEN_KEY);
  } else {
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
  }
}

function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: WEB_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: OAUTH_SCOPES.join(' '),
    state,
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function launchWebAuthFlow(url: string, interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth flow failed'));
        return;
      }
      resolve(redirectUrl);
    });
  });
}

function parseTokenFromRedirect(redirectUrl: string): {
  access_token: string;
  expires_in: number;
} {
  const url = new URL(redirectUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const error = fragment.get('error');
  if (error) {
    throw new Error(`OAuth error: ${error} ${fragment.get('error_description') ?? ''}`);
  }
  const access_token = fragment.get('access_token');
  const expires_in = parseInt(fragment.get('expires_in') ?? '3600', 10);
  if (!access_token) throw new Error('No access_token in redirect');
  return { access_token, expires_in };
}

export async function signIn(): Promise<string> {
  const redirectUri = chrome.identity.getRedirectURL();
  const state = Math.random().toString(36).slice(2);
  const url = buildAuthUrl(redirectUri, state);
  const redirect = await launchWebAuthFlow(url, true);
  const { access_token, expires_in } = parseTokenFromRedirect(redirect);
  const token: StoredToken = {
    access_token,
    expires_at: Date.now() + (expires_in - 60) * 1000,
  };
  await setStoredToken(token);
  return access_token;
}

async function silentRefresh(): Promise<string | null> {
  try {
    const redirectUri = chrome.identity.getRedirectURL();
    const state = Math.random().toString(36).slice(2);
    const url = `${buildAuthUrl(redirectUri, state)}&prompt=none`;
    const redirect = await launchWebAuthFlow(url, false);
    const { access_token, expires_in } = parseTokenFromRedirect(redirect);
    const token: StoredToken = {
      access_token,
      expires_at: Date.now() + (expires_in - 60) * 1000,
    };
    await setStoredToken(token);
    return access_token;
  } catch {
    return null;
  }
}

export async function getAuthToken(interactive = true): Promise<string> {
  const stored = await getStoredToken();
  if (stored && stored.expires_at > Date.now()) {
    return stored.access_token;
  }
  const refreshed = await silentRefresh();
  if (refreshed) return refreshed;
  if (!interactive) throw new Error('No cached token and non-interactive requested');
  return signIn();
}

export async function getCurrentUserEmail(token: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export async function signOut(): Promise<void> {
  const stored = await getStoredToken();
  if (stored) {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.access_token)}`,
      { method: 'POST' },
    ).catch(() => undefined);
  }
  await setStoredToken(null);
}

export async function withAuthRetry<T>(fn: (token: string) => Promise<T>): Promise<T> {
  let token = await getAuthToken(true);
  try {
    return await fn(token);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await setStoredToken(null);
      token = await getAuthToken(true);
      return fn(token);
    }
    throw err;
  }
}
