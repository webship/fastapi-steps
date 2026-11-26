# Each scenario fails at its last step by design. They leave the demo as they found it: what they send, the API
# refuses or only reads.
@must-fail
Feature: Assertions on the API that must fail
  Each scenario asserts something that is not true of the demo's API, at its last step.

  Background:
    Given the API base URL is "/"

  Scenario: An account the users registry does not have
    Fails with: The user "nobody" is not in the users registry
    Given I am signed in to the API as "nobody"

  Scenario: A field the API did not name
    Fails with: Expected the API to have refused "full_name" with "required", but it did not name "full_name".
    When I send a POST request to "/api/v1/users/signup" with body:
      """
      {"email": "not-an-address", "password": "short"}
      """
    Then the API should have refused "full_name" with "required"

  Scenario: A field refused for another reason
    Fails with: Expected the API to have refused "password" with "at least 12 characters", but it said: "String should have at least 8 characters".
    When I send a POST request to "/api/v1/users/signup" with body:
      """
      {"email": "not-an-address", "password": "short"}
      """
    Then the API should have refused "password" with "at least 12 characters"

  Scenario: A field refusal where the API accepted the request
    Fails with: Expected the API to have refused "email" (a 422 naming the field), but GET /api/v1/utils/health-check/ was answered 200
    When I send a GET request to "/api/v1/utils/health-check/"
    Then the API should have refused "email" with "required"

  Scenario: Another reason than the API gave
    Fails with: Expected the API to have said "Inactive user", but POST /api/v1/login/access-token was answered 400: "Incorrect email or password".
    When I send a POST request to "/api/v1/login/access-token" with form data:
      """
      username=admin@example.com
      password=not-the-password
      """
    Then the API should have said "Inactive user"

  Scenario: A reason, when the API refused field by field
    Fails with: Expected the API to have said "required", but POST /api/v1/users/signup was refused field by field (422)
    When I send a POST request to "/api/v1/users/signup" with body:
      """
      {"email": "not-an-address", "password": "short"}
      """
    Then the API should have said "required"

  Scenario: An answer whose status the schema does not document
    Fails with: Expected the API's schema to document the answer 401 of GET /api/v1/users/me, but it documents 200.
    When I send a GET request to "/api/v1/users/me"
    Then the API's answer should match its documented schema

  Scenario: An answer to an address the schema does not have
    Fails with: Expected GET /api/v1/nope to be an operation of the API's schema, but the schema does not document it.
    When I send a GET request to "/api/v1/nope"
    Then the API's answer should match its documented schema

  Scenario: An operation the schema does not document
    Fails with: Expected the API's schema to document PUT /api/v1/users/signup, but it does not.
    Then the API should document "PUT /api/v1/users/signup"
