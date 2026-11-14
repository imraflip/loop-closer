import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  EmptyState,
  Inline,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const NOT_SET_UP = 'Loop Closer is not set up yet. Ask a Jira admin to choose projects in Loop Closer settings.';
const DAY_MS = 24 * 60 * 60 * 1000;

// Card look: token border + padding, full width of the page.
const cardStyle = xcss({
  width: '100%',
  padding: 'space.300',
  backgroundColor: 'elevation.surface.raised',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
});

// Tab panel content: fill the panel row (docs: display block + flexGrow make `grow` work in flex parents).
const panelStyle = xcss({
  display: 'block',
  flexGrow: 1,
  width: '100%',
  paddingBlock: 'space.200',
});

// Stat tile: same look; width 0% + flexGrow 1 makes the three tiles share the row equally.
const tileStyle = xcss({
  display: 'block',
  flexGrow: 1,
  width: '0%',
  padding: 'space.300',
  backgroundColor: 'elevation.surface.sunken',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
});

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "today", "1 day ago", "3 days ago" from a yyyy-mm-dd release date.
function daysAgo(date) {
  const then = Date.parse(date);
  if (Number.isNaN(then)) return null;
  const days = Math.max(0, Math.floor((Date.now() - then) / DAY_MS));
  return days === 0 ? 'today' : `${plural(days, 'day', 'days')} ago`;
}

const StatTile = ({ label, value, danger }) => (
  <Box xcss={tileStyle}>
    <Stack space="space.050">
      <Text size="small" color="color.text.subtle">{label}</Text>
      {/* Heading has no red colour, so the number is a large bold Text. */}
      <Text size="large" weight="bold" color={danger ? 'color.text.danger' : 'color.text'}>{String(value)}</Text>
    </Stack>
  </Box>
);

const ReleaseCard = ({ release }) => {
  const title = [`Release ${release.name}`, daysAgo(release.releasedAt), plural(release.bugCount, 'bug fixed', 'bugs fixed')]
    .filter(Boolean)
    .join(' · ');
  const told = `${release.sent} of ${plural(release.total, 'customer', 'customers')} told`;
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150" grow="fill">
        <Inline spread="space-between" alignBlock="center" grow="fill">
          <Text weight="semibold">{title}</Text>
          {/* Opens Screen 2 (Release inbox) in a later Phase 2 task. */}
          <Button isDisabled>Open</Button>
        </Inline>
        <ProgressBar value={release.total ? release.sent / release.total : 0} ariaLabel={told} />
        <Inline space="space.100" alignBlock="center">
          <Text size="small">{told}</Text>
          <Lozenge appearance={release.waiting > 0 ? 'removed' : 'default'}>{`${release.waiting} waiting`}</Lozenge>
        </Inline>
      </Stack>
    </Box>
  );
};

const ReleaseList = ({ state }) => {
  if (state.loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="medium" label="Loading releases" />
        <Text>Loading releases</Text>
      </Inline>
    );
  }
  if (state.error) {
    return <SectionMessage appearance="error"><Text>{`Could not load releases: ${state.error}`}</Text></SectionMessage>;
  }
  if (state.releases.length === 0) {
    return (
      <EmptyState
        header="No releases scanned yet."
        description="Release a version in your Jira project, or click Scan a release."
      />
    );
  }
  return (
    <Stack space="space.200" grow="fill">
      {state.releases.map((r) => <ReleaseCard key={r.versionId} release={r} />)}
    </Stack>
  );
};

const App = () => {
  const [state, setState] = useState({ loading: true, configured: true, error: null, releases: [] });

  useEffect(() => {
    (async () => {
      try {
        const settings = await invoke('getSettings');
        if (!settings?.ok) throw new Error(settings?.message || 'unknown error');
        if (!settings.data) {
          setState({ loading: false, configured: false, error: null, releases: [] });
          return;
        }
        const res = await invoke('getReleases');
        if (!res?.ok) throw new Error(res?.message || 'unknown error');
        setState({ loading: false, configured: true, error: null, releases: res.data });
      } catch (err) {
        setState({ loading: false, configured: true, error: err.message, releases: [] });
      }
    })();
  }, []);

  if (!state.configured) {
    return <SectionMessage appearance="warning"><Text>{NOT_SET_UP}</Text></SectionMessage>;
  }

  const waiting = state.releases.reduce((sum, r) => sum + r.waiting, 0);
  const sent = state.releases.reduce((sum, r) => sum + r.sent, 0);
  const ready = !state.loading && !state.error;

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Text color="color.text.subtle">Tell customers their fix has shipped.</Text>
        {/* Placeholder: opens the scan modal (Select of released versions + Scan) in a later Phase 2 task. */}
        <Button appearance="primary" isDisabled>Scan a release</Button>
      </Inline>

      {ready ? (
        <Inline space="space.200" grow="fill">
          <StatTile label="Customers waiting" value={waiting} danger={waiting > 0} />
          <StatTile label="Replies sent" value={sent} />
          <StatTile label="Releases scanned" value={state.releases.length} />
        </Inline>
      ) : null}

      <Tabs id="loop-closer-tabs">
        <TabList>
          <Tab>Releases</Tab>
          <Tab>{ready ? `Still waiting (${waiting})` : 'Still waiting'}</Tab>
        </TabList>
        <TabPanel>
          <Box xcss={panelStyle}>
            <ReleaseList state={state} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={panelStyle}>
            {/* Placeholder: Screen 3 is built in Phase 4. */}
            <Text>Still waiting is coming soon.</Text>
          </Box>
        </TabPanel>
      </Tabs>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
