import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarEventDetails, CalendarEventForm, formatEventTime } from '@/components/calendar/CalendarEventDialog';
import type { CalendarEventRecord } from '@/features/calendar/types';

const event: CalendarEventRecord = {
  id: 'event-calendar-1',
  entityId: 'calendar-1',
  type: 'event',
  title: 'Planning session',
  description: 'Bring the project notes.',
  start: new Date(2026, 9, 29, 10, 0).toISOString(),
  end: new Date(2026, 9, 29, 11, 0).toISOString(),
  allDay: false,
  scope: 'personal',
  metadata: { eventId: 'calendar-1', canEdit: true, location: 'Studio' },
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

async function render(element: React.ReactElement) {
  await act(async () => root.render(element));
}

function inputFor(labelText: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...container.querySelectorAll('label')].find((item) => item.textContent?.trim().startsWith(labelText));
  if (!label) throw new Error(`Missing field label: ${labelText}`);
  const field = label.htmlFor
    ? document.getElementById(label.htmlFor)
    : label.querySelector('input, textarea');
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing input for: ${labelText}`);
  }
  return field;
}

async function setValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submit() {
  const form = container.querySelector('form');
  if (!form) throw new Error('Missing event form');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function buttonNamed(text: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe('calendar event form', () => {
  it('populates the editable details of an existing event', async () => {
    await render(<CalendarEventForm event={event} onClose={jest.fn()} onSave={jest.fn()} />);

    expect(inputFor('Title').value).toBe('Planning session');
    expect(inputFor('Location').value).toBe('Studio');
    expect(inputFor('Description').value).toBe('Bring the project notes.');
    expect(inputFor('Start date').value).toBe('2026-10-29');
    expect(inputFor('Start time').value).toBe('10:00');
    expect(inputFor('End time').value).toBe('11:00');
  });

  it('rejects an end time before the start without calling persistence', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<CalendarEventForm event={event} onClose={jest.fn()} onSave={onSave} />);

    await setValue(inputFor('End time'), '09:00');
    await submit();

    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('End time must be after the start time.');
    expect(inputFor('End time').value).toBe('09:00');
  });

  it('saves all selected calendar days with an exclusive end date', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<CalendarEventForm
      initial={{ start: new Date(2026, 9, 29), end: new Date(2026, 9, 30), allDay: true }}
      onClose={jest.fn()} onSave={onSave}
    />);

    expect(inputFor('End date').value).toBe('2026-10-29');
    expect(container.querySelector('input[type="time"]')).toBeNull();
    await setValue(inputFor('Title'), 'Two day retreat');
    await setValue(inputFor('End date'), '2026-10-30');
    await submit();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Two day retreat',
      allDay: true,
      start: '2026-10-29T00:00:00.000Z',
      end: '2026-10-31T00:00:00.000Z',
    }));
  });

  it('edits a canonical all-day event without changing dates in another device timezone', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const allDayEvent = {
      ...event,
      allDay: true,
      start: '2026-10-29T00:00:00.000Z',
      end: '2026-10-31T00:00:00.000Z',
    };
    await render(<CalendarEventForm event={allDayEvent} onClose={jest.fn()} onSave={onSave} />);

    expect(inputFor('Start date').value).toBe('2026-10-29');
    expect(inputFor('End date').value).toBe('2026-10-30');
    expect(formatEventTime(allDayEvent)).toBe('29 Oct – 30 Oct 2026 · All day');
    await submit();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      allDay: true,
      start: allDayEvent.start,
      end: allDayEvent.end,
    }));
  });

  it('keeps note markers on the local date of their timestamp', () => {
    const note = {
      ...event,
      type: 'note' as const,
      allDay: true,
      start: new Date(2026, 9, 29).toISOString(),
      end: new Date(2026, 9, 30).toISOString(),
    };
    expect(formatEventTime(note)).toBe('Thu, 29 Oct 2026 · All day');
  });

  it('saves an all-day date across a clock change using UTC date boundaries', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    await render(<CalendarEventForm
      initial={{ start: new Date(2026, 2, 29), end: new Date(2026, 2, 30), allDay: true }}
      onClose={jest.fn()} onSave={onSave}
    />);
    await setValue(inputFor('Title'), 'Clock change day');
    await submit();

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      allDay: true,
      start: '2026-03-29T00:00:00.000Z',
      end: '2026-03-30T00:00:00.000Z',
    }));
  });

  it('keeps the entered values and allows retry after a failed save', async () => {
    const onSave = jest.fn().mockRejectedValueOnce(new Error('Connection lost. Please try again.')).mockResolvedValue(undefined);
    const onClose = jest.fn();
    await render(<CalendarEventForm event={event} onClose={onClose} onSave={onSave} />);

    await setValue(inputFor('Title'), '  Revised planning session  ');
    await setValue(inputFor('Location'), '  Meeting room 2  ');
    await submit();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Connection lost. Please try again.');
    expect(inputFor('Title').value).toBe('  Revised planning session  ');
    expect(inputFor('Location').value).toBe('  Meeting room 2  ');
    expect(buttonNamed('Save changes').disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    await submit();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Revised planning session', location: 'Meeting room 2' }));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('holds the form while a save is in progress and prevents duplicate submissions', async () => {
    let finishSave!: () => void;
    const onSave = jest.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const onClose = jest.fn();
    await render(<CalendarEventForm event={event} onClose={onClose} onSave={onSave} />);

    await submit();
    expect(buttonNamed('Saving…').disabled).toBe(true);
    expect(container.querySelector('fieldset')?.disabled).toBe(true);
    await submit();
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finishSave());
    expect(buttonNamed('Save changes').disabled).toBe(false);
  });
});

describe('calendar event details', () => {
  it('requires confirmation before deleting and supports keeping the event', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    await render(<CalendarEventDetails event={event} onClose={jest.fn()} onDelete={onDelete} />);

    await act(async () => buttonNamed('Delete').click());
    expect(onDelete).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Delete this event?');
    await act(async () => buttonNamed('Keep event').click());
    expect(container.textContent).not.toContain('Delete this event?');
    expect(onDelete).not.toHaveBeenCalled();

    await act(async () => buttonNamed('Delete').click());
    await act(async () => buttonNamed('Delete event').click());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('shows a deletion failure so the user can retry', async () => {
    const onDelete = jest.fn().mockRejectedValueOnce(new Error('Unable to remove the event.')).mockResolvedValue(undefined);
    await render(<CalendarEventDetails event={event} onClose={jest.fn()} onDelete={onDelete} />);

    await act(async () => buttonNamed('Delete').click());
    await act(async () => buttonNamed('Delete event').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unable to remove the event.');
    expect(buttonNamed('Delete event').disabled).toBe(false);

    await act(async () => buttonNamed('Delete event').click());
    expect(onDelete).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
