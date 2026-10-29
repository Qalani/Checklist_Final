import React, { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActionFeedbackProvider, useActionFeedback } from '@/components/ActionFeedback';
import CompletionToggle from '@/components/CompletionToggle';

type ToggleProps = ComponentProps<typeof CompletionToggle>;

describe('completion feedback', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function statusText() {
    return [...document.querySelectorAll('[role="status"]')].map(node => node.textContent).join(' ');
  }

  function renderToggle(props: Partial<ToggleProps> = {}) {
    act(() => root.render(
      <ActionFeedbackProvider>
        <CompletionToggle completed={false} onToggle={() => true} label="Task completed" {...props} />
      </ActionFeedbackProvider>,
    ));
    return host.querySelector('button')!;
  }

  it('confirms a successful completion with a semantic, keyboard-accessible button', async () => {
    const onToggle = jest.fn().mockResolvedValue(true);
    const button = renderToggle({ onToggle, subject: 'task' });
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Mark task as complete');

    await act(async () => button.click());

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(statusText()).toContain('Task completed');
    expect(document.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('does not celebrate completed items on mount, rerender, or undo', async () => {
    const onToggle = jest.fn().mockResolvedValue(true);
    renderToggle({ completed: true, onToggle });
    expect(statusText()).toBe('');

    const button = renderToggle({ completed: true, onToggle });
    expect(statusText()).toBe('');
    await act(async () => button.click());

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe('');
  });

  it('does not celebrate rejected, failed, or disabled mutations', async () => {
    const onToggle = jest.fn().mockResolvedValue(false);
    let button = renderToggle({ onToggle });
    await act(async () => button.click());
    expect(statusText()).toBe('');

    onToggle.mockRejectedValueOnce(new Error('Unable to update task'));
    button = renderToggle({ onToggle });
    await act(async () => button.click());
    expect(statusText()).toBe('');

    onToggle.mockClear();
    const disabledButton = renderToggle({ disabled: true, onToggle });
    await act(async () => disabledButton.click());
    expect(onToggle).not.toHaveBeenCalled();
    expect(statusText()).toBe('');
  });

  it('prevents overlapping toggles while a completion is pending', async () => {
    let resolve!: (value: boolean) => void;
    const onToggle = jest.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const button = renderToggle({ onToggle });

    await act(async () => {
      button.click();
      button.click();
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe('');

    await act(async () => resolve(true));
    expect(statusText()).toContain('Task completed');
  });

  it('keeps confirmation but omits the anchored burst after scrolling during a pending completion', async () => {
    const previousScrollY = window.scrollY;
    let resolve!: (value: boolean) => void;
    const onToggle = () => new Promise<boolean>(done => { resolve = done; });
    const button = renderToggle({ onToggle });

    try {
      await act(async () => button.click());
      Object.defineProperty(window, 'scrollY', { configurable: true, value: previousScrollY + 300 });
      await act(async () => resolve(true));

      expect(statusText()).toContain('Task completed');
      expect(document.querySelector('.action-feedback-burst')).toBeNull();
    } finally {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: previousScrollY });
    }
  });

  it('keeps confirmation visible when completion removes the original task control', async () => {
    let resolve!: (value: boolean) => void;
    function DisappearingTask() {
      const [visible, setVisible] = React.useState(true);
      return visible ? (
        <CompletionToggle
          completed={false}
          label="Task completed"
          onToggle={() => {
            setVisible(false);
            return new Promise<boolean>(done => { resolve = done; });
          }}
        />
      ) : null;
    }
    act(() => root.render(<ActionFeedbackProvider><DisappearingTask /></ActionFeedbackProvider>));
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('button')).toBeNull();

    await act(async () => resolve(true));
    expect(statusText()).toContain('Task completed');
  });

  it('replaces rapid confirmations and gives the latest one its own lifetime', () => {
    let celebrate!: ReturnType<typeof useActionFeedback>;
    function Trigger() {
      celebrate = useActionFeedback();
      return null;
    }
    act(() => root.render(<ActionFeedbackProvider><Trigger /></ActionFeedbackProvider>));

    act(() => celebrate({ kind: 'complete', message: 'Task completed' }));
    act(() => jest.advanceTimersByTime(1500));
    act(() => celebrate({ kind: 'archive', message: 'List archived', detail: 'Weekend plans' }));
    act(() => jest.advanceTimersByTime(1000));

    expect(statusText()).toContain('List archived');
    expect(statusText()).not.toContain('Task completed');
    expect(document.querySelectorAll('[role="status"]').length).toBe(1);

    act(() => jest.advanceTimersByTime(3000));
    expect(statusText()).toBe('');
  });

  it('clears scheduled feedback cleanup when the app shell unmounts', () => {
    let celebrate!: ReturnType<typeof useActionFeedback>;
    function Trigger() {
      celebrate = useActionFeedback();
      return null;
    }
    act(() => root.render(<ActionFeedbackProvider><Trigger /></ActionFeedbackProvider>));
    act(() => celebrate({ kind: 'restore', message: 'List restored' }));
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    act(() => root.render(null));
    expect(jest.getTimerCount()).toBe(0);
  });
});
