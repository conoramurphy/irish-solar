import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogViewer } from '../../src/components/LogViewer';
import { useLogStore } from '../../src/stores/logStore';

type SeedEntry = { id: string; ts: number; level: 'info' | 'warn' | 'error'; scope: string; message: string; spanId?: string; details?: unknown };

type SeedSpan = { id: string; scope: string; name: string; status: 'running' | 'success' | 'error'; startTs: number; endTs?: number };

function seed({ entries, spans }: { entries: SeedEntry[]; spans?: SeedSpan[] }) {
  const spanMap: Record<string, any> = {};
  for (const s of spans ?? []) spanMap[s.id] = s;

  useLogStore.setState({
    entries,
    spans: spanMap,
    minLevel: 'info'
  });
}

describe('<LogViewer />', () => {
  beforeEach(() => {
    seed({ entries: [], spans: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders and shows seeded entries; selecting shows details', async () => {
    seed({
      spans: [{ id: 's1', scope: 'engine', name: 'Run calculation', status: 'success', startTs: 1, endTs: 10 }],
      entries: [
        { id: '1', ts: 1, level: 'info', scope: 'app', message: 'hello', details: { a: 1 } },
        { id: '2', ts: 2, level: 'error', scope: 'calc', message: 'boom', spanId: 's1', details: { err: 'x' } }
      ]
    });

    const user = userEvent.setup();
    render(<LogViewer open onClose={() => {}} />);

    expect(screen.getByText('Activity Log')).toBeInTheDocument();

    // Entries list.
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();

    // Select an entry to show details.
    await user.click(screen.getByRole('button', { name: /boom/i }));
    expect(screen.getByText('Details')).toBeInTheDocument();

    // JSON details should be rendered in <pre>.
    expect(screen.getByText(/"err": "x"/)).toBeInTheDocument();
  });

  it('filters by minLevel and query and can clear entries', async () => {
    seed({
      spans: [
        { id: 's1', scope: 'solar', name: 'Solar normalization', status: 'success', startTs: 1, endTs: 2 },
        { id: 's2', scope: 'engine', name: 'Run calculation', status: 'error', startTs: 3, endTs: 4 }
      ],
      entries: [
        { id: '1', ts: 1, level: 'info', scope: 'ui', message: 'clicked', details: null },
        { id: '2', ts: 2, level: 'warn', scope: 'calc', message: 'normalize warning', spanId: 's1', details: { w: true } },
        { id: '3', ts: 3, level: 'error', scope: 'calc', message: 'failed hard', spanId: 's2', details: { e: true } }
      ]
    });

    const user = userEvent.setup();
    render(<LogViewer open onClose={() => {}} />);

    const minLevelSelect = screen.getAllByRole('combobox')[0];

    // Min level = error (only one entry should remain).
    await user.selectOptions(minLevelSelect, 'error');
    expect(screen.queryByText('clicked')).not.toBeInTheDocument();
    expect(screen.queryByText('normalize warning')).not.toBeInTheDocument();
    expect(screen.getByText('failed hard')).toBeInTheDocument();

    // Reset to info, then query filter.
    await user.selectOptions(minLevelSelect, 'info');
    await user.type(screen.getByPlaceholderText('Filter (scope/message)'), 'normalize');
    expect(screen.queryByText('clicked')).not.toBeInTheDocument();
    expect(screen.getByText('normalize warning')).toBeInTheDocument();
    expect(screen.queryByText('failed hard')).not.toBeInTheDocument();

    // Clear removes entries.
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No log entries match the current filter.')).toBeInTheDocument();
  });
});
