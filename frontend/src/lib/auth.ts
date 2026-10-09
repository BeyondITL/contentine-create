import { Auth0Client } from '@auth0/auth0-spa-js';

let client: Auth0Client | null = null;

function getClient(): Auth0Client {
  if (!client) {
    client = new Auth0Client({
      domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN || '',
      clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID || '',
      authorizationParams: {
        redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
        audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
        scope: 'openid profile email',
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    });
  }
  return client;
}

/**
 * Initialize auth: handle redirect callback OR restore session from cache.
 * Returns { authed, user } — call this ONCE on app mount.
 */
export async function initAuth(): Promise<{ authed: boolean; user: any | null }> {
  const auth = getClient();

  // Step 1: If returning from Auth0 login, exchange the code for tokens
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      try {
        const result = await auth.handleRedirectCallback();
        const returnTo = result?.appState?.returnTo || '/';
        window.history.replaceState({}, document.title, returnTo);
      } catch (err) {
        // Code might be stale/consumed — clean URL and try cached session
        console.warn('Auth0 callback error:', err);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  // Step 2: Check if we have a valid session (from callback above OR from localStorage cache)
  try {
    const authed = await auth.isAuthenticated();
    if (authed) {
      const user = await auth.getUser();
      return { authed: true, user };
    }
  } catch (err) {
    console.warn('Auth0 isAuthenticated check failed:', err);
  }

  // Step 3: No session found — try restoring from cached tokens
  try {
    await auth.checkSession();
    const authed = await auth.isAuthenticated();
    if (authed) {
      const user = await auth.getUser();
      return { authed: true, user };
    }
  } catch {
    // No cached session — user is not logged in
  }

  return { authed: false, user: null };
}

export async function login(returnTo?: string): Promise<void> {
  const auth = getClient();
  await auth.loginWithRedirect({
    appState: {
      returnTo: returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/'),
    },
  });
}

export async function logout(): Promise<void> {
  const auth = getClient();
  await auth.logout({ logoutParams: { returnTo: window.location.origin } });
}

export async function getToken(): Promise<string | null> {
  try {
    const auth = getClient();
    return await auth.getTokenSilently();
  } catch {
    return null;
  }
}

export async function getUser(): Promise<any | null> {
  try {
    const auth = getClient();
    return await auth.getUser();
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const auth = getClient();
    return await auth.isAuthenticated();
  } catch {
    return false;
  }
}
