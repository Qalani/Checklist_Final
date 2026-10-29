import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import NotesPage from '@/app/notes/page';

const mockUpdateNote = jest.fn();
const note = { id: 'note', user_id: 'alice', title: 'Original', content: '<p>Hello</p>', updated_at: '2026-10-29T10:00:00Z' };
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/lib/hooks/useAuthSession', () => ({ useAuthSession: () => ({ user: { id: 'alice' }, authChecked: true, signOut: jest.fn() }) }));
jest.mock('@/features/notes/useNotes', () => ({ useNotes: () => ({
  notes: [note], status: 'ready', syncing: false, error: null,
  createNote: jest.fn(), deleteNote: jest.fn(), updateNote: mockUpdateNote,
}) }));
jest.mock('@/components/ParallaxBackground', () => () => null);
jest.mock('@/components/ThemeSwitcher', () => () => null);
jest.mock('@/components/AccountSummary', () => () => null);
jest.mock('@/components/SyncStatusBadge', () => ({ SyncStatusBadge: () => null }));
jest.mock('@/components/ConfirmDialog', () => () => null);
jest.mock('@/components/ZenPageHeader', () => () => null);
jest.mock('@/components/ZenWordProcessor', () => () => null);

let root: Root;
let element: HTMLDivElement;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(async () => {
  jest.useFakeTimers();
  mockUpdateNote.mockReset().mockImplementation(async (_id: string, updates: object) => ({ note: { ...note, ...updates } }));
  element = document.createElement('div');
  root = createRoot(element);
  await act(async () => { root.render(<NotesPage />); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); jest.useRealTimers(); });

async function editTitle(value: string) {
  const input = element.querySelector<HTMLInputElement>('input[placeholder="Untitled document"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const saveButton = () => [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Save now'))!;

it('debounces an edit once and clears dirty state after its save is acknowledged', async () => {
  expect(saveButton().disabled).toBe(true);
  await editTitle('Offline edit');
  expect(mockUpdateNote).not.toHaveBeenCalled();
  await act(async () => { await jest.advanceTimersByTimeAsync(1200); });
  expect(mockUpdateNote).toHaveBeenCalledTimes(1);
  expect(mockUpdateNote).toHaveBeenCalledWith('note', { title: 'Offline edit', content: '<p>Hello</p>' });
  expect(saveButton().disabled).toBe(true);
  await act(async () => { await jest.advanceTimersByTimeAsync(10_000); });
  expect(mockUpdateNote).toHaveBeenCalledTimes(1);
});

it('preserves typing during an in-flight save and saves the newer draft once afterward', async () => {
  let acknowledge!: (value: unknown) => void;
  mockUpdateNote.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  await editTitle('First edit');
  await act(async () => { await jest.advanceTimersByTimeAsync(1200); });
  await editTitle('Newer edit');
  await act(async () => { acknowledge({ note: { ...note, title: 'First edit' } }); });
  expect(element.querySelector<HTMLInputElement>('input[placeholder="Untitled document"]')!.value).toBe('Newer edit');
  await act(async () => { await jest.advanceTimersByTimeAsync(1200); });
  expect(mockUpdateNote).toHaveBeenCalledTimes(2);
  expect(mockUpdateNote.mock.calls[1][1].title).toBe('Newer edit');
  expect(saveButton().disabled).toBe(true);
});
