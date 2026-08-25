import { isPaired } from '../ui/pairing.js';

// The private-layer client. Along with static-json-source.js this is the only
// code in the app allowed to call fetch (see js/data/source.js).
//
// Talks to the Apps Script Web App documented in apps-script/README.md.

/**
 * text/plain is REQUIRED, not stylistic.
 *
 * Apps Script cannot set CORS response headers on a Web App. An
 * application/json body makes this a "preflighted" request, so the browser
 * first sends OPTIONS -- which Apps Script answers without the headers the
 * browser needs, and the real request never happens. text/plain is one of the
 * three content types that keep a POST a CORS "simple request", so it goes
 * straight through. The body is still JSON; the script parses
 * e.postData.contents itself.
 *
 * Changing this to application/json breaks the app in production only. It will
 * look completely fine in unit tests.
 */
const CONTENT_TYPE = 'text/plain;charset=utf-8';

function looksLikeHtml(text) {
  return /^\s*<(?:!doctype|html)/i.test(text);
}

export function createAppsScriptSource({ pairing, fetchImpl = fetch }) {
  const paired = isPaired(pairing);

  async function call(action, args = {}) {
    if (!paired) throw new Error('This device is not paired.');

    const res = await fetchImpl(pairing.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': CONTENT_TYPE },
      // Apps Script 302s every POST to script.googleusercontent.com, which
      // then serves the ContentService output. Redirects must be followed or
      // nothing ever returns.
      redirect: 'follow',
      body: JSON.stringify({ token: pairing.token, action, ...args }),
    });

    if (!res.ok) throw new Error(`Private layer request failed: ${res.status}`);

    const text = await res.text();

    // Google serves a sign-in interstitial instead of the script's output when
    // the deployment's access is "Anyone with Google account" rather than
    // "Anyone". Reporting that as "Unexpected token < in JSON" would send
    // someone hunting a parser bug for an afternoon.
    if (looksLikeHtml(text)) {
      throw new Error(
        'The endpoint returned a Google sign-in page instead of data. ' +
        'Check the deployment\'s "Who has access" is set to Anyone, and that ' +
        'the URL is the deployed /exec URL.'
      );
    }

    let envelope;
    try {
      envelope = JSON.parse(text);
    } catch {
      throw new Error('The endpoint returned something that is not JSON.');
    }

    if (!envelope.ok) throw new Error(envelope.error || 'unknown_error');
    return envelope.data;
  }

  return {
    capabilities: { write: paired, private: paired },
    loadPrivate: () => call('loadPrivate'),
    saveNote: ({ recipeId, text, opId }) => call('saveNote', { recipeId, text, opId }),
    setRating: ({ recipeId, rating, opId }) => call('setRating', { recipeId, rating, opId }),
    markCooked: ({ recipeId, date, opId }) => call('markCooked', { recipeId, date, opId }),
  };
}
