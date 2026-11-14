import React, { useEffect, useState } from 'react';
import {
  Box, Button, EmptyState, Heading, Inline, ProgressBar, SectionMessage, Spinner, Stack, Tab, TabList, TabPanel, Tabs, Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import MatchRow from './MatchRow';
import MatchPanel from './MatchPanel';
import { leftColumnStyle, panelStyle, rightColumnStyle } from './styles';
import { plural } from './format';

const TABS = [
  { key: 'waiting', label: 'Waiting', empty: 'Everyone in this release has been told.' },
  { key: 'sent', label: 'Sent', empty: 'No replies sent yet.' },
  { key: 'other', label: 'Skipped and not related', empty: 'No skipped or unrelated customers.' },
];

// One tab: customer list on the left (about 40%), the selected customer on the right (about 60%).
const TabBody = ({ tab, matches, releaseName, selectedKey, onSelect }) => {
  if (matches.length === 0) return <EmptyState header={tab.empty} />;
  const selected = matches.find((m) => m.requestKey === selectedKey) || matches[0];
  return (
    <Inline space="space.200" grow="fill" alignBlock="start">
      <Box xcss={leftColumnStyle}>
        <Stack space="space.100" grow="fill">
          {matches.map((m) => (
            <MatchRow key={m.requestKey} match={m} selected={m.requestKey === selected.requestKey} onSelect={onSelect} />
          ))}
        </Stack>
      </Box>
      <Box xcss={rightColumnStyle}>
        <MatchPanel match={selected} releaseName={releaseName} showActions={tab.key === 'waiting'} />
      </Box>
    </Inline>
  );
};

// Screen 2: Release inbox.
const ReleaseDetail = ({ versionId, onBack }) => {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [selectedKeys, setSelectedKeys] = useState({}); // tab key -> selected request key

  useEffect(() => {
    (async () => {
      try {
        const res = await invoke('getMatches', { versionId });
        if (!res?.ok) throw new Error(res?.message || 'unknown error');
        setState({ loading: false, error: null, data: res.data });
      } catch (err) {
        setState({ loading: false, error: err.message, data: null });
      }
    })();
  }, [versionId]);

  const back = <Box><Button appearance="subtle" iconBefore="arrow-left" onClick={onBack}>All releases</Button></Box>;

  if (state.loading) {
    return (
      <Stack space="space.200">
        {back}
        <Inline space="space.100" alignBlock="center">
          <Spinner size="medium" label="Loading release" />
          <Text>Loading release</Text>
        </Inline>
      </Stack>
    );
  }
  if (state.error) {
    return (
      <Stack space="space.200">
        {back}
        <SectionMessage appearance="error"><Text>{`Could not load this release: ${state.error}`}</Text></SectionMessage>
      </Stack>
    );
  }

  const { release, tabs } = state.data;
  const told = `${release.sent} of ${release.total} told`;
  return (
    <Stack space="space.300" grow="fill">
      {back}
      <Stack space="space.100" grow="fill">
        <Heading as="h2" size="medium">{`Release ${release.name}`}</Heading>
        <Text color="color.text.subtle">
          {`${plural(release.bugCount, 'bug fixed', 'bugs fixed')} · ${plural(release.total, 'customer matched', 'customers matched')}`}
        </Text>
        <ProgressBar value={release.total ? release.sent / release.total : 0} ariaLabel={told} />
        <Text size="small">{told}</Text>
      </Stack>

      <Tabs id="release-tabs">
        <TabList>
          {TABS.map((t) => <Tab key={t.key}>{`${t.label} ${tabs[t.key].length}`}</Tab>)}
        </TabList>
        {TABS.map((t) => (
          <TabPanel key={t.key}>
            <Box xcss={panelStyle}>
              <TabBody
                tab={t}
                matches={tabs[t.key]}
                releaseName={release.name}
                selectedKey={selectedKeys[t.key]}
                onSelect={(key) => setSelectedKeys((s) => ({ ...s, [t.key]: key }))}
              />
            </Box>
          </TabPanel>
        ))}
      </Tabs>
    </Stack>
  );
};

export default ReleaseDetail;
