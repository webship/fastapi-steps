'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions. It puts the page side of the pack (fastapi-probe.js) into every
// page the World opens, records the documents each page loads, and holds the plumbing the steps use and that a
// project can require for its own steps: the app's schema and the prefix of its API, its token address, the accounts
// of worldParameters.users, signing in, FastAPI's `detail` read as a person reads it, the app's calls to its API from
// the page, its messages, and the failure messages.
//
// A FastAPI app is an API first: it answers in JSON, describes itself in an OpenAPI schema (the source of its
// interactive docs), hands out a bearer token for a user name and a password (OAuth2's password flow), and refuses
// bad input with a 422 whose `detail` names each field and the reason. A front end on it (the official full-stack
// template's, among others) calls that API from the page. The steps wait on those calls and read those answers,
// never for a fixed time.
//
// Everything builds on webship-js's own helpers (`onNewPage`, `sendRequest`, `pollPage`, `friendly`, `failure`) and
// on the state of its API steps (`api.steps.js`: the last answer, the headers, the placeholders), so the steps fail
// the way the core webship-js steps do and the built-in API steps see what this pack sets.

const webship = require('webship-js/tests/step-definitions/webship');
const api = require('webship-js/tests/step-definitions/api.steps');
const { apiProbe } = require('./fastapi-probe');

const { friendly, failure, onNewPage, sendRequest, pollPage, excerpt } = webship;

/** The page side as a script: it installs `window.__webshipFastapi`. */
const PROBE = `(${apiProbe.toString()})();`;

// The budgets of the waits (milliseconds): each is a ceiling, not a pause.
const WAIT = {
  calls: 15000,    // the app's calls to its API to be answered, and a quiet moment after them
  quiet: 250,      // that quiet moment: the template refetches a list a moment after each change
  message: 10000,  // a message of the app to show
  messagesGone: 15000, // the messages to leave (a toast stays about four seconds)
  reload: 30000,   // the app to load another page itself (it retries a refused call first)
  docs: 20000,     // the API docs to draw their operations, and to answer a try-out
  field: 10000,    // a field to say why it was refused
};

// Every page the World opens gets the probe before its own scripts run, and every document its main frame loads is
// recorded, so a step tells a page the app loaded itself from a change of address inside the page.
if (typeof onNewPage === 'function') {
  onNewPage(async (world, page) => {
    try { await page.addInitScript(PROBE); } catch (e) { /* a closed page needs nothing */ }
    page.on('request', (request) => {
      try {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          if (!world.fastapiDocuments) world.fastapiDocuments = [];
          world.fastapiDocuments.push({ url: request.url(), at: Date.now() });
        }
      } catch (e) { /* a page that closed meanwhile */ }
    });
  });
}

// ---------------------------------------------------------------------------
// Settings, addresses and accounts
// ---------------------------------------------------------------------------

/**
 * The settings of the pack, `worldParameters.fastapi` in cucumber.js, with their defaults:
 * - `docs`: the address of the interactive docs (Swagger UI), `/docs`;
 * - `openapi`: the address of the schema, read from the docs page, else `/openapi.json`;
 * - `apiPrefix`: the prefix of the API's paths, the longest one the schema's paths share, else `/api/`;
 * - `tokenUrl`: the token address, the schema's OAuth2 password flow;
 * - `tokenStorage`: where the front end keeps its token, `localStorage:access_token` (`sessionStorage:…` too);
 * - `manager`: the account (of worldParameters.users) that removes a scenario's test content, `admin`;
 * - `testContent`: what @removes-test-content removes: lists of the API, relative to its prefix, and the fields
 *   whose value marks a scenario's content (`^Webship test`, an account's `^webship\.test\.` email).
 */
function settings(world) {
  const own = (world.parameters && world.parameters.fastapi) || {};
  return {
    docs: own.docs || '/docs',
    openapi: own.openapi || '',
    apiPrefix: own.apiPrefix || '',
    tokenUrl: own.tokenUrl || '',
    tokenStorage: own.tokenStorage || 'localStorage:access_token',
    manager: own.manager || 'admin',
    testContent: Array.isArray(own.testContent) ? own.testContent : [
      { name: 'accounts', list: 'users/', remove: 'users/{id}', match: { email: '^webship\\.test\\.', full_name: '^Webship test' } },
      { name: 'items', list: 'items/', remove: 'items/{id}', match: { title: '^Webship test' } },
    ],
  };
}

