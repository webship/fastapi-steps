Feature: The API, with no browser
  The demo's API (the official full-stack template's) answers in JSON, signs an account in with a bearer token,
  refuses bad input with a 422 that names each field, and documents every operation in its schema. These scenarios
  need no JavaScript: both lanes run them. The requests are webship-js's API steps; the pack signs them and reads
  their answers.

  Background:
    Given the API base URL is "/"

  Scenario: Signed in, the API knows the account
    Given I am signed in to the API as "admin"
    When I send a GET request to "/api/v1/users/me"
    Then the API response code should be 200
    And the JSON property "is_superuser" should be true
    And the API's answer should match its documented schema

  Scenario: Without a token, the API refuses and says why
    When I send a GET request to "/api/v1/users/me"
    Then the API response code should be 401
    And the API should have said "Not authenticated"

  Scenario: A wrong password, refused with its reason
    When I send a POST request to "/api/v1/login/access-token" with form data:
      """
      username=admin@example.com
      password=not-the-password
      """
    Then the API response code should be 400
    And the API should have said "Incorrect email or password"

  Scenario: A sign-up with no address and a short password, refused field by field
    When I send a POST request to "/api/v1/users/signup" with body:
      """
      {"email": "not-an-address", "password": "short", "full_name": "Webship test refused"}
      """
    Then the API response code should be 422
    And the API should have refused "email" with "not a valid email address"
    And the API should have refused "password" with "at least 8 characters"
    And the API's answer should match its documented schema

  Scenario: The schema documents the operations
    Then the API should document "POST /api/v1/login/access-token"
    And the API should document "POST /api/v1/users/signup"
    And the API should document "GET /api/v1/items/{id}"

  @removes-test-content
  Scenario: An item made, changed and removed through the API
    Given I am signed in to the API as "user"
    When I send a POST request to "/api/v1/items/" with body:
      """
      {"title": "Webship test item", "description": "Made by the API scenario"}
      """
    Then the API response code should be 200
    And the API's answer should match its documented schema
    When I save the JSON property "id" as placeholder "{{item}}"
    And I send a PUT request to "/api/v1/items/{{item}}" with body:
      """
      {"title": "Webship test item, changed"}
      """
    Then the API response code should be 200
    And the JSON property "title" should be "Webship test item, changed"
    When I send a DELETE request to "/api/v1/items/{{item}}"
    Then the API response code should be 200
    When I send a GET request to "/api/v1/items/{{item}}"
    Then the API response code should be 404
    And the API should have said "Item not found"
