# Frontend design-review gate

status: approved policy, version 1
decision owner: user
scope owner: delivery coordinator

## Purpose and boundary

This gate applies to a delivery change that changes what a person sees, can
reach, or can do in Life OS. It makes the review input and the independent
decision traceable in the existing delivery task record; it does not create a
schedule, notification, automatic approval, or product mutation.

The gate applies when a change affects any of the following:

- route or navigation;
- component, layout, interaction, loading, error, or empty state;
- accessibility, responsive layout, design token, or global CSS;
- text that changes the meaning of an action, error, or consent.

Backend-only work, test-only work, and a refactor with no changed rendered
output are exempt. An exemption is a classification, not a way to bypass a
review for a UI change.

## Required review record

Before a UI delivery moves to `waiting_for_review`, its task record must link
an append-only review record with these fields:

```json
{
  "schema_version": 1,
  "task_id": "delivery task id",
  "change_class": "ui | exempt | emergency",
  "changed_surfaces": ["route, component, or state"],
  "evidence_refs": ["task-linked reproducible evidence"],
  "reviewer": "independent design reviewer",
  "decision": "pass | fail",
  "findings": ["actionable finding, or empty only for pass"],
  "reviewed_at": "ISO-8601 timestamp"
}
```

For every UI change, `evidence_refs` identify the changed states and an
observation before and after the change. Route, navigation, form, error,
accessibility, or responsive changes additionally record a reproducible
scenario and keyboard/focus checks on desktop and a narrow viewport. A
visual or critical user path also needs an explicit reviewer pass or findings.

The task's existing `verification` field stores the independent outcome and
links this review record. Personal text, credentials, raw browser input, and
raw transcripts are forbidden in the record.

## Lifecycle integration

1. The executor classifies the delivery as `ui` or `exempt` and records why.
2. A UI delivery supplies the required evidence and enters
   `waiting_for_review` with a reviewer different from its executor.
3. An independent design reviewer records `pass` or `fail`.
4. `pass` supplies the independent verification evidence required before
   `done`; `fail` returns the delivery to `backlog` with its actionable
   findings. Neither result changes product data, ownership, or priority.
5. An exempt delivery still follows its normal verification contract; it does
   not fabricate UI evidence.

## User-only exception

Only the user may approve an exception for a UI change. The append-only
exception record must name the decision owner, reason, exact scope, expiry,
and mandatory post-review. No code path, agent, task field, or timeout may grant an exception implicitly.

## Emergency boundary

Emergency scope is limited to a rollback or the minimum hotfix needed to
prevent harm or a broken user path. It cannot add a feature or redesign. The
record names the owner, reason, exact scope, and review deadline; the
independent review must happen within 24 hours. Failure to review on time is a
visible unresolved gate, not an automatic pass.

## Verification scenarios

1. A navigation/error/responsive UI delivery has changed-state evidence,
   scenario, desktop and narrow-viewport keyboard/focus checks, and an
   independent decision.
2. A backend-only, test-only, or non-UI refactor is classified exempt without
   pretending that it received a design review.
3. A failed review has actionable findings and returns the delivery to
   `backlog` rather than `done`.
4. An exception without the user's decision, scope, expiry, and post-review is
   invalid.
5. An emergency feature or redesign is rejected; a rollback/minimal hotfix
   carries a review deadline no later than 24 hours.
