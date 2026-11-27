<p align="center"><img src="https://raw.githubusercontent.com/webship/fastapi-steps/2.0.x/assets/logo.svg" alt="FastAPI logo" width="96"></p>

# fastapi-steps

Cucumber step definitions for FastAPI apps, for [webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser
automation harness built on Playwright and Cucumber-js.

A FastAPI app is an API first. It answers in JSON, describes every operation in an OpenAPI schema (the source of its
interactive docs), hands out a bearer token for a user name and a password (OAuth2's password flow), and refuses bad
input with a 422 whose `detail` names each field and the reason. A front end on it (the official full-stack
template's, among others) calls that API from the page and says what happened in messages. The steps work on all of
it, and wait on the app's own signals, never for a fixed time:

- **the API**, with no browser: signing in through the token address the schema declares, reading a refusal field by
  field, checking an answer against the schema the app documents, and the operations it documents. The requests are
  webship-js's own API steps (`When I send a POST request to "…" with body:`): this pack signs them and reads their
  answers;
- **the docs** (Swagger UI, at `/docs`): the operations they list, authorizing them with an account, trying an
  operation out and reading the answer they show. When the browser cannot reach the CDN Swagger UI comes from, the
  step says so plainly;
- **the front end, as it uses the API**: signed in with the API's token where the front end keeps it, the calls the
  page sends and their answers, the messages it shows (its toasts, any status or alert), the page it loads itself (a
  refused token sends the browser to the login page), its not-found page, and what a field says when the form refuses
  it. A front end's own views are its framework's pack's (Vue, Angular, Svelte, Next.js): no phrase here is close to
  theirs, so a FastAPI app with one of them loads both.

No step phrase names the framework: a scenario reads `Given I am signed in to the API as "admin"`, `Then the API should
have refused "password" with "at least 8 characters"` and `Then the app's call should have been accepted`.

## From nothing to a green run

The demo is the official full-stack FastAPI template, release 0.12.0, as it ships: its own image (bun builds the front
end, Python 3.14 runs FastAPI, which serves the API under `/api/v1` and the built front end), Postgres 18 and a mail
catcher, on Docker Compose.

```bash
git clone https://github.com/webship/fastapi-steps.git && cd fastapi-steps
npm ci
npx playwright install chromium

# The demo, with the passwords of its two accounts (any you like; the suite reads the same variables).
export FASTAPI_ADMIN_PASSWORD='choose-one' FASTAPI_USER_PASSWORD='choose-another'
bash .github/scripts/build-demo.sh        # the app on http://127.0.0.1:8501, its mail catcher on :8525

npx cucumber-js                           # the suite, with JavaScript
JAVASCRIPT=off CUCUMBER_TAGS='not @wip and not @must-fail and not @needs-javascript' npx cucumber-js   # without
npm run test:must-fail                    # the assertions that must fail, and fail with their message

bash .github/scripts/remove-demo.sh       # its containers, its volume, the image it built, demo-app/
```

The suite leaves the demo as it found it: run it twice and the second run passes the same way (CI does).

### On an app of your own

Point the suite at the app with `LAUNCH_URL`, name its accounts in `worldParameters.users` (passwords from the
environment), and set what the pack cannot read from the app in `worldParameters.fastapi` (see Settings). The schema,
the prefix of the API and the token address are read from the app itself.

### What the suite tests

- `tests/features/api.feature` (both lanes): signed in, `/users/me`; no token (401); a wrong password (400); a
  sign-up refused field by field (422); the schema's operations; an item made, changed and removed.
- `tests/features/docs.feature` (JavaScript): the operations listed; authorized and tried out (200); not authorized
  (401); a short password tried out (422); ReDoc's list.
- `tests/features/app.feature` (JavaScript): signed in; an item added (its call accepted, its message); a title
  refused before anything is sent; an address already taken (the call refused, the message); a sign-up; a wrong token
  sending the browser to the login page; the not-found page at an unknown address and at `/api/v1/nope`.
- `tests/must-fail/` (each lane its own): every check, made to fail on purpose, with the message and hint it gives.

## Requirements

- Node.js 24 or later.
- webship-js 2.0.19 or later (it reads a console message's address, and lets a pack sign its API steps).
- For the demo: Docker with Compose.

## Install

```bash
npm install --save-dev webship-js @webship-js/fastapi-steps
```

Add the pack's steps to the `require` of `cucumber.js`, after webship-js's own:

```js
require: [
  'node_modules/webship-js/tests/step-definitions/**/*.js',
  'node_modules/@webship-js/fastapi-steps/tests/step-definitions/**/*.js',
  'tests/step-definitions/**/*.js',
],
```

In the [Webship Workspace](https://github.com/webship/workspace), the Extra steps panel suggests a pack from what a
site's front page shows, following its redirects on the same host. It finds this pack from FastAPI's docs pages:
`/docs` or `/redoc` as FastAPI writes them, whose icon is FastAPI's. An app whose front page is, or sends to, one of
them is suggested. An app whose front page is its own front end, as the full-stack template's is, is not, so add the
pack by name there. The Workspace's FastAPI plugin adds it in the testing setup of an app of its builder.

## Quick start

```gherkin
Feature: The API and its front end

  Scenario: A sign-up refused field by field
    Given the API base URL is "/"
    When I send a POST request to "/api/v1/users/signup" with body:
      """
      {"email": "not-an-address", "password": "short"}
      """
    Then the API response code should be 422
    And the API should have refused "password" with "at least 8 characters"
    And the API's answer should match its documented schema

  Scenario: An item added through the app
    Given I am signed in to the app as "user"
    And I am on "/items"
    And I wait for the app's API calls to finish
    When I press "Add Item"
    And I fill in "Title" with "Webship test item"
    And I press "Save"
    Then the app should have called "POST /api/v1/items/"
    And the app's call should have been accepted
    And the app should show the message "Item created successfully"
```

## Test users

The scenarios name accounts by a handle, from `worldParameters.users` in `cucumber.js`:

| Handle | Account (the demo's) | Password from | What it is |
| --- | --- | --- | --- |
| `admin` | `admin@example.com` (`FASTAPI_ADMIN_USERNAME`) | `FASTAPI_ADMIN_PASSWORD` | the app's first superuser (`FIRST_SUPERUSER`); the managing account of `@removes-test-content` |
| `user` | `user@example.com` (`FASTAPI_USER_USERNAME`) | `FASTAPI_USER_PASSWORD` | a normal account, made through the API by `build-demo.sh` |

The suites make no account of their own and remove none, but one: a sign-up scenario makes a "Webship test …" account,
and `@removes-test-content` removes it after the scenario (see below).

## Settings

`worldParameters.fastapi` in `cucumber.js`; each has a default, read from the app where it can be:

| Setting | Default | What it is |
| --- | --- | --- |
| `docs` | `/docs` | the address of the interactive docs (FastAPI's `docs_url`) |
| `openapi` | read from the docs page, else `/openapi.json` | the address of the schema (the template moves it to `/api/v1/openapi.json`) |
| `apiPrefix` | the longest prefix the schema's paths share | the calls of the page the steps read (`/api/v1/`) |
| `tokenUrl` | the schema's OAuth2 password flow | where an account signs in |
| `tokenStorage` | `localStorage:access_token` | where the front end keeps its token (`sessionStorage:<key>` too) |
| `manager` | `admin` | the account that removes a scenario's test content |
| `testContent` | the template's accounts and items | what `@removes-test-content` removes: lists of the API (relative to its prefix), and the fields whose value marks a scenario's content |

### `@removes-test-content`

A scenario that makes something (a sign-up, an item added through the front end) names it "Webship test …" (an
account's address `webship.test.…@example.com`). With the tag, the managing account counts the app's accounts and items
before the scenario; after it, removes the test content through the API and checks the counts came back. A count that
did not come back fails the scenario, with what is left.

## How the steps find things and wait

- **The API's calls from the page**: a probe, put into every page before its own scripts, records each request the
  page sends with `fetch` or `XMLHttpRequest` (the template's client uses axios, over `XMLHttpRequest`): its method,
  address, status and, for a write or a refusal, the text of the answer. The steps keep the ones under the API's
  prefix. "Finished" is: none in flight, and none started for 250 ms (the template asks for a list again a moment
  after each change).
- **Documents**: each document the page loads is recorded, so a page the app loads itself (`window.location =
  "/login"`) is told from its router's change of address.
- **Messages**: read by role: the toaster's region ("Notifications …", Sonner's, the template's) and its items, and
  anything with the role status or alert, by their text.
- **Fields**: found by their label; what they say is their description (`aria-describedby`, `aria-errormessage`) with
  `aria-invalid="true"`.
- **The docs**: Swagger UI drawn (its script loaded, the operations listed); its dialogs and buttons by their names
  (the Authorize dialog's own button is named "Apply given OAuth2 credentials", its `aria-label`).
- **The schema**: read once a run; the token address from its `securitySchemes` (OAuth2's password flow); an answer
  checked against the response schema of its operation and status with ajv (JSON Schema 2020-12, OpenAPI 3.1's
  dialect, with its formats), which comes with webship-js.

### Notes on waits

- A refused token: the template's front end retries the refused call (four tries) before it loads its login page.
  `Then the app should have sent me to "/login" with a whole page load` waits for that on purpose (up to 30 s), and the
  log says so.
- Toasts stay a few seconds and cover the controls under them (the template's show at the bottom right):
  `When I wait for the app's messages to go` waits for them to leave before the next action.
- A browser that opens an address the app does not know gets the front end's page (200), and the front end says it was
  not found: `Then the app should show its not-found page` reads the page, never the status.

### Findings

Found while writing the steps; not reported upstream yet (the owner decides).

- **FastAPI's front-end fallback answers by the request's `Accept`.** `app.frontend()` (FastAPI 0.141) answers an
  address it does not know with the front end's `index.html` (200) when the request accepts `text/html`, and with 404
  `{"detail": "Not Found"}` otherwise. So an unknown address opened in a browser, `/api/v1/nope` included, gets the
  front end's not-found page with a 200, and a script gets the 404. The steps judge "not found" by the page.
- **`/vite.svg` answers 404 on every page.** The template's `index.html` links it as the favicon and its build does not
  ship it, so every page logs a console error. The suite keeps webship-js's error mode at fail and lets that one error
  through by its address alone (`worldParameters.javascript.ignore` in `cucumber.js`).
- **The menus of the rows (items, users) have no accessible name.** Their button (`aria-haspopup="menu"`) has no text
  and no label, so a person with a screen reader hears only "button", and a step cannot name it.
- **A password-reset link works more than once.** Within its 48 hours, the same link sets a new password again.
- **The docs load their scripts from a CDN.** `/docs` and `/redoc` load Swagger UI and ReDoc from cdn.jsdelivr.net,
  and the favicon from fastapi.tiangolo.com. A browser that cannot reach them gets an empty page (Swagger UI) with a
  page error ("SwaggerUIBundle is not defined").
- **Without JavaScript**, the front end's pages and `/docs` are empty (no `noscript`); `/redoc` says it needs
  JavaScript. The lane without JavaScript runs the API's scenarios.

## Steps

### `fastapi-api.steps.js` (5)

- `Given I am signed in to the API as "admin"`: signs the requests of webship-js's API steps that follow (and sets
  the placeholder `{{access_token}}`)
- `Then the API should have refused "password" with "at least 8 characters"`
- `Then the API should have said "Incorrect email or password"`
- `Then the API's answer should match its documented schema`
- `Then the API should document "POST /api/v1/users/signup"`

### `fastapi-docs.steps.js` (6)

- `When I open the API docs`
- `Then the API docs should list "POST /api/v1/login/access-token"`
- `When I authorize the API docs as "admin"`
- `When I try out "GET /api/v1/users/me" in the API docs`
- `When I try out "POST /api/v1/users/signup" in the API docs with:` and a JSON doc string
- `Then the API docs should show the answer 422` (and `… saying "String should have at least 8 characters"`)

### `fastapi-app.steps.js` (10)

- `Given I am signed in to the app as "admin"`
- `When I wait for the app's API calls to finish`
- `Then the app should have called "POST /api/v1/items/"`
- `Then the app's call should have been accepted`
- `Then the app's call should have been refused with "The user with this email already exists"`
- `Then the app should show the message "Item created successfully"`
- `When I wait for the app's messages to go`
- `Then the app should have sent me to "/login" with a whole page load`
- `Then the app should show its not-found page`
- `Then the "Title" field should say "Title is required"`

Each definition carries five examples in its JSDoc; `npm run test:examples` checks that each matches its own
definition only.

## Phrases shared with other packs

None. The phrases were checked both ways against webship-js 2.0.18 and the 61 packs published before this one: none
matches a definition of theirs, and none of their 23,597 example phrases matches one of these.

## FastAPI's own tests and this pack

The template ships a Playwright suite (MIT): login, sign-up, password recovery, the settings, items and the admin's
users. Its flows shaped the scenarios here: signing in and out, a wrong password, the fields a form refuses before it
sends anything, an address already taken, an item added and removed, a made-up reset token. Two of its habits are not
followed: its tests make accounts freely and leave them, and they read the reset link from the mail catcher. Here a
scenario makes an account only with `@removes-test-content`, and the reset flow is left to a project's own steps.

## Testing this package

```bash
npm run test:examples   # every example against its own definition, every feature step against one definition
npm run test:paths      # a feature named on the command line runs alone
npm run test:must-fail  # every assertion of tests/must-fail fails, with its message and a hint
```

CI runs them on Node.js 24, with the demo built in the job, in two lanes: a browser with JavaScript (every feature)
and one without (the API's), the suite twice in each, and the assertions that must fail.

## The demo

`.github/scripts/build-demo.sh` takes the template at its release 0.12.0 into `demo-app/`, writes its settings (a
secret key and a database password of its own, the accounts' passwords from the environment), builds the template's
image, starts Postgres 18 and the mail catcher (`.github/demo/compose.yml`, their images pinned by digest), runs the
template's `prestart.sh` (migrations, the first superuser), starts the app on `127.0.0.1:8501` with one worker, and
makes the normal account through the API. `remove-demo.sh` takes it all away but the images it pulled.

## License

MIT (see `LICENSE`).

## Logo

The FastAPI icon is from github.com/fastapi/full-stack-fastapi-template (MIT), `frontend/public/assets/images/fastapi-icon.svg`
of its release 0.12.0, unmodified. FastAPI is a registered trademark of its owner; this pack is not affiliated with or
endorsed by the FastAPI project. The icon is not covered by this package's licence.
