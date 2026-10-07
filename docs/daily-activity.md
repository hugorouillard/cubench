# Daily activity

## Data and calendar rules

- Activity is grouped by `recorded_at` in the browser's local timezone. Changing timezone can change which day an attempt belongs to; days are not based on account creation timestamps or UTC date slicing.
- Every recorded attempt counts, including DNFs and +2 penalties. Duration analytics exclude DNFs and apply +2.
- Date keys are local `YYYY-MM-DD` calendar dates. Calendar iteration uses local noon and calendar arithmetic, not fixed 24-hour timestamp increments. Streaks use local-day ordinals to remain consecutive across DST.
- Ranges are inclusive. A calendar year ends on December 31, or today for the current year. Padding and future days are not activity cells.
- “Last 12 months” means the day after last year's anniversary through today. The anniversary is clamped to February 28 when today is February 29; the resulting range starts on March 1, not March 2.
- Available years cover account creation and the earliest recorded attempt, whichever is earlier, through this year. Backdated/imported attempts remain accessible.
- Current streaks remain active through yesterday. Activity summaries exclude future-dated days, so an incorrect future timestamp cannot interrupt today's streak or inflate the longest streak.
- `useToday` refreshes at local midnight and on focus/returning to a visible tab. Account summary and calendar share that date; personal bests are memoized independently.

## Intensity and viewport

- Empty days always use level zero. The other four colours are relative to **active days in the selected period**, not all days in the calendar.
- Thresholds use a 10%-trimmed active-day mean at 0.5×, 1×, and 1.5×. Bounds are positive, strictly increasing integers. This avoids collapsing sparse histories into the strongest colour while retaining the existing adaptive scale. Colours are not absolute comparisons between different periods.
- The viewport starts at the latest week on mount and deliberate range changes. Penalty edits, deletions, midnight refreshes, and unrelated renders preserve the user's scroll position.
- Deleting the last solve in a selected historical year keeps that year selectable until the user changes ranges.

## Ownership

- `web/src/dates/`: local-calendar primitives and the reactive clock.
- `web/src/solves/activity.ts`: daily aggregation and activity summaries, without presentation labels.
- `web/src/account/activityCalendar.ts`: pure range/layout and intensity calculations.
- `web/src/account/DailyActivityChart.tsx`: chart presentation and interaction.

The API still returns full solve history because progression, records, and recent solves consume it. A daily-aggregate endpoint should be considered together with pagination/server-side account analytics, not introduced as a second data source just for this chart. Any future endpoint must preserve the explicit timezone and attempt-counting rules above.
