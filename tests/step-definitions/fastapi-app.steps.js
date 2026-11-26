'use strict';

// The front end of a FastAPI app, as it uses the API: signing in (the token kept where the front end keeps it), the
// calls the page sends to the API and their answers, the messages the app shows (its toasts, any status or alert),
// the page the app loads itself (a wrong token sends the browser to the login page), its not-found page, and what a
// field says when the app refuses it. A front end's own views are its framework's pack's (Vue, Angular, Svelte,
// Next.js): no phrase here is close to theirs, so both load together.

const { Given, When, Then } = require('@cucumber/cucumber');
const { failure, gotoUrl, pollPage } = require('webship-js/tests/step-definitions/webship');
const h = require('./fastapi-helpers');

/**
 * Sign an account of the users registry in for the front end: its token from the API's token address, kept where
 * the front end keeps it (`worldParameters.fastapi.tokenStorage`: localStorage "access_token", the official
 * template's), then the app's start page, and its calls to the API answered.
 *
 * Example #1: Given I am signed in to the app as "admin"
 * Example #2: Given we are signed in to the app as "user"
 * Example #3: And I am signed in to the app as "editor"
 * Example #4: Given I am signed in to the app as "manager"
 * Example #5: Given we are signed in to the app as "admin"
 *
 */
Given(/^(?:I am|we are) signed in to the app as "([^"]+)"$/, async function (handle) {
  const page = this.page;
  const token = await h.signIn(this, handle);
  const [area, key] = String(h.settings(this).tokenStorage).split(':');
  const store = /^session/i.test(area) ? 'sessionStorage' : 'localStorage';
  if (!key) {
    throw failure(page, `worldParameters.fastapi.tokenStorage is "${h.settings(this).tokenStorage}": it names no key.`, {
      hint: 'Write it as "localStorage:<key>" or "sessionStorage:<key>", where the front end keeps its token.',
    });
  }
  // The token goes into the app's own origin, then the start page loads with it.
  await gotoUrl(page, h.absolute(this, '/'));
  if (!(await h.scriptsRun(page))) {
    throw failure(page, 'The front end needs JavaScript, and this browser runs none, so it cannot be signed in.', {
      hint: 'Run the scenarios of the front end in a browser with JavaScript; the API needs no browser.',
    });
  }
  await page.evaluate(({ s, k, t }) => { window[s].setItem(k, t); }, { s: store, k: key, t: token });
  await gotoUrl(page, h.absolute(this, '/'));
  await h.waitForCalls(this);
});

/**
 * Wait for the app's calls to its API to be answered, and for a quiet moment with none started (the official
 * template asks for a list again a moment after each change): the page then shows what the API said.
 *
 * Example #1: When I wait for the app's API calls to finish
 * Example #2: And we wait for the app's API calls to finish
 * Example #3: Then I wait for the app's API calls to finish
 * Example #4: When wait for the app's API calls to finish
 * Example #5: But I wait for the app's API calls to finish
 *
 */
When(/^(?:I |we )?wait for the app's API calls to finish$/, async function () {
  await h.waitForCalls(this);
});

/**
 * The page called the API: a method and a path (with a query, when the step names one). The step waits for the
 * call and its answer; the steps after it read that call. The latest call of the page that fits is the one.
 *
 * Example #1: Then the app should have called "POST /api/v1/items/"
 * Example #2: Then the app should have called "GET /api/v1/users/me"
 * Example #3: And the app should have called "DELETE /api/v1/items/{id}"
 * Example #4: Then the app should have called "GET /api/v1/items/?skip=0&limit=100"
 * Example #5: But the app should have called "PATCH /api/v1/users/me"
 *
 */
