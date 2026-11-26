@needs-javascript
Feature: The interactive API docs
  FastAPI draws them from the schema with Swagger UI, at /docs: they list the operations, sign in with the OAuth2
  password flow of their Authorize dialog, and try an operation out. ReDoc, at /redoc, lists them by their summaries.

  Scenario: The docs list the operations of the schema
    When I open the API docs
    Then the API docs should list "POST /api/v1/login/access-token"
    And the API docs should list "GET /api/v1/items/{id}"

  Scenario: Authorized, the docs read the account
    When I open the API docs
    And I authorize the API docs as "admin"
    And I try out "GET /api/v1/users/me" in the API docs
    Then the API docs should show the answer 200 saying "admin@example.com"

  # The API refuses the request (a 401), and the browser logs a refused request as a console error: the scenario
  # keeps webship-js's error mode at warn, so only the assertions under test can fail it.
  @js-warn
  Scenario: Not authorized, the docs show the API's refusal
    When I open the API docs
    And I try out "GET /api/v1/users/me" in the API docs
    Then the API docs should show the answer 401 saying "Not authenticated"

  # A 422, logged as a console error: warn, as above.
  @js-warn
  Scenario: Tried out with a short password, the docs show the refusal field by field
    When I open the API docs
    And I try out "POST /api/v1/users/signup" in the API docs with:
      """
      {"email": "webship.test.docs@example.com", "password": "short", "full_name": "Webship test docs"}
      """
    Then the API docs should show the answer 422 saying "String should have at least 8 characters"

  Scenario: ReDoc lists the operations by their summaries
    Given I am on "/redoc"
    Then I should see "Login Access Token"
