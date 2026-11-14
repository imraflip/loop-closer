import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Inline,
  SectionMessage,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from '@forge/react';
import { invoke, showFlag } from '@forge/bridge';
import StatTile from './components/StatTile';
import ReleaseList from './components/ReleaseList';
import ReleaseDetail from './components/ReleaseDetail';
import RefreshButton from './components/RefreshButton';
import ScanModal from './components/ScanModal';
import { panelStyle } from './components/styles';

const NOT_SET_UP = 'Loop Closer is not set up yet. Ask a Jira admin to choose projects in Loop Closer settings.';

const App = () => {
  const [state, setState] = useState({ loading: true, configured: true, error: null, releases: [] });
  const [openVersionId, setOpenVersionId] = useState(null); // set -> Screen 2 (Release inbox)
  const [reloadKey, setReloadKey] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // "Refresh" keeps the list on show while it reloads

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
      } finally {
        setRefreshing(false);
      }
    })();
  }, [reloadKey]);

  if (!state.configured) {
    return <SectionMessage appearance="warning"><Text>{NOT_SET_UP}</Text></SectionMessage>;
  }

  if (openVersionId) {
    // Back reloads the release list so counts stay fresh once sending works.
    const back = () => {
      setOpenVersionId(null);
      setReloadKey((k) => k + 1);
    };
    return <ReleaseDetail versionId={openVersionId} onBack={back} />;
  }

  // After a scan: close the modal, refresh the release list and show a toast.
  const scanned = (release) => {
    setScanOpen(false);
    showFlag({
      id: `scanned-${release.versionId}`,
      title: `Release ${release.name} scanned`,
      description: `${release.total} ${release.total === 1 ? 'customer' : 'customers'} matched`,
      type: 'success',
      isAutoDismiss: true,
    });
    setReloadKey((k) => k + 1);
  };

  const waiting = state.releases.reduce((sum, r) => sum + r.waiting, 0);
  const sent = state.releases.reduce((sum, r) => sum + r.sent, 0);
  const ready = !state.loading && !state.error;

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Text color="color.text.subtle">Tell customers their fix has shipped.</Text>
        <Inline space="space.100" alignBlock="center">
          <RefreshButton
            refreshing={refreshing}
            onClick={() => {
              setRefreshing(true);
              setReloadKey((k) => k + 1);
            }}
          />
          <Button appearance="primary" onClick={() => setScanOpen(true)}>Scan a release</Button>
        </Inline>
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
            <ReleaseList state={state} onOpen={setOpenVersionId} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={panelStyle}>
            {/* Placeholder: Screen 3 is built in Phase 4. */}
            <Text>Still waiting is coming soon.</Text>
          </Box>
        </TabPanel>
      </Tabs>

      <ScanModal isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanned={scanned} />
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