Then(/^the app should have called "([A-Z]+) ([^"]+)"$/, async function (method, wanted) {
  const page = this.page;
  if (!(await h.probeOn(page))) {
    throw failure(page, 'The page runs no script of its own, so it called nothing.', {
      hint: 'Run the scenarios of the front end in a browser with JavaScript.',
    });
  }
  const withQuery = wanted.includes('?');
  const pattern = new RegExp(`^${wanted.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/?]+')}$`);
  const fits = (call) => call.method === method && pattern.test(h.pathOf(call.url, withQuery));
  const deadline = Date.now() + h.WAIT.calls;
  let found = null;
  let calls = [];
  while (Date.now() < deadline) {
    calls = await h.appCalls(this);
    found = calls.filter(fits).pop() || null;
    if (found && found.end) break;
    await h.pause(50);
  }
  if (!found) {
    throw failure(page, `Expected the app to have called ${method} ${wanted}, but it did not.`, {
      found: calls.length ? calls.slice(-6).map(h.callLine).join(', ') : 'no call to the API from this page',
      hint: 'A path can name its {parameters}; a query is compared only when the step names one.',
    });
  }
  if (!found.end) {
    throw failure(page, `The app called ${method} ${wanted}, and the API did not answer in ${Math.round(h.WAIT.calls / 1000)} s.`, {
      hint: 'Check the API (its log): the call is still in flight.',
    });
  }
  this.fastapiCall = found;
});

/** The call the steps read: the one named last, else the page's latest write to the API. */
async function namedCall(world) {
  if (world.fastapiCall) return world.fastapiCall;
  const writes = (await h.appCalls(world)).filter((call) => call.method !== 'GET' && call.end);
  return writes.pop() || null;
}

/** FastAPI's detail in the text of an answer the page received. */
function detailOf(call) {
  let data = call.body;
  try { data = JSON.parse(call.body); } catch (e) { /* not JSON: the text */ }
  return { data, text: h.detailText(data) };
}

/**
 * The app's call (the one named by "the app should have called", else its latest write) was accepted: answered
 * under 400.
 *
 * Example #1: Then the app's call should have been accepted
 * Example #2: And the app's call should have been accepted
 * Example #3: But the app's call should have been accepted
 * Example #4: Then the app's call should have been accepted
 * Example #5: And the app's call should have been accepted
 *
 */
Then(/^the app's call should have been accepted$/, async function () {
  const call = await namedCall(this);
  if (!call) {
    throw failure(this.page, 'The app made no call to its API to read.', {
      hint: 'Name it first: Then the app should have called "POST /api/v1/…"',
    });
  }
  if (call.status < 0 || call.status >= 400) {
    throw failure(this.page, `Expected the app's call ${call.method} ${h.pathOf(call.url, true)} to have been accepted, but the API answered ${call.status < 0 ? 'nothing (the call failed)' : call.status}: ${detailOf(call).text}.`, {
      hint: 'The page shows why too: Then the app should show the message "…"',
    });
  }
});

/**
 * The app's call (the one named by "the app should have called", else its latest write) was refused: answered 400 or
 * more, its detail containing the text (a reason, or a refused field's). Letter case and white space do not count.
 *
 * Example #1: Then the app's call should have been refused with "The user with this email already exists"
 * Example #2: Then the app's call should have been refused with "Incorrect email or password"
 * Example #3: And the app's call should have been refused with "Invalid token"
 * Example #4: Then the app's call should have been refused with "at least 8 characters"
 * Example #5: But the app's call should have been refused with "Not enough permissions"
 *
 */
Then(/^the app's call should have been refused with "([^"]*)"$/, async function (text) {
  const call = await namedCall(this);
  if (!call) {
    throw failure(this.page, 'The app made no call to its API to read.', {
      hint: 'Name it first: Then the app should have called "POST /api/v1/…"',
    });
  }
  const { data, text: said } = detailOf(call);
  if (call.status >= 0 && call.status < 400) {
    throw failure(this.page, `Expected the app's call ${call.method} ${h.pathOf(call.url, true)} to have been refused with "${text}", but the API accepted it (${call.status}).`, {
      hint: 'A refusal the front end makes itself sends no call: Then the "<field>" field should say "…"',
    });
  }
  const detail = data && typeof data === 'object' ? data.detail : undefined;
  const reasons = Array.isArray(detail) ? detail.map((entry) => entry && entry.msg) : [typeof detail === 'string' ? detail : (typeof data === 'string' ? data : JSON.stringify(data))];
  if (!reasons.some((reason) => h.normal(reason).includes(h.normal(text)))) {
    throw failure(this.page, `Expected the app's call ${call.method} ${h.pathOf(call.url, true)} to have been refused with "${text}", but the API said (${call.status}): ${said}.`, {
      hint: 'The text is matched inside FastAPI\'s detail: the reason, or each refused field\'s.',
    });
  }
});