/** The app's address, the launch URL of cucumber.js, without a trailing slash. */
function base(world) {
  const url = (world.parameters && world.parameters.launchUrl) || world.launchUrl || '';
  if (!url) {
    throw friendly({
      message: 'No launch URL is set, so the app has no address.',
      hint: 'Set worldParameters.launchUrl in cucumber.js, or LAUNCH_URL in the environment, to the app\'s address (http://127.0.0.1:8000).',
    });
  }
  return String(url).replace(/\/+$/, '');
}

/** A path of the app as a whole address; a whole address as written. */
function absolute(world, path) {
  const text = String(path || '');
  if (/^https?:\/\//i.test(text)) return text;
  return `${base(world)}/${text.replace(/^\/+/, '')}`;
}

/** The path of an address (and its query when `withQuery`), for comparing calls. */
function pathOf(url, withQuery) {
  try {
    const u = new URL(url, 'http://localhost');
    return withQuery ? `${u.pathname}${u.search}` : u.pathname;
  } catch (e) {
    return String(url);
  }
}

/**
 * An account of the users registry in cucumber.js (`worldParameters.users`), by the handle a scenario names it with.
 *
 * @returns {{handle: string, username: string, password: string}}
 */
function user(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: process.env.FASTAPI_${String(handle).toUpperCase()}_USERNAME, password: process.env.FASTAPI_${String(handle).toUpperCase()}_PASSWORD } }.`,
    });
  }
  if (!entry.username || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${entry.username ? 'password' : 'user name'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.username and .password in cucumber.js, from environment variables (FASTAPI_${String(handle).toUpperCase()}_PASSWORD).`,
    });
  }
  return { handle, username: String(entry.username), password: String(entry.password) };
}

// ---------------------------------------------------------------------------
// The API: requests, the schema, the token
// ---------------------------------------------------------------------------

/**
 * A request of the pack's own (the schema, a sign-in, a clean-up), through webship-js's transport. `form` goes out as
 * a form body (OAuth2's password flow), `json` as JSON.
 *
 * @returns {Promise<{status: number, data: *, headers: Object, config: {method: string, url: string}}>}
 */
