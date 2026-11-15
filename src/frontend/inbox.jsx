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
import { invoke, router, showFlag } from '@forge/bridge';
import StatTile from './components/StatTile';
import ReleaseList from './components/ReleaseList';
import ReleaseDetail from './components/ReleaseDetail';
import RefreshButton from './components/RefreshButton';
import ScanModal from './components/ScanModal';
import StillWaiting from './components/StillWaiting';
import { panelStyle } from './components/styles';
import { SETTINGS_MODULE_KEY, setupBanner } from './components/format';

// No settings saved yet: admins get a button to the Settings page, everyone else is told to ask an admin.
const NotSetUp = ({ isAdmin }) => {
  const [navError, setNavError] = useState(null);
  const banner = setupBanner(isAdmin);
  const open = async () => {
    setNavError(null);
    try {
      await router.navigate({ target: 'module', moduleKey: SETTINGS_MODULE_KEY });
    } catch (err) {
      setNavError(`Could not open Settings (${err?.message || 'unknown error'}). Go to Jira settings, Apps, Loop Closer settings.`);
    }
  };
  return (
    <Stack space="space.200">
      <SectionMessage appearance="warning">
        <Stack space="space.150">
          <Text>{banner.text}</Text>
          {banner.showButton ? <Box><Button appearance="primary" onClick={open}>Open Settings</Button></Box> : null}
        </Stack>
      </SectionMessage>
      {navError ? <SectionMessage appearance="error"><Text>{navError}</Text></SectionMessage> : null}
    </Stack>
  );
};

const App = () => {
  const [state, setState] = useState({ loading: true, configured: true, isAdmin: false, error: null, releases: [] });
  // set -> Screen 2 (Release inbox): { versionId, requestKey }; requestKey (from Still waiting) is the customer to show first.
  const [openRelease, setOpenRelease] = useState(null);
  const openReleaseAt = (versionId, requestKey = null) => setOpenRelease({ versionId, requestKey });
  const [reloadKey, setReloadKey] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // "Refresh" keeps the list on show while it reloads

  useEffect(() => {
    (async () => {
      try {
        const settings = await invoke('getSettings');
        if (!settings?.ok) throw new Error(settings?.message || 'unknown error');
        if (!settings.data) {
          const admin = await invoke('amIAdmin');
          setState({ loading: false, configured: false, isAdmin: admin?.ok === true && admin.data?.isAdmin === true, error: null, releases: [] });
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
    return <NotSetUp isAdmin={state.isAdmin} />;
  }

  if (openRelease) {
    // Back reloads the release list so counts stay fresh once sending works.
    const back = () => {
      setOpenRelease(null);
      setReloadKey((k) => k + 1);
    };
    return <ReleaseDetail versionId={openRelease.versionId} focusKey={openRelease.requestKey} onBack={back} />;
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
            <ReleaseList state={state} onOpen={(versionId) => openReleaseAt(versionId)} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={panelStyle}>
            <StillWaiting reloadKey={reloadKey} onOpen={openReleaseAt} />
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
