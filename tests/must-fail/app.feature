# Each scenario fails at its last step by design. Some get a refusal (400), which the browser logs as a console
# error: the feature keeps webship-js's error mode at warn so that only the assertion under test fails. They leave
# the demo as they found it: what they send, the app or the API refuses.
@must-fail @needs-javascript @js-warn
Feature: Assertions on the front end that must fail
  Each scenario asserts something that is not true of the demo's front end, at its last step.

  Scenario: A call the app did not make
    Fails with: Expected the app to have called DELETE /api/v1/users/me, but it did not.
    Given I am signed in to the app as "user"
    Then the app should have called "DELETE /api/v1/users/me"

  Scenario: A refused call, read as accepted
    Fails with: Expected the app's call POST /api/v1/users/ to have been accepted, but the API answered 400: "The user with this email already exists in the system."
    Given I am signed in to the app as "admin"
    And I am on "/admin"
    And I wait for the app's API calls to finish
    When I press "Add User"
    And I fill in "Email" with "admin@example.com"
    And I fill in "password" with "Webship.test.123"
    And I fill in "confirm_password" with "Webship.test.123"
    And I press "Save"
    And the app should have called "POST /api/v1/users/"
    Then the app's call should have been accepted

  Scenario: A call refused for another reason
    Fails with: to have been refused with "Inactive user", but the API said (400): "The user with this email already exists in the system."
    Given I am signed in to the app as "admin"
    And I am on "/admin"
    And I wait for the app's API calls to finish
    When I press "Add User"
    And I fill in "Email" with "admin@example.com"
    And I fill in "password" with "Webship.test.123"
    And I fill in "confirm_password" with "Webship.test.123"
    And I press "Save"
    And the app should have called "POST /api/v1/users/"
    Then the app's call should have been refused with "Inactive user"

  Scenario: An accepted call, read as refused
    Fails with: Expected the app's call GET /api/v1/users/me to have been refused with "Not authenticated", but the API accepted it (200).
    Given I am signed in to the app as "user"
    And the app should have called "GET /api/v1/users/me"
    Then the app's call should have been refused with "Not authenticated"

  Scenario: A message the app does not show
    Fails with: Expected the app to show the message "Item created successfully", but it did not in 10 s.
    Given I am signed in to the app as "user"
    Then the app should show the message "Item created successfully"

  Scenario: A page the app did not load itself
    Fails with: Expected the app to have sent the browser to /login with a whole page load in 30 s, but it is at /items.
    Given I am signed in to the app as "user"
    And I am on "/items"
    Then the app should have sent me to "/login" with a whole page load

  Scenario: A page that was found
    Fails with: Expected the app to show its not-found page, but the page does not say "not found" or 404.
    Given I am signed in to the app as "user"
    Then the app should show its not-found page

  Scenario: A field the app did not refuse
    Fails with: Expected the "Title" field to say "Title is required", but it is not marked invalid.
    Given I am signed in to the app as "user"
    And I am on "/items"
    And I wait for the app's API calls to finish
    When I press "Add Item"
    Then the "Title" field should say "Title is required"

  Scenario: A field refused for another reason
    Fails with: Expected the "Title" field to say "Title is too long", but it says "Title is required".
    Given I am signed in to the app as "user"
    And I am on "/items"
    And I wait for the app's API calls to finish
    When I press "Add Item"
    And I press "Save"
    Then the "Title" field should say "Title is too long"
