# Frontend design review gate

Review frontend work that changes a route or navigation, a loading, error, or empty state, or an interactive user flow. Record keyboard/focus checks on desktop and a narrow viewport. A reviewer different from its executor records a decision of `pass` or `fail`.

Backend-only work, test-only work, and documentation-only work are exempt.
Only the user may approve an exception. No code path, agent, task field, or timeout may grant an exception implicitly.

For an emergency, use rollback or the minimum hotfix, then complete the review
within 24 hours. An emergency exception cannot add a feature or redesign.
