// "Sign in / Get started" for a stranger, "Open console" for someone who is
// already signed in.
//
// This is a marketing page, so the rules are stricter than they would be in an
// app: the signed-out nav is what the HTML ships, it renders with no JavaScript
// at all, and nothing on this path may produce an error state, a spinner, or a
// layout shift that blocks reading. The gateway being down, being on another
// host, refusing the CORS preflight, or not existing yet are all the same answer
// here — leave the page exactly as it was served.
//
// The check is GET /auth/me with credentials:'include'. `apo_session` is
// httpOnly (auth.ts sets it that way deliberately), so there is nothing for this
// script to read directly; asking the gateway is the only way to know, and it is
// also the only way that stays right when the cookie has expired or the session
// has been revoked.
(function (root) {
  const TIMEOUT_MS = 2500;

  // Same validation the console links get: a bad origin means "not configured",
  // never a request to somewhere unexpected.
  function normalizeOrigin(origin) {
    if (typeof origin !== 'string' || !origin.trim()) return null;
    let u;
    try {
      u = new URL(origin.trim());
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  }

  /**
   * Show one set of account controls and hide the other.
   *
   * Uses the `hidden` attribute rather than a CSS class so the signed-out state
   * is the plain served HTML — no flash of the wrong nav, and no dependence on
   * a stylesheet having loaded before this runs.
   */
  function apply(doc, signedIn) {
    if (!doc) return;
    for (const el of doc.querySelectorAll('[data-signed-in]')) el.hidden = !signedIn;
    for (const el of doc.querySelectorAll('[data-signed-out]')) el.hidden = signedIn;
  }

  function check(doc, config) {
    if (!doc || !doc.querySelector('[data-signed-in]')) return Promise.resolve(false);
    const origin = normalizeOrigin((config || {}).gatewayOrigin);
    if (!origin || typeof fetch !== 'function') return Promise.resolve(false);

    // AbortSignal.timeout is 2022-era and universally available where this site
    // is expected to run, but an absent one must not throw on the way to a
    // request we do not care much about.
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(TIMEOUT_MS)
      : undefined;

    return fetch(origin + '/apoidea/auth/me', {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal,
    })
      .then((r) => {
        // 401 is the expected answer for most visitors and is not an error.
        if (!r.ok) return false;
        apply(doc, true);
        return true;
      })
      .catch(() => false);
  }

  root.ApoideiaSession = { normalizeOrigin, apply, check };

  if (typeof document !== 'undefined' && document) {
    check(document, root.APOIDEIA_CONFIG);
  }
})(typeof window !== 'undefined' ? window : globalThis);
