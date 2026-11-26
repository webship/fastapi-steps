'use strict';

// The API of a FastAPI app, with no browser: signing in through its token address, reading its refusals (FastAPI's
// `detail`), checking an answer against the schema the app documents, and the operations it documents. The requests
// themselves are webship-js's API steps (`I send a POST request to "…" with body:`): these steps sign them and read
// their answers.
//
// The hooks of @removes-test-content are here too: a scenario that makes accounts or items (a sign-up, an item added
// through the front end) names them "Webship test …", and after it the managing account removes them through the API
// and checks that the counts came back to where they were.

const path = require('path');
const { Given, Then, Before, After } = require('@cucumber/cucumber');
const { friendly, failure } = require('webship-js/tests/step-definitions/webship');
const api = require('webship-js/tests/step-definitions/api.steps');
const h = require('./fastapi-helpers');

/**
 * Sign an account of the users registry (`worldParameters.users`) in through the API's token address (the OAuth2
 * password flow its schema declares), and sign every request webship-js's API steps send after it with the bearer
 * token. The token is also the placeholder `{{access_token}}`. The API base URL is the scenario's: `Given the API
 * base URL is "/"` sends the requests to the app.
 *
 * Example #1: Given I am signed in to the API as "admin"
 * Example #2: Given we are signed in to the API as "user"
 * Example #3: And I am signed in to the API as "editor"
 * Example #4: Given I am signed in to the API as "manager"
 * Example #5: Given we are signed in to the API as "admin"
 *
 */
Given(/^(?:I am|we are) signed in to the API as "([^"]+)"$/, async function (handle) {
  if (typeof api.setHeader !== 'function') {
    throw friendly({
      message: 'This webship-js cannot sign the requests of its API steps: it has no api.setHeader.',
      hint: 'Update webship-js to 2.0.19 or later (npm install webship-js@^2.0.19).',
    });
  }
  const token = await h.signIn(this, handle);
  api.setHeader('Authorization', `Bearer ${token}`);
  if (typeof api.setPlaceholder === 'function') api.setPlaceholder('{{access_token}}', token);
});

/**
 * The API's last answer refused a field: a 422 whose `detail` has an entry for that field (its `loc`, without where
 * the value was: "password", "address.city") with a reason containing the text. Letter case and white space do not
 * count.
 *
 * Example #1: Then the API should have refused "password" with "at least 8 characters"
 * Example #2: Then the API should have refused "email" with "not a valid email address"
 * Example #3: And the API should have refused "title" with "at least 1 character"
 * Example #4: Then the API should have refused "skip" with "valid integer"
 * Example #5: But the API should have refused "full_name" with "at most 255 characters"
 *
 */
Then(/^the API should have refused "([^"]+)" with "([^"]*)"$/, async function (field, reason) {
  const answer = h.lastAnswer(this.page);
  const detail = answer.data && typeof answer.data === 'object' ? answer.data.detail : undefined;
  if (answer.status !== 422 || !Array.isArray(detail)) {
    throw failure(this.page, `Expected the API to have refused "${field}" (a 422 naming the field), but ${h.requestLine(answer)} was answered ${answer.status}: ${h.detailText(answer.data)}.`, {
      hint: answer.status < 400 ? 'The API accepted the request: send a value it refuses.' : 'A refusal that is not a 422 says why in its text: Then the API should have said "…"',
    });
  }
  const named = detail.filter((entry) => {
    const name = h.fieldOf(entry);
    return name === field || name.endsWith(`.${field}`);
  });
  if (!named.some((entry) => h.normal(entry && entry.msg).includes(h.normal(reason)))) {
    throw failure(this.page, named.length
      ? `Expected the API to have refused "${field}" with "${reason}", but it said: ${named.map((entry) => `"${entry.msg}"`).join(', ')}.`
      : `Expected the API to have refused "${field}" with "${reason}", but it did not name "${field}".`, {
      found: `the refusal of ${h.requestLine(answer)}: ${h.detailText(answer.data)}`,
      hint: 'A field is named by its place in the request without "body" ("password", "address.city"), as FastAPI\'s loc gives it.',
    });
  }
});

/**
 * The API's last answer said a text: its `detail` (a refusal's reason, "Incorrect email or password"), or the text of
 * the answer when it has no `detail`. Letter case and white space do not count.
 *
 * Example #1: Then the API should have said "Incorrect email or password"
 * Example #2: Then the API should have said "Not authenticated"
 * Example #3: And the API should have said "Item not found"
 * Example #4: Then the API should have said "The user with this email already exists in the system"
 * Example #5: But the API should have said "Could not validate credentials"
 *
 */
Then(/^the API should have said "([^"]*)"$/, async function (text) {
  const answer = h.lastAnswer(this.page);
  const data = answer.data;
  const detail = data && typeof data === 'object' && !Array.isArray(data) ? data.detail : undefined;
  if (Array.isArray(detail)) {
    throw failure(this.page, `Expected the API to have said "${text}", but ${h.requestLine(answer)} was refused field by field (${answer.status}): ${h.detailText(data)}.`, {
      hint: 'Read a field\'s refusal with: Then the API should have refused "<field>" with "<reason>"',
    });
  }
  const said = typeof detail === 'string' ? detail : (typeof data === 'string' ? data : JSON.stringify(data));
  if (!h.normal(said).includes(h.normal(text))) {
    throw failure(this.page, `Expected the API to have said "${text}", but ${h.requestLine(answer)} was answered ${answer.status}: ${h.detailText(data)}.`, {
      hint: 'The text is matched inside FastAPI\'s detail, or inside the whole answer when it has none.',
    });
  }
});

