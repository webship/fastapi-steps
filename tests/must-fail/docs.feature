# Each scenario fails at its last step by design. Some get a refusal (401), and the one without the CDN gets a page
# error, which the browser logs as console errors: the feature keeps webship-js's error mode at warn so that only the
# assertion under test fails.
@must-fail @needs-javascript @js-warn
Feature: Assertions on the API docs that must fail
  Each scenario asserts something that is not true of the demo's API docs, at its last step.

  Scenario: The docs, when the browser cannot reach their CDN
    Fails with: The API docs did not load: their script comes from cdn.jsdelivr.net
    Given the URL "https://cdn.jsdelivr.net/**" is blocked
    When I open the API docs

  Scenario: An operation the docs do not list
    Fails with: Expected the API docs to list PUT /api/v1/users/signup, but they do not.
    When I open the API docs
    Then the API docs should list "PUT /api/v1/users/signup"

  Scenario: An answer read before any try-out
    Fails with: No operation was tried out in the API docs in this scenario.
    When I open the API docs
    Then the API docs should show the answer 200

  Scenario: Another answer than the docs show
    Fails with: Expected the API docs to show the answer 200 for GET /api/v1/users/me, but they show 401.
    When I open the API docs
    And I try out "GET /api/v1/users/me" in the API docs
    Then the API docs should show the answer 200

  Scenario: An answer that says something else
    Fails with: Expected the answer 401 the API docs show for GET /api/v1/users/me to say "Inactive user"
    When I open the API docs
    And I try out "GET /api/v1/users/me" in the API docs
    Then the API docs should show the answer 401 saying "Inactive user"
