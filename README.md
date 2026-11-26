# fastapi-steps

Cucumber step definitions for FastAPI apps, for [webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser
automation harness built on Playwright and Cucumber-js.

A FastAPI app is an API first: it answers in JSON, documents itself in its interactive API docs, signs users in with
a token, and refuses bad input with an answer that names each field and the reason. Its official full-stack template
puts a browser front end on top of that API. The steps work on both sides, the app's pages and its API, and wait on
its requests and its forms, never for a fixed time. No step phrase names the framework.

The steps, their features, the sample app and CI come with the first release, `2.0.0`.

## License

MIT (see `LICENSE`).

## Logo

The logo of this pack is pending the owner's decision: it comes before the first release.