// ajv (JSON Schema 2020-12, the dialect of OpenAPI 3.1) and its formats come with webship-js.
let validatorCache = null;
function validator() {
  if (validatorCache) return validatorCache;
  const from = [process.cwd()];
  try { from.push(path.dirname(require.resolve('webship-js/package.json'))); } catch (e) { /* the project's own */ }
  const load = (name) => {
    const mod = require(require.resolve(name, { paths: from }));
    return mod && mod.default ? mod.default : mod;
  };
  const Ajv2020 = load('ajv/dist/2020');
  const addFormats = load('ajv-formats');
  const ajv = new Ajv2020({ strict: false, allErrors: true, logger: false, validateFormats: true });
  addFormats(ajv);
  for (const format of ['password', 'binary', 'byte']) ajv.addFormat(format, true);
  validatorCache = ajv;
  return ajv;
}

/** The documented operation of a request: its path (with its {parameters}) and its method. */
function operationOf(doc, method, url) {
  const wanted = h.pathOf(url);
  const verb = String(method || 'get').toLowerCase();
  const paths = Object.keys(doc.paths || {});
  const pattern = (p) => new RegExp(`^${p.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[^}]+\\?\}/g, '[^/]+')}$`);
  const exact = paths.find((p) => p === wanted && doc.paths[p][verb]);
  const templated = exact || paths.find((p) => /\{/.test(p) && pattern(p).test(wanted) && doc.paths[p][verb]);
  return templated ? { path: templated, operation: doc.paths[templated][verb] } : null;
}

/**
 * The API's last answer has the shape the schema documents for its operation and its status: the body is checked
 * against the response schema of the documented operation (JSON Schema 2020-12, OpenAPI 3.1's dialect, with its
 * formats: uuid, date-time, email).
 *
 * Example #1: Then the API's answer should match its documented schema
 * Example #2: And the API's answer should match its documented schema
 * Example #3: But the API's answer should match its documented schema
 * Example #4: Then the API's answer should match its documented schema
 * Example #5: And the API's answer should match its documented schema
 *
 */
Then(/^the API's answer should match its documented schema$/, async function () {
  const answer = h.lastAnswer(this.page);
  const { doc, address } = await h.schema(this);
  const config = answer.config || {};
  const found = operationOf(doc, config.method, config.url);
  if (!found) {
    throw failure(this.page, `Expected ${h.requestLine(answer)} to be an operation of the API's schema, but the schema does not document it.`, {
      hint: `The schema is ${address}; an operation the app adds with include_in_schema=False is not in it.`,
    });
  }
  const responses = found.operation.responses || {};
  const status = String(answer.status);
  const documented = responses[status] || responses[`${status[0]}XX`] || responses.default;
  if (!documented) {
    throw failure(this.page, `Expected the API's schema to document the answer ${status} of ${h.requestLine(answer)}, but it documents ${Object.keys(responses).join(', ') || 'none'}.`, {
      hint: 'FastAPI documents a status an operation raises with HTTPException only when the app lists it in responses={…}.',
    });
  }
  const content = documented.content || {};
  const media = content['application/json'] || Object.values(content)[0];
  if (!media || !media.schema) return;
  const check = validator().compile({ ...media.schema, components: doc.components || {} });
  if (!check(answer.data)) {
    const errors = (check.errors || []).slice(0, 5).map((e) => `${e.instancePath || '(the answer)'} ${e.message}`);
    throw failure(this.page, `Expected the answer ${status} of ${h.requestLine(answer)} to match its documented schema, but it does not: ${errors.join('; ')}.`, {
      found: h.detailText(answer.data),
      hint: `The operation is ${String(config.method || '').toUpperCase()} ${found.path} in ${address}.`,
    });
  }
});

