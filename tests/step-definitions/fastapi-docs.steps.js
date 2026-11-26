'use strict';

// The interactive docs FastAPI draws from the app's schema (Swagger UI, at /docs unless the app moves it): opening
// them, the operations they list, authorizing them with an account (the OAuth2 password flow of their Authorize
// dialog), trying an operation out and reading its answer. They need JavaScript.
//
// Swagger UI's script and styles come from a CDN (FastAPI's default: cdn.jsdelivr.net). A browser that cannot reach
// it gets an empty page: the step that opens the docs says that, plainly, before anything else can be the failure.

const { When, Then } = require('@cucumber/cucumber');
const { failure, gotoUrl, pollPage } = require('webship-js/tests/step-definitions/webship');
const h = require('./fastapi-helpers');

/** The operation of the docs with a method and a path, as a locator. */
function operation(page, method, wanted) {
  return page.locator('.opblock').filter({
    has: page.locator(`.opblock-summary-method:text-is("${method}")`),
  }).filter({
    has: page.locator(`.opblock-summary-path[data-path="${wanted.replace(/"/g, '\\"')}"]`),
  }).first();
}

/** "POST /api/v1/login/access-token", one line per operation the docs list. */
async function listedOperations(page) {
  try {
    return await page.evaluate(() => [...document.querySelectorAll('.opblock')].map((o) => {
      const method = (o.querySelector('.opblock-summary-method') || {}).textContent || '';
      const p = o.querySelector('.opblock-summary-path');
      return `${method.trim()} ${p ? p.getAttribute('data-path') : ''}`;
    }));
  } catch (e) {
    return [];
  }
}

/** The docs page must be open and drawn: the steps after the first one read it. */
async function docsDrawn(world) {
  const page = world.page;
  const drawn = await pollPage(page, () => typeof window.SwaggerUIBundle === 'function' && !!document.querySelector('.swagger-ui .opblock'), null, 1000, 50);
  if (!drawn) {
    throw failure(page, 'The API docs are not open, or have not drawn their operations.', {
      hint: 'Open them first: When I open the API docs',
    });
  }
}

/**
 * Open the API docs (Swagger UI, `worldParameters.fastapi.docs`: /docs) and wait for them to draw the operations of
 * the schema. When their script did not load, the step says which host the browser could not reach.
 *
 * Example #1: When I open the API docs
 * Example #2: Given I open the API docs
 * Example #3: And we open the API docs
 * Example #4: When open the API docs
 * Example #5: Then I open the API docs
 *
 */
When(/^(?:I |we )?open the API docs$/, async function () {
  const page = this.page;
  const where = h.absolute(this, h.settings(this).docs);
  await gotoUrl(page, where);
  if (!(await h.scriptsRun(page))) {
    throw failure(page, 'The API docs need JavaScript, and this browser runs none.', {
      hint: 'Run the scenarios that use the docs in a browser with JavaScript; the API itself needs no browser.',
    });
  }
  const outcome = async () => page.evaluate(() => {
    if (typeof window.SwaggerUIBundle === 'function' && document.querySelector('.swagger-ui .opblock')) return 'drawn';
    if (document.readyState === 'complete' && typeof window.SwaggerUIBundle !== 'function') {
      const script = [...document.querySelectorAll('script[src]')].find((s) => /swagger-ui/i.test(s.src));
      return script ? `script:${script.src}` : 'no-script';
    }
    return '';
  }).catch(() => '');
  const deadline = Date.now() + h.WAIT.docs;
  let seen = '';
  while (Date.now() < deadline) {
    seen = await outcome();
    if (seen) break;
    await h.pause(100);
  }
  if (seen === 'drawn') return;
  if (seen.startsWith('script:')) {
    const src = seen.slice('script:'.length);
    let host = src;
    try { host = new URL(src).host; } catch (e) { /* as written */ }
    throw failure(page, `The API docs did not load: their script comes from ${host} (${src}), and this browser could not reach it.`, {
      hint: `Let the browser reach ${host}, or serve Swagger UI's files from the app (FastAPI's get_swagger_ui_html with swagger_js_url and swagger_css_url).`,
    });
  }
  throw failure(page, `The API docs at ${where} drew no operation in ${Math.round(h.WAIT.docs / 1000)} s.`, {
    found: seen === 'no-script' ? 'a page with no Swagger UI on it' : 'Swagger UI still drawing',
    hint: 'Set worldParameters.fastapi.docs in cucumber.js to the address of the docs (FastAPI\'s docs_url).',
  });
});

