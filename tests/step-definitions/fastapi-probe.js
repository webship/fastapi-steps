'use strict';

// The page side of the pack: put into every page before the page's own scripts (fastapi-helpers.js does it), it
// installs `window.__webshipFastapi`.
//
// It records the requests the page sends with fetch or XMLHttpRequest (a front end on a FastAPI app sends its calls
// to the API that way: the official template's client uses axios, over XMLHttpRequest), each with its method, its
// address, its status, when it started and ended and, for a write or a refusal, the text of the answer. The steps on
// the Node side keep the ones under the API's prefix. It also gives each document an id, so a step tells a whole
// page load (the app's `window.location = "/login"`) from the router's change of address.
//
// Not a step file: it registers no step definitions. `apiProbe` is a plain function, serialised into the page.

function apiProbe() {
  if (window.__webshipFastapi) return;
  const now = () => performance.now();
  const state = {
    doc: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    seq: 0,
    calls: [],
  };

  // A call of the page: answered when `end` is set. The answer's text is kept for a write or a refusal (the steps
  // read FastAPI's `detail` from it), never for a read that worked.
  const track = (url, method) => {
    const call = { seq: (state.seq += 1), url, method, status: 0, start: now(), end: 0, body: '' };
    state.calls.push(call);
    if (state.calls.length > 300) state.calls.shift();
    return (status, read) => {
      if (call.end) return;
      call.status = status;
      call.end = now();
      if ((method !== 'GET' || status >= 400 || status < 0) && typeof read === 'function') {
        try {
          const text = read();
          if (typeof text === 'string') call.body = text.slice(0, 4000);
        } catch (e) { /* an answer with no text */ }
      }
    };
  };
  const absolute = (url) => {
    try { return new URL(String(url), location.href).href; } catch (e) { return String(url); }
  };

  if (window.fetch) {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function fetch(input, init) {
      let url = '';
      let method = 'GET';
      try {
        url = absolute(typeof input === 'string' || input instanceof URL ? input : input.url);
        method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) { /* an address the page itself will refuse */ }
      const done = track(url, method);
      return nativeFetch(input, init).then((response) => {
        if (method !== 'GET' || response.status >= 400) {
          response.clone().text().then((text) => done(response.status, () => text), () => done(response.status));
        } else {
          done(response.status);
        }
        return response;
      }, (error) => { done(-1); throw error; });
    };
  }
  if (window.XMLHttpRequest) {
    const open = XMLHttpRequest.prototype.open;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__webshipFastapi = { method: String(method || 'GET').toUpperCase(), url: absolute(url) };
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const meta = this.__webshipFastapi || { method: 'GET', url: '' };
      const done = track(meta.url, meta.method);
      this.addEventListener('loadend', () => done(this.status || -1, () => (this.responseType === '' || this.responseType === 'text' ? this.responseText : '')));
      return send.apply(this, arguments);
    };
  }

  window.__webshipFastapi = {
    doc: () => state.doc,
    seq: () => state.seq,
    calls: (since) => state.calls.filter((c) => c.seq > (since || 0)).map((c) => ({ ...c })),
    now,
    where: () => ({ doc: state.doc, url: location.href, path: `${location.pathname}${location.search}`, ready: document.readyState, now: now() }),
  };
}

module.exports = { apiProbe };