/**
 * The API's schema documents an operation: a method and a path as the schema writes it ("/api/v1/items/{id}").
 *
 * Example #1: Then the API should document "POST /api/v1/users/signup"
 * Example #2: Then the API should document "GET /api/v1/items/{id}"
 * Example #3: And the API should document "POST /api/v1/login/access-token"
 * Example #4: Then the API should document "DELETE /api/v1/users/{user_id}"
 * Example #5: And the API should document "PATCH /api/v1/users/me/password"
 *
 */
Then(/^the API should document "([A-Z]+) ([^"]+)"$/, async function (method, wanted) {
  const { doc, address } = await h.schema(this);
  const verbs = (doc.paths && doc.paths[wanted]) || null;
  if (verbs && verbs[method.toLowerCase()]) return;
  const near = Object.entries(doc.paths || {})
    .filter(([p]) => p.split('/').filter(Boolean).slice(-1)[0] === wanted.split('/').filter(Boolean).slice(-1)[0] || p === wanted)
    .map(([p, ops]) => Object.keys(ops).filter((k) => /^(get|put|post|delete|patch|head|options)$/.test(k)).map((k) => `${k.toUpperCase()} ${p}`).join(', '))
    .filter(Boolean);
  throw failure(this.page, `Expected the API's schema to document ${method} ${wanted}, but it does not.`, {
    found: verbs ? `${wanted}: ${Object.keys(verbs).map((k) => k.toUpperCase()).join(', ')}` : (near.length ? near.join('; ') : 'no such path'),
    hint: `Name the path as the schema writes it, with its {parameters}; the schema is ${address}.`,
  });
});

// ---------------------------------------------------------------------------
// @removes-test-content: the content a scenario makes is removed after it, and the counts checked
// ---------------------------------------------------------------------------

/** The entries of a list of the API, all of them, and the count it gives. */
async function listAll(world, list, headers) {
  const prefix = await h.apiPrefix(world);
  const where = `${prefix}${list.list}`.replace(/\/{2,}/g, '/');
  const answer = await h.request(world, 'GET', `${where}${where.includes('?') ? '&' : '?'}skip=0&limit=10000`, { headers });
  if (answer.status !== 200) {
    throw friendly({
      message: `@removes-test-content could not read the ${list.name} of the API (${where}): ${answer.status} ${h.detailText(answer.data)}.`,
      hint: 'Set worldParameters.fastapi.testContent in cucumber.js to the lists of this app, and the managing account (fastapi.manager) to one that may read them.',
    });
  }
  const data = answer.data;
  const entries = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
  const count = data && typeof data.count === 'number' ? data.count : entries.length;
  return { where, entries, count };
}

/** Is an entry content a scenario made? One of the list's fields matches its pattern. */
function isTestContent(list, entry) {
  return Object.entries(list.match || {}).some(([field, pattern]) => {
    const value = entry && entry[field];
    return typeof value === 'string' && new RegExp(pattern, 'i').test(value);
  });
}

Before({ tags: '@removes-test-content' }, async function () {
  const own = h.settings(this);
  const headers = await h.signed(this, own.manager);
  this.fastapiCounts = {};
  for (const list of own.testContent) {
    const { count } = await listAll(this, list, headers);
    this.fastapiCounts[list.name] = count;
  }
});

After({ tags: '@removes-test-content' }, async function () {
  if (!this.fastapiCounts) return;
  const own = h.settings(this);
  this.fastapiTokens = {};
  const headers = await h.signed(this, own.manager);
  const prefix = await h.apiPrefix(this);
  const problems = [];
  const removed = [];
  for (const list of own.testContent) {
    const { entries } = await listAll(this, list, headers);
    for (const entry of entries.filter((e) => isTestContent(list, e))) {
      const where = `${prefix}${String(list.remove).replace('{id}', encodeURIComponent(entry.id))}`.replace(/\/{2,}/g, '/');
      const answer = await h.request(this, 'DELETE', where, { headers });
      if (answer.status >= 400) problems.push(`removing ${where} was refused: ${answer.status} ${h.detailText(answer.data)}`);
      else removed.push(`${list.name}: ${entry.email || entry.title || entry.full_name || entry.id}`);
    }
    const { count } = await listAll(this, list, headers);
    const before = this.fastapiCounts[list.name];
    if (count !== before) problems.push(`the API has ${count} ${list.name} after the scenario and had ${before} before it`);
  }
  if (removed.length) process.stdout.write(`\n[fastapi-steps] @removes-test-content removed ${removed.join(', ')}.\n`);
  if (problems.length) {
    throw friendly({
      message: `@removes-test-content left the app other than it found it: ${problems.join('; ')}.`,
      hint: 'Name what a scenario makes "Webship test …" (an account: webship.test.…@example.com), so the run can find and remove it.',
    });
  }
});
