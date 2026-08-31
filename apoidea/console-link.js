// Point every console link at wherever the console actually is.
//
// The href in the HTML is a working default for the standard local stack; this
// rewrites it when the deployment says otherwise (see /config.js). Doing it here
// rather than templating the HTML keeps the pages static files.
//
// The first version of this file did `origin + href.slice(len)` against a
// hardcoded 'http://localhost:5173' prefix. That is correct for exactly one
// shape of CONSOLE_ORIGIN — a bare scheme://host:port with no trailing slash —
// and wrong, silently, for the shapes a real deployment actually uses:
//
//   https://console.example.com/          →  ".../auth" became "...//auth"
//   https://example.com/console           →  worked
//   https://example.com/console/          →  double slash again
//   javascript:alert(1)                   →  every console link on the page
//                                            becomes script execution
//
// and its selector, a[href^="http://localhost:5173"], also matched
// http://localhost:51731. So the origin is parsed and validated once, the
// anchor keeps its own path/query/hash, and anything that is not an http(s)
// origin is refused — leaving the built-in default, which at least works.
//
// The pure half is exported so it can be unit-tested in node with no DOM; see
// console-link.test.mjs.
(function (root) {
  // The literal that ships in the HTML. It doubles as the sentinel this file
  // looks for, which is why it is one constant and not three string literals.
  const DEFAULT_ORIGIN = 'http://localhost:5173';

  /**
   * Reduce a configured CONSOLE_ORIGIN to a base every link can be appended to:
   * scheme + host + port + any path prefix, with trailing slashes removed.
   * Returns null for anything that is not an http(s) URL — including the
   * scheme-less "console.example.com" an operator will eventually try, which
   * `new URL` would otherwise read as the scheme "console:".
   */
  function normalizeBase(origin) {
    if (typeof origin !== 'string' || !origin.trim()) return null;
    let u;
    try {
      u = new URL(origin.trim());
    } catch {
      return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // A base carrying a query or fragment cannot have a path appended to it
    // sensibly, so both are dropped rather than half-honoured.
    return u.origin + u.pathname.replace(/\/+$/, '');
  }

  /**
   * The href this anchor should carry for `origin`.
   *
   * Accepts either the shipped default (with whatever path/query/hash follows
   * it) or a root-relative path. Anything else — an external link, a mailto, a
   * bare fragment — is returned untouched, so marking the wrong anchor is inert
   * rather than destructive.
   */
  function resolve(origin, href) {
    const base = normalizeBase(origin);
    if (base === null || typeof href !== 'string') return href;

    let tail;
    if (href === DEFAULT_ORIGIN) {
      tail = '';
    } else if (
      href.startsWith(DEFAULT_ORIGIN + '/') ||
      href.startsWith(DEFAULT_ORIGIN + '?') ||
      href.startsWith(DEFAULT_ORIGIN + '#')
    ) {
      // The boundary check is what keeps http://localhost:51731 out.
      tail = href.slice(DEFAULT_ORIGIN.length);
    } else if (href.startsWith('/')) {
      tail = href;
    } else {
      return href;
    }

    return base + tail;
  }

  // Every anchor that should follow the console: the ones carrying the default
  // origin, plus anything explicitly marked. The marker is what links.test.mjs
  // audits, and it is what lets a page point an anchor at a bare /auth path
  // without that link being mistaken for a link to *this* site's /auth.
  const SELECTOR = 'a[data-console-link], a[href^="' + DEFAULT_ORIGIN + '"]';

  function apply(doc, origin) {
    if (!doc || normalizeBase(origin) === null) return 0;
    let n = 0;
    for (const a of doc.querySelectorAll(SELECTOR)) {
      const next = resolve(origin, a.getAttribute('href'));
      if (next !== a.getAttribute('href')) {
        a.href = next;
        n += 1;
      }
    }
    return n;
  }

  root.ApoideaConsoleLink = { DEFAULT_ORIGIN, SELECTOR, normalizeBase, resolve, apply };

  // Browsers run the rewrite immediately; node loads this file for its tests and
  // has no document to rewrite.
  if (typeof document !== 'undefined' && document) {
    apply(document, (root.APOIDEIA_CONFIG || {}).consoleOrigin);
  }
})(typeof window !== 'undefined' ? window : globalThis);