async function request(world, method, path, options) {
  const { headers, form, json } = options || {};
  const sent = { ...(headers || {}) };
  let data;
  if (form) {
    data = new URLSearchParams(form).toString();
    sent['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (json !== undefined) {
    data = JSON.stringify(json);
    sent['Content-Type'] = 'application/json';
  }
  const url = absolute(world, path);
  try {
    return await sendRequest(world, { method, url, headers: sent, data, session: false });
  } catch (e) {
    throw friendly({
      message: `The app did not answer ${method} ${url}.`,
      cause: e,
      hint: 'Check that the app is up at the launch URL of cucumber.js (LAUNCH_URL).',
    });
  }
}

// The schema of each app, read once a run.
const SCHEMAS = new Map();

/** Where the schema is: the setting, else the address the docs page loads it from, else FastAPI's default. */
async function schemaAddress(world) {
  const own = settings(world);
  if (own.openapi) return own.openapi;
  try {
    const page = await request(world, 'GET', own.docs, { headers: { Accept: 'text/html' } });
    const found = typeof page.data === 'string' && page.data.match(/SwaggerUIBundle\(\{[\s\S]*?\burl:\s*['"]([^'"]+)['"]/);
    if (found) return found[1];
  } catch (e) { /* no docs page: FastAPI's default address */ }
  return '/openapi.json';
}

/**
 * The app's OpenAPI schema and its address, read once a run.
 *
 * @returns {Promise<{address: string, doc: Object}>}
 */
function schema(world) {
  const key = base(world);
  if (!SCHEMAS.has(key)) {
    const reading = (async () => {
      const where = await schemaAddress(world);
      const answer = await request(world, 'GET', where);
      if (answer.status !== 200 || !answer.data || typeof answer.data !== 'object' || !answer.data.paths) {
        throw friendly({
          message: `The API's schema is not at ${absolute(world, where)}: it answered ${answer.status}.`,
          hint: 'Set worldParameters.fastapi.openapi in cucumber.js to the schema\'s address (FastAPI serves it at /openapi.json unless the app moves it with openapi_url).',
        });
      }
      return { address: absolute(world, where), doc: answer.data };
    })();
    reading.catch(() => SCHEMAS.delete(key));
    SCHEMAS.set(key, reading);
  }
  return SCHEMAS.get(key);
}

/** The longest prefix ending in "/" that every path shares ("/api/v1/"). */
function commonPrefix(paths) {
  if (!paths.length) return '';
  let prefix = paths[0];
  for (const p of paths) while (prefix && !p.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.slice(0, prefix.lastIndexOf('/') + 1);
}

/** The prefix of the API's paths: the setting, else the one the schema's paths share, else "/api/". */
async function apiPrefix(world) {
  const own = settings(world);
  if (own.apiPrefix) return own.apiPrefix;
  if (world.fastapiPrefix) return world.fastapiPrefix;
  let prefix = '/api/';
  try {
    const { doc } = await schema(world);
    prefix = commonPrefix(Object.keys(doc.paths || {})) || '/';
  } catch (e) { /* no schema: the usual prefix */ }
  world.fastapiPrefix = prefix;
  return prefix;
}

/** The token address: the setting, else the OAuth2 password flow the schema declares. */
async function tokenUrl(world) {
  const own = settings(world);
  if (own.tokenUrl) return own.tokenUrl;
  const { doc, address } = await schema(world);
  const schemes = (doc.components && doc.components.securitySchemes) || {};
  for (const scheme of Object.values(schemes)) {
    const flow = scheme && scheme.type === 'oauth2' && scheme.flows && scheme.flows.password;
    if (flow && flow.tokenUrl) return flow.tokenUrl;
  }
  throw friendly({
    message: `The API's schema (${address}) declares no OAuth2 password flow, so it names no address to sign in at.`,
    hint: 'Set worldParameters.fastapi.tokenUrl in cucumber.js, or give the app an OAuth2PasswordBearer(tokenUrl=…) dependency.',
  });
}

/** FastAPI's `detail` as a person reads it: the text, or each refused field and its reason. */
function detailText(data) {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'detail' in data) {
    const detail = data.detail;
    if (typeof detail === 'string') return `"${detail}"`;
    if (Array.isArray(detail)) return detail.map((entry) => `${fieldOf(entry)} ("${entry && entry.msg}")`).join(', ');
    return excerpt(JSON.stringify(detail), 200);
  }
  if (data === undefined || data === null || data === '') return '(no answer)';
  return excerpt(typeof data === 'string' ? data : JSON.stringify(data), 200);
}

/** The field a 422 entry names: its `loc` without where the value was (body, query, path, header, cookie). */
function fieldOf(entry) {
  const loc = Array.isArray(entry && entry.loc) ? entry.loc.map(String) : [];
  const rest = ['body', 'query', 'path', 'header', 'cookie'].includes(loc[0]) ? loc.slice(1) : loc;
  return (rest.length ? rest : loc).join('.') || '(the request)';
}

/** Text compared the way a person reads it: white space collapsed, letter case ignored. */
function normal(text) {
  return String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Sign an account of the users registry in through the API's token address; the token is kept for the scenario.
 *
 * @returns {Promise<string>} the bearer token
 */
async function signIn(world, handle) {
  const who = user(world, handle);
  if (!world.fastapiTokens) world.fastapiTokens = {};
  if (world.fastapiTokens[handle]) return world.fastapiTokens[handle];
  const where = await tokenUrl(world);
  const answer = await request(world, 'POST', where, { form: { username: who.username, password: who.password } });
  const token = answer.data && typeof answer.data === 'object' ? answer.data.access_token : '';
  if (answer.status !== 200 || !token) {
    throw friendly({
      message: `The API refused to sign "${handle}" (${who.username}) in at ${absolute(world, where)}: ${answer.status} ${detailText(answer.data)}.`,
      hint: `Check worldParameters.users.${handle} in cucumber.js (and the environment variables it reads), and that the account exists and is active.`,
    });
  }
  world.fastapiTokens[handle] = token;
  return token;
}

/** The headers of a request signed by an account. */
async function signed(world, handle) {
  return { Authorization: `Bearer ${await signIn(world, handle)}` };
}

/** The last answer of webship-js's API steps, or a failure that says to send a request first. */
function lastAnswer(page) {
  const answer = typeof api.getApiResponse === 'function' ? api.getApiResponse() : null;
  if (!answer) {
    throw failure(page, 'There is no answer of the API to read: no request was sent in this scenario.', {
      hint: 'Send one first with webship-js\'s API steps: When I send a POST request to "/api/v1/…" with body:',
    });
  }
  return answer;
}

/** "POST /api/v1/items/" read from the answer webship-js keeps. */
function requestLine(answer) {
  const config = (answer && answer.config) || {};
  return `${String(config.method || 'GET').toUpperCase()} ${pathOf(config.url || '', true)}`;
}

// ---------------------------------------------------------------------------
// The front end: its calls to the API, its documents, its messages
// ---------------------------------------------------------------------------

/** Is the page's probe there? A page with JavaScript off, or a page the probe could not enter, has none. */
async function probeOn(page) {
  try { return await page.evaluate(() => !!window.__webshipFastapi); } catch (e) { return false; }
}

/** The calls of the page to the API (its prefix), oldest first. */
async function appCalls(world) {
  const prefix = await apiPrefix(world);
  let calls = [];
  try { calls = await world.page.evaluate(() => (window.__webshipFastapi ? window.__webshipFastapi.calls(0) : [])); } catch (e) { calls = []; }
  return calls.filter((call) => /^https?:\/\//i.test(prefix) ? call.url.startsWith(prefix) : pathOf(call.url).startsWith(prefix));
}

/** "POST /api/v1/items/ (200)" for a failure message. */
function callLine(call) {
  return `${call.method} ${pathOf(call.url, true)}${call.end ? ` (${call.status})` : ' (in flight)'}`;
}

/**
 * Wait for the app's calls to its API to be answered, then for a quiet moment with none started: the page is then
 * drawn from what the API said. Throws when they are still going at the end of the budget.
 */
async function waitForCalls(world, budget) {
  const page = world.page;
  const prefix = await apiPrefix(world);
  if (!(await probeOn(page))) {
    const done = await pollPage(page, () => document.readyState === 'complete', null, budget || WAIT.calls, 50);
    if (!done) throw failure(page, 'The page did not finish loading.', { hint: 'Check that the app is up and answers its own pages.' });
    return;
  }
  const quietDone = await pollPage(page, ({ prefix: p, quiet }) => {
    const probe = window.__webshipFastapi;
    if (!probe || document.readyState !== 'complete') return false;
    const own = (url) => {
      if (/^https?:\/\//i.test(p)) return url.startsWith(p);
      try { return new URL(url).pathname.startsWith(p); } catch (e) { return false; }
    };
    const calls = probe.calls(0).filter((c) => own(c.url));
    if (calls.some((c) => !c.end)) return false;
    const last = calls.reduce((m, c) => Math.max(m, c.start, c.end), 0);
    return probe.now() - last >= quiet;
  }, { prefix, quiet: WAIT.quiet }, budget || WAIT.calls, 50);
  if (!quietDone) {
    const going = (await appCalls(world)).filter((call) => !call.end);
    throw failure(page, `The app's calls to its API did not finish in ${Math.round((budget || WAIT.calls) / 1000)} s.`, {
      found: going.length ? `still in flight: ${going.map(callLine).join(', ')}` : 'the page kept calling the API',
      hint: 'Check that the API answers (its log), or wait for something the page shows instead.',
    });
  }
}

/** The documents the main frame loaded in this scenario, oldest first. */
function documents(world) {
  return world.fastapiDocuments || [];
}

/** The messages the app shows: its toaster's (Sonner's region "Notifications …"), any status or alert. */
function messageLocators(page) {
  return [
    page.getByRole('region', { name: /notification/i }).getByRole('listitem'),
    page.getByRole('status'),
    page.getByRole('alert'),
  ];
}

/** The texts of the messages shown now, for a failure message. */
async function shownMessages(page) {
  const texts = [];
  for (const locator of messageLocators(page)) {
    let all = [];
    try { all = await locator.allInnerTexts(); } catch (e) { all = []; }
    for (const text of all) {
      const clean = String(text).replace(/\s+/g, ' ').trim();
      if (clean && !texts.includes(clean)) texts.push(clean);
    }
  }
  return texts;
}

/** Is a message with this text shown now? */
async function messageShown(page, text) {
  for (const locator of messageLocators(page)) {
    try {
      if (await locator.filter({ hasText: text }).first().isVisible()) return true;
    } catch (e) { /* not drawn yet */ }
  }
  return false;
}

/** Does the page run its own scripts? A browser without JavaScript (a lane of the suite) does not. */
async function scriptsRun(page) {
  try {
    return await page.evaluate(() => {
      const s = document.createElement('script');
      s.textContent = 'window.__webshipFastapiScripts = 1;';
      (document.head || document.documentElement).appendChild(s);
      s.remove();
      return window.__webshipFastapiScripts === 1;
    });
  } catch (e) {
    return false;
  }
}

/** Pause without the page (Node's timer, never the page's). */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  WAIT,
  settings,
  base,
  absolute,
  pathOf,
  user,
  request,
  schema,
  apiPrefix,
  tokenUrl,
  detailText,
  fieldOf,
  normal,
  signIn,
  signed,
  lastAnswer,
  requestLine,
  probeOn,
  appCalls,
  callLine,
  waitForCalls,
  documents,
  messageLocators,
  shownMessages,
  messageShown,
  scriptsRun,
  pause,
};
