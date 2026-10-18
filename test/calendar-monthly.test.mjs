import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsReminder } from '../public/assets/js/lib/calendar.js';

test('monthly reminders repeat, one-off reminders do not', () => {
  const now = new Date(2024, 0, 10);
  const monthly = icsReminder({ title: 'Check', description: 'x', days: 30, monthly: true, now });
  assert.match(monthly, /RRULE:FREQ=MONTHLY/);
  assert.match(monthly, /DTSTART;VALUE=DATE:20240209/);
  assert.doesNotMatch(icsReminder({ title: 'Check', description: 'x', now }), /RRULE/);
});