/**
 * The app shows a message: one of its toasts (the region "Notifications …" of Sonner, the official template's), or
 * anything with the role status or alert, containing the text. The step waits for it to show.
 *
 * Example #1: Then the app should show the message "Item created successfully"
 * Example #2: Then the app should show the message "Incorrect email or password"
 * Example #3: And the app should show the message "Password recovery email sent successfully"
 * Example #4: Then the app should show the message "Something went wrong!"
 * Example #5: But the app should show the message "User created successfully"
 *
 */
Then(/^the app should show the message "([^"]*)"$/, async function (text) {
  const page = this.page;
  const deadline = Date.now() + h.WAIT.message;
  while (Date.now() < deadline) {
    if (await h.messageShown(page, text)) return;
    await h.pause(100);
  }
  const shown = await h.shownMessages(page);
  throw failure(page, `Expected the app to show the message "${text}", but it did not in ${Math.round(h.WAIT.message / 1000)} s.`, {
    found: shown.length ? shown.map((m) => `"${m}"`).join(', ') : 'no message',
    hint: 'A message is read from the app\'s toasts and from anything with the role status or alert.',
  });
});

/**
 * Wait for the app's messages to go: its toasts leave a few seconds after they show, and they cover the controls
 * under them (the official template's show at the bottom right).
 *
 * Example #1: When I wait for the app's messages to go
 * Example #2: And we wait for the app's messages to go
 * Example #3: Then I wait for the app's messages to go
 * Example #4: When wait for the app's messages to go
 * Example #5: But I wait for the app's messages to go
 *
 */
When(/^(?:I |we )?wait for the app's messages to go$/, async function () {
  const page = this.page;
  const toasts = h.messageLocators(page)[0];
  const deadline = Date.now() + h.WAIT.messagesGone;
  while (Date.now() < deadline) {
    let visible = 0;
    try {
      for (const item of await toasts.all()) if (await item.isVisible()) visible += 1;
    } catch (e) { visible = 0; }
    if (!visible) return;
    await h.pause(100);
  }
  const shown = await h.shownMessages(page);
  throw failure(page, `The app's messages did not go in ${Math.round(h.WAIT.messagesGone / 1000)} s.`, {
    found: shown.map((m) => `"${m}"`).join(', '),
    hint: 'A toast that stays may wait to be closed, or for the pointer to leave it.',
  });
});

/**
 * The app loaded a page itself: the browser is at the address, with a whole page load (a new document), not a
 * change of address inside the page. The official template does that when the API refuses its token: it retries
 * the refused call a few times first, so the step waits on purpose, and the log says so.
 *
 * Example #1: Then the app should have sent me to "/login" with a whole page load
 * Example #2: Then the app should have sent me to "/" with a whole page load
 * Example #3: And the app should have sent me to "/signup" with a whole page load
 * Example #4: Then the app should have sent me to "/login?expired=1" with a whole page load
 * Example #5: But the app should have sent me to "/login" with a whole page load
 *
 */
Then(/^the app should have sent me to "([^"]+)" with a whole page load$/, async function (wanted) {
  const page = this.page;
  const withQuery = wanted.includes('?');
  const at = () => h.pathOf(page.url(), withQuery);
  process.stdout.write(`\n[fastapi-steps] Waiting up to ${Math.round(h.WAIT.reload / 1000)} s for the app to load ${wanted} itself: an app retries a refused call before it gives up (the official template, four times).\n`);
  const deadline = Date.now() + h.WAIT.reload;
  const loadedThere = () => {
    const docs = h.documents(this);
    const last = docs[docs.length - 1];
    return !!last && h.pathOf(last.url, withQuery) === wanted && docs.length >= 2;
  };
  while (Date.now() < deadline) {
    if (at() === wanted && loadedThere()) {
      const ready = await pollPage(page, () => document.readyState === 'complete', null, 5000, 50);
      if (ready) return;
    }
    await h.pause(100);
  }
  if (at() === wanted) {
    throw failure(page, `Expected the app to have loaded ${wanted} with a whole page load, but it went there inside the page (its router), with no new document.`, {
      hint: 'A change of address inside the page is the router\'s: a front end\'s own pack reads those.',
    });
  }
  throw failure(page, `Expected the app to have sent the browser to ${wanted} with a whole page load in ${Math.round(h.WAIT.reload / 1000)} s, but it is at ${at()}.`, {
    found: h.documents(this).slice(-3).map((d) => h.pathOf(d.url, true)).join(' → ') || 'no page load',
    hint: 'The template does it when the API refuses the token it keeps (401 or 403); a page with a valid token stays.',
  });
});

