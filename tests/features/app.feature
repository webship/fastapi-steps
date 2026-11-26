@needs-javascript
Feature: The front end, as it uses the API
  The demo's front end (React, the official template's) keeps the API's token in the browser, calls the API from the
  page, and says what happened in toasts. The steps wait on its calls and read their answers; the views themselves
  are a front end's own.

  Scenario: Signed in, the app reads the account from the API
    Given I am signed in to the app as "admin"
    Then the app should have called "GET /api/v1/users/me"
    And the app's call should have been accepted
    And I should see "Welcome back, nice to see you again!"

  @removes-test-content
  Scenario: An item added through the app
    Given I am signed in to the app as "user"
    And I am on "/items"
    And I wait for the app's API calls to finish
    When I press "Add Item"
    And I fill in "Title" with "Webship test item from the app"
    And I press "Save"
    Then the app should have called "POST /api/v1/items/"
    And the app's call should have been accepted
    And the app should show the message "Item created successfully"
    And I wait for the app's messages to go

  Scenario: A title the app refuses before it sends anything
    Given I am signed in to the app as "user"
    And I am on "/items"
    And I wait for the app's API calls to finish
    When I press "Add Item"
    And I press "Save"
    Then the "Title" field should say "Title is required"

  # The API refuses the address (a 400), and the browser logs a refused request as a console error: the scenario
  # keeps webship-js's error mode at warn, so only the assertions under test can fail it.
  @js-warn
  Scenario: An address already taken, refused by the API with its reason
    Given I am signed in to the app as "admin"
    And I am on "/admin"
    And I wait for the app's API calls to finish
    When I press "Add User"
    And I fill in "Email" with "admin@example.com"
    And I fill in "password" with "Webship.test.123"
    And I fill in "confirm_password" with "Webship.test.123"
    And I press "Save"
    Then the app should have called "POST /api/v1/users/"
    And the app's call should have been refused with "The user with this email already exists"
    And the app should show the message "The user with this email already exists in the system"

  @removes-test-content
  Scenario: A sign-up the app takes, then its login page
    Given I am on "/signup"
    When I fill in "Full Name" with "Webship test sign-up"
    And I fill in "Email" with "webship.test.signup@example.com"
    And I fill in "Password" with "Webship.test.123"
    And I fill in "Confirm Password" with "Webship.test.123"
    And I press "Sign Up"
    Then the app should have called "POST /api/v1/users/signup"
    And the app's call should have been accepted

  # The API refuses the token (403 four times, the app's retries), logged as console errors: warn, as above.
  @js-warn
  Scenario: A wrong token sends the browser to the login page
    Given I am signed in to the app as "admin"
    And the local storage "access_token" is set to "not-a-token"
    When I am on "/settings"
    Then the app should have sent me to "/login" with a whole page load

  Scenario: An address the app does not know
    Given I am on "/does-not-exist"
    Then the app should show its not-found page

  Scenario: An address of the API opened in a browser gets the front end's not-found page
    Given I am on "/api/v1/nope"
    Then the app should show its not-found page
