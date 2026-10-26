# Frontend structure

Group code by responsibility, keeping components, styles, and tests close together.
Use shallow folders; small private helpers can stay in their caller's file.

| Location | Responsibility |
| --- | --- |
| `app/` | Connect pages, authentication, navigation, and shared solve actions |
| `timer/` | Practice settings, timer presentation, and the scramble-to-save workflow |
| `solves/` | Solve persistence, session/history data, and statistics |
| `session/` | Current-session history and chart |
| `account/`, `auth/` | Account dashboard and authentication |
| `index.css` | Global foundations, theme variables, and accessibility defaults |

## Where state lives

- `AppShell` stays mounted when pages change. It owns the view and theme,
  and connects authentication, navigation, and shared solve actions.
- `TimerPage` owns practice settings and calls `usePracticeSession`, which
  coordinates scrambling, timing, saving, and retrying. Hook state belongs
  to the calling component, **not** to its file, so practice resets when the
  page unmounts. The page reports phase and save state to App for shared
  styling and unsaved-result handling.
- The solve repository owns session and lifetime history. App creates one per
  account identity; the timer and account page use the same instance.
- `useAppNavigation` synchronizes App's selected view with browser history.
  App decides when authentication requires a redirect or a practice reset.

Profile edits preserve practice. Leaving the timer page unmounts practice;
identity changes remount it with a new key and clear the current session.
Clearing the session does not delete saved account history. These are product
rules, not reasons to introduce a generic state-management framework.

## Follow one action

```text
Space → useTimer → usePracticeSession → onSave → repository.create
                                     → next scramble, or retain solve for retry
```

For a deletion, App updates the repository. `TimerPage` observes the updated
solves and asks practice to forget the displayed result if it is no longer
present and no save is pending. The same check handles clearing the session.

## Read and test

Start with `app/App.tsx`, then follow the relevant component or hook.
`timer/TimerPage.tsx` composes practice settings, the timer display, and the
session panel; `timer/usePracticeSession.ts` owns the scramble-to-save workflow.

`app/tests/` covers feature interactions; feature-local tests cover focused
behavior. `web/e2e/` checks real browser navigation, keyboard input, and dialogs.
Styles live beside their components but remain ordinary, globally scoped CSS.

References: [React's archived file-structure guidance](https://legacy.reactjs.org/docs/faq-structure.html),
[colocation](https://kentcdodds.com/blog/colocation), and
[React state preservation](https://react.dev/learn/preserving-and-resetting-state).