/**
 * The app shows its not-found page, judged by the page, never by the status: a browser that opens an address the
 * app does not know gets the front end's page (200) and the front end says it was not found (FastAPI's front-end
 * fallback). The page shows "not found" or 404 in its content, or an element with the test id "not-found".
 *
 * Example #1: Then the app should show its not-found page
 * Example #2: And the app should show its not-found page
 * Example #3: But the app should show its not-found page
 * Example #4: Then the app should show its not-found page
 * Example #5: And the app should show its not-found page
 *
 */
Then(/^the app should show its not-found page$/, async function () {
  const page = this.page;
  if (!(await h.scriptsRun(page))) {
    throw failure(page, 'The front end draws its not-found page with JavaScript, and this browser runs none.', {
      hint: 'Run it in a browser with JavaScript; to a script the API answers 404 itself (webship-js: the API response code should be 404).',
    });
  }
  const says = () => page.evaluate(() => {
    if (document.querySelector('[data-testid="not-found"]')) return true;
    const root = document.querySelector('main') || document.body;
    const copy = root.cloneNode(true);
    for (const toast of copy.querySelectorAll('[data-sonner-toast], [role="status"], [role="alert"]')) toast.remove();
    const text = (copy.innerText || copy.textContent || '').replace(/\s+/g, ' ');
    return /\bnot found\b/i.test(text) || /(^|\s)404(\s|$)/.test(text);
  }).catch(() => false);
  const deadline = Date.now() + h.WAIT.message;
  while (Date.now() < deadline) {
    if (await says()) return;
    await h.pause(100);
  }
  const heading = await page.evaluate(() => {
    const first = document.querySelector('h1, h2');
    return first ? first.innerText.trim() : (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }).catch(() => '');
  throw failure(page, 'Expected the app to show its not-found page, but the page does not say "not found" or 404.', {
    found: heading ? `"${heading}"` : 'an empty page',
    hint: 'A browser gets the front end\'s page for any address: the page, not the status, says it was not found.',
  });
});

/**
 * A field of a form says why it was refused: the field found by its label, marked invalid (aria-invalid="true"),
 * its description (aria-describedby, aria-errormessage) containing the text. The official template's forms say it
 * before they send anything. Letter case and white space do not count.
 *
 * Example #1: Then the "Title" field should say "Title is required"
 * Example #2: Then the "Email" field should say "Invalid email address"
 * Example #3: And the "Password" field should say "Password must be at least 8 characters"
 * Example #4: Then the "Confirm Password" field should say "The passwords don't match"
 * Example #5: But the "Email" field should say "Invalid email address"
 *
 */
Then(/^the "([^"]+)" field should say "([^"]*)"$/, async function (label, text) {
  const page = this.page;
  const field = page.getByLabel(label).first();
  if (!(await field.count())) {
    throw failure(page, `There is no field labelled "${label}" on the page.`, {
      hint: 'A field is found by its label, as a person reads it (a dialog\'s fields too).',
    });
  }
  const read = () => field.evaluate((el) => {
    const ids = `${el.getAttribute('aria-describedby') || ''} ${el.getAttribute('aria-errormessage') || ''}`.split(/\s+/).filter(Boolean);
    const said = ids.map((id) => document.getElementById(id)).filter(Boolean).map((node) => (node.innerText || node.textContent || '').trim()).filter(Boolean);
    return { invalid: el.getAttribute('aria-invalid') === 'true', said };
  }).catch(() => ({ invalid: false, said: [] }));
  const deadline = Date.now() + h.WAIT.field;
  let seen = { invalid: false, said: [] };
  while (Date.now() < deadline) {
    seen = await read();
    if (seen.invalid && seen.said.some((s) => h.normal(s).includes(h.normal(text)))) return;
    await h.pause(100);
  }
  throw failure(page, `Expected the "${label}" field to say "${text}", but ${seen.invalid ? `it says ${seen.said.map((s) => `"${s}"`).join(', ') || 'nothing'}` : 'it is not marked invalid'}.`, {
    found: seen.said.length ? seen.said.map((s) => `"${s}"`).join(', ') : 'no description tied to the field',
    hint: 'The message is read from the field\'s aria-describedby (or aria-errormessage), with aria-invalid="true".',
  });
});
