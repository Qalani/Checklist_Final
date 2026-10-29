import { Temporal } from 'temporal-polyfill';

export class CalendarTimezoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarTimezoneError';
  }
}

/** Register definitions before ICAL hydrates DTSTART/DTEND values. */
export function registerCalendarTimezones(component: any, ICAL: any): void {
  for (const definition of component.getAllSubcomponents('vtimezone') ?? []) {
    const tzid = definition.getFirstPropertyValue('tzid');
    if (typeof tzid !== 'string' || !tzid.trim()) {
      throw new CalendarTimezoneError('A calendar timezone definition is missing its TZID.');
    }
    ICAL.TimezoneService.register(tzid, new ICAL.Timezone({ component: definition }));
  }
}

/**
 * DATE values are canonical calendar dates stored at UTC midnight. Timed
 * values use their declared zone; floating times intentionally use the current
 * runtime's local timezone, as they do in the source calendar application.
 */
export function calendarTimeToDate(time: any, property?: any): Date {
  if (!time) throw new Error('The calendar event is missing a date.');
  const parts = {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour ?? 0,
    minute: time.minute ?? 0,
    second: time.second ?? 0,
  };

  if (time.isDate) {
    return new Date(Temporal.PlainDate.from(parts).toZonedDateTime('UTC').epochMilliseconds);
  }

  const declaredZone = property?.getParameter?.('tzid');
  const tzid = typeof declaredZone === 'string' && declaredZone.trim()
    ? declaredZone.trim()
    : time.zone?.tzid;

  if (!tzid || tzid === 'floating') {
    // ICAL implements floating DATE-TIME with the runtime's local Date zone.
    const local = time.toJSDate() as Date;
    if (!Number.isFinite(local.getTime())) throw new Error('The calendar event has an invalid date.');
    return local;
  }

  // Honor explicit VTIMEZONE definitions, including non-IANA identifiers. A
  // previous import's globally registered definition must not leak into this
  // file when the file itself provides no matching timezone definition.
  let calendar = property?.parent;
  while (calendar?.parent) calendar = calendar.parent;
  const definition = time.zone?.component;
  const hasCurrentDefinition = definition && time.zone.tzid === tzid &&
    (!calendar || definition.parent === calendar);
  if (hasCurrentDefinition) {
    const zoned = time.toJSDate() as Date;
    if (!Number.isFinite(zoned.getTime())) throw new Error('The calendar event has an invalid date.');
    return zoned;
  }

  try {
    const zone = tzid === 'Z' || tzid === 'GMT' ? 'UTC' : tzid;
    const zoned = Temporal.ZonedDateTime.from({ ...parts, timeZone: zone }, {
      overflow: 'reject',
      disambiguation: 'compatible',
    });
    return new Date(zoned.epochMilliseconds);
  } catch {
    throw new CalendarTimezoneError(
      `Unable to import timezone "${tzid}". Export the calendar with a VTIMEZONE definition or UTC times.`,
    );
  }
}
