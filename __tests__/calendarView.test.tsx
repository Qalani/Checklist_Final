/** @jest-environment-options {"customExportConditions":["node","node-addons"]} */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FullCalendar from '@fullcalendar/react';
import type { EventDropArg } from '@fullcalendar/core';
import { FullCalendarView, type CalendarViewEvent, type CalendarViewProps } from '@/components/calendar/FullCalendarView';

jest.mock('@/components/calendar/fullcalendar.css', () => ({}));

const date = new Date(2026, 9, 29, 12);
const event: CalendarViewEvent = {
  id: 'event-1',
  entityId: '1',
  type: 'event',
  title: 'Planning session',
  start: new Date(2026, 9, 29, 10).toISOString(),
  end: new Date(2026, 9, 29, 11).toISOString(),
  allDay: false,
  scope: 'personal',
  metadata: { eventId: '1', canEdit: true },
  backgroundColor: '#2d8e7c',
  borderColor: '#2d8e7c',
  textColor: '#ffffff',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function render(props: Partial<CalendarViewProps> = {}) {
  await act(async () => root.render(<FullCalendarView
    events={[event]} view="dayGridMonth" date={date} onDatesChange={jest.fn()} {...props}
  />));
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((item) =>
    item.getAttribute('aria-label') === name || item.textContent?.trim() === name);
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

function eventElement(): HTMLElement {
  const element = container.querySelector<HTMLElement>('.calendar-event[role="button"]');
  if (!element) throw new Error('Missing calendar event');
  return element;
}

describe('calendar view integration', () => {
  it('navigates months with a heading and range that agree', async () => {
    const onDatesChange = jest.fn();
    await render({ onDatesChange });
    expect(container.querySelector('h2')?.textContent).toBe('October 2026');

    await act(async () => buttonNamed('Next period').click());
    expect(container.querySelector('h2')?.textContent).toBe('November 2026');
    expect(onDatesChange).toHaveBeenLastCalledWith(expect.objectContaining({
      view: 'dayGridMonth', currentDate: expect.any(Date),
    }));
    expect(onDatesChange.mock.calls.at(-1)?.[0].currentDate.getMonth()).toBe(10);

    await act(async () => buttonNamed('Previous period').click());
    expect(container.querySelector('h2')?.textContent).toBe('October 2026');
  });

  it('switches to an agenda that preserves the selected week and opens events', async () => {
    const onEventClick = jest.fn();
    const onDatesChange = jest.fn();
    await render({ onEventClick, onDatesChange });

    await act(async () => buttonNamed('Agenda').click());
    expect(buttonNamed('Agenda').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.fc-listWeek-view')).not.toBeNull();
    expect(onDatesChange.mock.calls.at(-1)?.[0].view).toBe('listWeek');
    expect(eventElement().textContent).toContain('Planning session');

    await act(async () => eventElement().click());
    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: event.id, title: event.title }));
  });

  it('jumps to the chosen date and reports the new period', async () => {
    const onDatesChange = jest.fn();
    await render({ onDatesChange });
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Jump to date"]')!;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2027-02-17');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.querySelector('h2')?.textContent).toBe('February 2027');
    expect(input.value).toBe('2027-02-17');
    const nextDate = onDatesChange.mock.calls.at(-1)?.[0].currentDate as Date;
    expect([nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()]).toEqual([2027, 1, 17]);
  });

  it.each(['dayGridMonth', 'listWeek'] as const)('opens the latest event details with keyboard activation after an update in %s', async (view) => {
    const onEventClick = jest.fn();
    await render({ view, onEventClick });
    const updated = { ...event, title: 'Updated planning session', description: 'Updated details' };
    await render({ view, events: [updated], onEventClick });

    expect(eventElement().textContent).toContain(updated.title);
    expect(eventElement().getAttribute('aria-label')).toContain(updated.title);
    for (const key of ['Enter', ' ']) {
      onEventClick.mockClear();
      await act(async () => {
        eventElement().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
      expect(onEventClick).toHaveBeenCalledTimes(1);
      expect(onEventClick).toHaveBeenLastCalledWith(expect.objectContaining({ title: updated.title, description: updated.description }));
    }
  });

  it('keeps persisted UTC all-day dates stable across devices and excludes the end date', async () => {
    const allDayEvent = {
      ...event,
      title: 'Two day retreat',
      start: '2026-10-29T00:00:00.000Z',
      end: '2026-10-31T00:00:00.000Z',
      allDay: true,
    };
    await render({ events: [allDayEvent], view: 'timeGridDay', date: new Date(2026, 9, 29, 12) });
    expect(eventElement().textContent).toContain(allDayEvent.title);

    await render({ events: [allDayEvent], view: 'timeGridDay', date: new Date(2026, 9, 30, 12) });
    expect(eventElement().textContent).toContain(allDayEvent.title);

    await render({ events: [allDayEvent], view: 'timeGridDay', date: new Date(2026, 9, 31, 12) });
    expect(container.querySelector('.calendar-event')).toBeNull();
  });

  it('keeps note activity on its local day', async () => {
    const note = {
      ...event,
      type: 'note' as const,
      title: 'Note updated',
      start: new Date(2026, 9, 29).toISOString(),
      end: new Date(2026, 9, 30).toISOString(),
      allDay: true,
    };
    await render({ events: [note], view: 'timeGridDay', date: new Date(2026, 9, 29, 12) });
    expect(eventElement().textContent).toContain(note.title);
    await render({ events: [note], view: 'timeGridDay', date: new Date(2026, 9, 30, 12) });
    expect(container.querySelector('.calendar-event')).toBeNull();
  });

  it('saves moved all-day dates as UTC midnight with the latest event record', async () => {
    let calendar: FullCalendar | undefined;
    const actualRender = FullCalendar.prototype.render;
    jest.spyOn(FullCalendar.prototype, 'render').mockImplementation(function (this: FullCalendar) {
      calendar = this;
      return actualRender.call(this);
    });
    const onEventMove = jest.fn().mockResolvedValue(undefined);
    const allDayEvent = {
      ...event,
      start: '2026-10-29T00:00:00.000Z',
      end: '2026-10-31T00:00:00.000Z',
      allDay: true,
    };
    await render({ events: [allDayEvent], onEventMove });
    const updated = { ...allDayEvent, title: 'Updated retreat' };
    await render({ events: [updated], onEventMove });
    const api = calendar!.getApi();
    const movedEvent = api.getEventById(event.id)!;
    const revert = jest.fn();
    await act(async () => {
      movedEvent.setDates(new Date(2026, 10, 1), new Date(2026, 10, 3), { allDay: true });
      await api.getOption('eventDrop')!({ event: movedEvent, revert } as unknown as EventDropArg);
    });
    expect(onEventMove).toHaveBeenCalledTimes(1);
    const [record, start, end, allDay] = onEventMove.mock.calls[0];
    expect(record.title).toBe(updated.title);
    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(allDay).toBe(true);
    expect(revert).not.toHaveBeenCalled();
  });
});