/**
 * The API docs list an operation: a method and a path as the schema writes it.
 *
 * Example #1: Then the API docs should list "POST /api/v1/login/access-token"
 * Example #2: Then the API docs should list "GET /api/v1/items/{id}"
 * Example #3: And the API docs should list "GET /api/v1/utils/health-check/"
 * Example #4: Then the API docs should list "PATCH /api/v1/users/me"
 * Example #5: But the API docs should list "DELETE /api/v1/items/{id}"
 *
 */
Then(/^the API docs should list "([A-Z]+) ([^"]+)"$/, async function (method, wanted) {
  await docsDrawn(this);
  if (await operation(this.page, method, wanted).count()) return;
  const listed = await listedOperations(this.page);
  const same = listed.filter((line) => line.endsWith(` ${wanted}`));
  throw failure(this.page, `Expected the API docs to list ${method} ${wanted}, but they do not.`, {
    found: same.length ? same.join(', ') : `${listed.length} operations, none at ${wanted}`,
    hint: 'Name the path as the docs show it, with its {parameters}.',
  });
});

/**
 * Authorize the API docs as an account of the users registry: their Authorize dialog's OAuth2 password flow, the
 * account's user name and password. Every operation tried out after it is sent with the account's token.
 *
 * Example #1: When I authorize the API docs as "admin"
 * Example #2: Given I authorize the API docs as "user"
 * Example #3: And we authorize the API docs as "editor"
 * Example #4: When authorize the API docs as "manager"
 * Example #5: And I authorize the API docs as "admin"
 *
 */
When(/^(?:I |we )?authorize the API docs as "([^"]+)"$/, async function (handle) {
  const page = this.page;
  await docsDrawn(this);
  const who = h.user(this, handle);
  const open = page.locator('.scheme-container .btn.authorize, .auth-wrapper .btn.authorize').first();
  if (!(await open.count())) {
    throw failure(page, 'The API docs have no Authorize button: the schema declares no way to sign in.', {
      hint: 'Give the app an OAuth2PasswordBearer(tokenUrl=…) dependency, or sign in through the API: Given I am signed in to the API as "…"',
    });
  }
  await open.click();
  const dialog = page.locator('.modal-ux');
  await dialog.waitFor({ state: 'visible', timeout: h.WAIT.docs });
  const username = dialog.locator('#oauth_username');
  if (!(await username.count())) {
    throw failure(page, 'The Authorize dialog of the API docs offers no user name and password (no OAuth2 password flow).', {
      hint: 'This step signs in with OAuth2\'s password flow, the one FastAPI\'s OAuth2PasswordBearer declares.',
    });
  }
  await username.fill(who.username);
  await dialog.locator('#oauth_password').fill(who.password);
  // The dialog's own button is named by its aria-label, not by the word it shows ("Authorize").
  await dialog.getByRole('button', { name: 'Apply given OAuth2 credentials' }).click();
  const deadline = Date.now() + h.WAIT.docs;
  let error = '';
  while (Date.now() < deadline) {
    if (await dialog.getByRole('button', { name: 'Remove authorization' }).count()) break;
    error = (await dialog.locator('.errors').allInnerTexts().catch(() => [])).join(' ').replace(/\s+/g, ' ').trim();
    if (error) break;
    await h.pause(100);
  }
  if (error) {
    await dialog.getByRole('button', { name: 'Close' }).last().click().catch(() => {});
    throw failure(page, `The API docs could not authorize "${handle}" (${who.username}): ${error}.`, {
      hint: `Check worldParameters.users.${handle} in cucumber.js, and that the account exists and is active.`,
    });
  }
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  await dialog.waitFor({ state: 'hidden', timeout: h.WAIT.docs }).catch(() => {});
});

/** Try an operation out: open it, "Try it out", the body when there is one, "Execute", and wait for the answer. */
async function tryOut(world, method, wanted, docString) {
  const page = world.page;
  await docsDrawn(world);
  const op = operation(page, method, wanted);
  if (!(await op.count())) {
    throw failure(page, `The API docs do not list ${method} ${wanted}, so it cannot be tried out.`, {
      found: (await listedOperations(page)).filter((line) => line.endsWith(` ${wanted}`)).join(', ') || `nothing at ${wanted}`,
      hint: 'Name the path as the docs show it, with its {parameters}.',
    });
  }
  if (!(await op.evaluate((o) => o.classList.contains('is-open')))) await op.locator('.opblock-summary').first().click();
  const tryOut = op.getByRole('button', { name: 'Try it out' });
  await tryOut.waitFor({ state: 'visible', timeout: h.WAIT.docs });
  await tryOut.click();
  if (typeof docString === 'string' && docString.trim()) {
    const body = op.locator('textarea.body-param__text');
    if (!(await body.count())) {
      throw failure(page, `${method} ${wanted} takes no JSON body in the API docs, and the step carries one.`, {
        hint: 'Leave the body out ("… in the API docs"), or try out an operation that takes one.',
      });
    }
    await body.fill(docString.trim());
  }
  await op.getByRole('button', { name: 'Execute' }).click();
  const deadline = Date.now() + h.WAIT.docs;
  while (Date.now() < deadline) {
    const loading = await op.locator('.loading-container').count().catch(() => 0);
    const status = await op.locator('.live-responses-table .response .response-col_status').first().innerText().catch(() => '');
    if (!loading && status.trim()) break;
    await h.pause(100);
  }
  world.fastapiDocsOperation = { method, path: wanted };
}

