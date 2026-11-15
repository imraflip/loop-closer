import React, { useEffect, useState } from 'react';
import { Button, DynamicTable, EmptyState, Inline, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { cut, daysLabel, waitedTooLong } from './format';

// Screen 3: every customer not told yet, from all releases, most days waiting first (sorted by the resolver).
// reloadKey: changes when the page reloads (Refresh, after a scan) so this list reloads too.
const HEAD = {
  cells: [
    { key: 'release', content: 'Release' },
    { key: 'customer', content: 'Customer and request' },
    { key: 'bug', content: 'Fixed bug' },
    { key: 'days', content: 'Days waiting' },
    { key: 'open', content: '' },
  ],
};

const StillWaiting = ({ reloadKey, onOpen }) => {
  const [state, setState] = useState({ loading: true, error: null, rows: [] });

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const res = await invoke('getStillWaiting');
        if (!res?.ok) throw new Error(res?.message || 'unknown error');
        if (live) setState({ loading: false, error: null, rows: res.data });
      } catch (err) {
        if (live) setState({ loading: false, error: err.message, rows: [] });
      }
    })();
    return () => {
      live = false;
    };
  }, [reloadKey]);

  if (state.loading) return <Spinner size="medium" label="Loading" />;
  if (state.error) {
    return <SectionMessage appearance="error"><Text>{`Could not load: ${state.error}`}</Text></SectionMessage>;
  }
  if (state.rows.length === 0) return <EmptyState header="Everyone has been told. Nice work." />;

  const n = state.rows.length;
  const rows = state.rows.map((r) => ({
    key: `${r.versionId}:${r.requestKey}`,
    cells: [
      { key: 'release', content: <Text>{r.release}</Text> },
      { key: 'customer', content: <Text>{`${r.customer} · ${r.requestKey}`}</Text> },
      { key: 'bug', content: <Text>{`${r.bugKey} ${cut(r.bugSummary, 60)}`}</Text> },
      {
        key: 'days',
        content: (
          <Text weight={waitedTooLong(r.daysWaiting) ? 'bold' : 'regular'} color={waitedTooLong(r.daysWaiting) ? 'color.text.danger' : 'color.text'}>
            {daysLabel(r.daysWaiting)}
          </Text>
        ),
      },
      { key: 'open', content: <Button onClick={() => onOpen(r.versionId, r.requestKey)}>Open release</Button> },
    ],
  }));

  return (
    <Stack space="space.200" grow="fill">
      <Inline space="space.050" alignBlock="baseline">
        <Text weight="bold">{String(n)}</Text>
        <Text>{n === 1 ? 'customer has not been told about a shipped fix' : 'customers have not been told about a shipped fix'}</Text>
      </Inline>
      <DynamicTable label="Customers still waiting" head={HEAD} rows={rows} rowsPerPage={20} />
    </Stack>
  );
};

export default StillWaiting;
