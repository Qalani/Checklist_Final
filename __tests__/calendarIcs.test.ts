/** @jest-environment node */
import { calendarTimeToDate, CalendarTimezoneError, registerCalendarTimezones } from '@/features/calendar/ics';

const ICAL = require('ical.js');

function calendar(lines: string[]) {
  return new ICAL.Component(ICAL.parse([
    'BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR',
  ].join('\r\n')));
}

function start(component: any) {
  const property = component.getFirstSubcomponent('vevent').getFirstProperty('dtstart');
  return calendarTimeToDate(property.getFirstValue(), property);
}

function eventLine(value: string) {
  return ['BEGIN:VEVENT', 'UID:test', value, 'END:VEVENT'];
}

beforeEach(() => ICAL.TimezoneService.reset());

describe('calendar ICS date conversion', () => {
  it.each([
    ['20260721T090000', '2026-07-21T08:00:00.000Z'],
    ['20260121T090000', '2026-01-21T09:00:00.000Z'],
  ])('resolves Europe/London %s using its seasonal offset', (localTime, expected) => {
    const component = calendar(eventLine(`DTSTART;TZID=Europe/London:${localTime}`));
    const property = component.getFirstSubcomponent('vevent').getFirstProperty('dtstart');
    // ICAL itself falls back to floating when no VTIMEZONE is embedded.
    expect(property.getFirstValue().zone.tzid).toBe('floating');
    expect(start(component).toISOString()).toBe(expected);
  });

  it('preserves explicitly UTC event times', () => {
    expect(start(calendar(eventLine('DTSTART:20260721T090000Z'))).toISOString()).toBe('2026-07-21T09:00:00.000Z');
  });

  it('keeps all-day DATE values at UTC midnight in every device timezone', () => {
    expect(start(calendar(eventLine('DTSTART;VALUE=DATE:20261029'))).toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });

  it('interprets an intentionally floating time in the current runtime timezone', () => {
    const result = start(calendar(eventLine('DTSTART:20260721T090000')));
    expect(result.toISOString()).toBe(new Date(2026, 6, 21, 9).toISOString());
  });

  it('uses an embedded VTIMEZONE definition for a custom timezone', () => {
    const component = calendar([
      'BEGIN:VTIMEZONE', 'TZID:Custom/Office',
      'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0230', 'TZOFFSETTO:+0230', 'END:STANDARD',
      'END:VTIMEZONE', ...eventLine('DTSTART;TZID=Custom/Office:20261029T090000'),
    ]);
    registerCalendarTimezones(component, ICAL);
    expect(start(component).toISOString()).toBe('2026-10-29T06:30:00.000Z');
  });

  it('rejects unknown timezones instead of silently treating them as floating', () => {
    const component = calendar(eventLine('DTSTART;TZID=Unknown/Office:20261029T090000'));
    expect(() => start(component)).toThrow(CalendarTimezoneError);
    expect(() => start(component)).toThrow('Unknown/Office');
  });

  it('does not reuse a custom timezone definition from a previous uploaded file', () => {
    const component = calendar([
      'BEGIN:VTIMEZONE', 'TZID:Custom/Office',
      'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0230', 'TZOFFSETTO:+0230', 'END:STANDARD',
      'END:VTIMEZONE', ...eventLine('DTSTART;TZID=Custom/Office:20261029T090000'),
    ]);
    registerCalendarTimezones(component, ICAL);
    expect(start(component).toISOString()).toBe('2026-10-29T06:30:00.000Z');

    const nextFile = calendar(eventLine('DTSTART;TZID=Custom/Office:20261029T090000'));
    expect(() => start(nextFile)).toThrow(CalendarTimezoneError);
  });
});