/**
 * Try an operation out in the API docs: open it, press "Try it out", press "Execute", and wait for the answer the
 * docs show. An operation with parameters in its path needs them in the docs' own fields first.
 *
 * Example #1: When I try out "GET /api/v1/users/me" in the API docs
 * Example #2: And we try out "GET /api/v1/utils/health-check/" in the API docs
 * Example #3: Then I try out "GET /api/v1/items/" in the API docs
 * Example #4: When we try out "POST /api/v1/login/test-token" in the API docs
 * Example #5: When try out "DELETE /api/v1/users/me" in the API docs
 *
 */
When(/^(?:I |we )?try out "([A-Z]+) ([^"]+)" in the API docs$/, async function (method, wanted) {
  await tryOut(this, method, wanted);
});

/**
 * Try an operation out in the API docs with a body: the JSON doc string after "with:" goes into the docs' body field
 * before "Execute".
 *
 * Example #1: When I try out "POST /api/v1/users/signup" in the API docs with:
 * Example #2: When I try out "POST /api/v1/items/" in the API docs with:
 * Example #3: And we try out "PATCH /api/v1/users/me" in the API docs with:
 * Example #4: When we try out "POST /api/v1/reset-password/" in the API docs with:
 * Example #5: Then I try out "PUT /api/v1/items/{id}" in the API docs with:
 *
 */
When(/^(?:I |we )?try out "([A-Z]+) ([^"]+)" in the API docs with:$/, async function (method, wanted, docString) {
  await tryOut(this, method, wanted, docString);
});

/**
 * The answer the API docs show for the operation tried out last: its status, and a text inside its body when the
 * step names one. Letter case and white space do not count.
 *
 * Example #1: Then the API docs should show the answer 200
 * Example #2: Then the API docs should show the answer 422 saying "String should have at least 8 characters"
 * Example #3: And the API docs should show the answer 401 saying "Not authenticated"
 * Example #4: Then the API docs should show the answer 400 saying "Incorrect email or password"
 * Example #5: And the API docs should show the answer 404
 *
 */
Then(/^the API docs should show the answer (\d{3})(?: saying "([^"]*)")?$/, async function (status, text) {
  const page = this.page;
  const tried = this.fastapiDocsOperation;
  if (!tried) {
    throw failure(page, 'No operation was tried out in the API docs in this scenario.', {
      hint: 'Try one out first: When I try out "GET /api/v1/…" in the API docs',
    });
  }
  const op = operation(page, tried.method, tried.path);
  // The status cell reads "401" and, under it, "Undocumented" when the schema does not document that status.
  const cell = await op.locator('.live-responses-table .response .response-col_status').first().innerText().catch(() => '');
  const shown = (String(cell).trim().match(/^\d{3}/) || [String(cell).trim()])[0];
  const body = (await op.locator('.live-responses-table .response-col_description pre').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (!shown.trim()) {
    throw failure(page, `The API docs show no answer for ${tried.method} ${tried.path}.`, {
      hint: 'The docs show an answer after Execute; an operation with required parameters needs them filled in first.',
    });
  }
  if (shown.trim() !== status) {
    throw failure(page, `Expected the API docs to show the answer ${status} for ${tried.method} ${tried.path}, but they show ${shown.trim()}.`, {
      found: body ? body.slice(0, 300) : '(an empty body)',
      hint: shown.trim() === '401' || shown.trim() === '403' ? 'Authorize the docs first: When I authorize the API docs as "…"' : 'The status is the one the API answered the docs\' request with.',
    });
  }
  if (text !== undefined && !h.normal(body).includes(h.normal(text))) {
    throw failure(page, `Expected the answer ${status} the API docs show for ${tried.method} ${tried.path} to say "${text}", but it says: ${body.slice(0, 300) || '(nothing)'}.`, {
      hint: 'The text is matched inside the body the docs show, letter case and white space aside.',
    });
  }
});
