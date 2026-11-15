import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, EmptyState, Heading, Inline, LoadingButton, ProgressBar, SectionMessage, Spinner, Stack, Tab, TabList, TabPanel, Tabs, Text,
} from '@forge/react';
import { invoke, rovo, showFlag } from '@forge/bridge';
import { firstWord as firstName } from '../../lib/drafts';
import MatchRow from './MatchRow';
import MatchPanel from './MatchPanel';
import RefreshButton from './RefreshButton';
import { watchDraft } from './draftWatch';
import SendConfirmModal from './SendConfirmModal';
import { leftColumnStyle, panelStyle, rightColumnStyle } from './styles';
import { improvePrompt, plural, rovoOpenPayload } from './format';

const TABS = [
  { key: 'waiting', label: 'Waiting', empty: 'Everyone in this release has been told.' },
  { key: 'sent', label: 'Sent', empty: 'No replies sent yet.' },
  { key: 'other', label: 'Skipped and not related', empty: 'No skipped or unrelated customers.' },
];

const call = async (name, payload) => {
  const res = await invoke(name, payload);
  if (!res?.ok) throw new Error(res?.message || 'unknown error');
  return res.data;
};

// The waiting customer to open after `key` leaves the list: the next one, else the previous one.
function nextAfter(list, key) {
  const i = list.findIndex((m) => m.requestKey === key);
  return (list[i + 1] || list[i - 1] || null)?.requestKey ?? null;
}

// Screen 2: Release inbox.
const ReleaseDetail = ({ versionId, onBack }) => {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [selectedKeys, setSelectedKeys] = useState({}); // tab key -> selected request key
  const [edits, setEdits] = useState({}); // request key -> unsaved draft text
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [rescanning, setRescanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boxRevision, setBoxRevision] = useState(0); // bumps after Use template to remount the reply box
  const [confirming, setConfirming] = useState(null); // match waiting for "Send reply"

  // Reloads keep the current screen on show (no spinner) until the new data arrives.
  const load = useCallback(async () => {
    try {
      setState({ loading: false, error: null, data: await call('getMatches', { versionId }) });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }, [versionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Background check for a Rovo draft (one request at a time). Stopped on leaving this screen.
  const watchRef = useRef(null); // { requestKey, stop }
  const stopWatch = useCallback(() => {
    watchRef.current?.stop();
    watchRef.current = null;
  }, []);
  useEffect(() => stopWatch, [stopWatch]);
  // The user's own change to that request (template, skip, send) must not look like a Rovo draft.
  const stopWatchFor = (m) => {
    if (watchRef.current?.requestKey === m.requestKey) stopWatch();
  };

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
  const selectedIn = (tabKey) => tabs[tabKey].find((m) => m.requestKey === selectedKeys[tabKey]) || tabs[tabKey][0] || null;
  const isEdited = (m) => edits[m.requestKey] !== undefined && edits[m.requestKey] !== (m.draft || '');

  // Saves an unsaved edit for `m`. Returns false (and shows the error) if saving failed.
  const saveEdit = async (m) => {
    if (!isEdited(m)) return true;
    try {
      await call('updateMatch', { versionId, requestKey: m.requestKey, draft: edits[m.requestKey] });
      setEdits(({ [m.requestKey]: _saved, ...rest }) => rest);
      return true;
    } catch (err) {
      setActionError(`Not saved: ${err.message}`);
      return false;
    }
  };

  // Clicking another customer saves the current edit first (design.md: no separate Edit modal).
  const select = async (tabKey, key) => {
    setActionError(null);
    const current = selectedIn(tabKey);
    setSelectedKeys((s) => ({ ...s, [tabKey]: key }));
    if (tabKey === 'waiting' && current && current.requestKey !== key && isEdited(current)) {
      if (await saveEdit(current)) await load();
    }
  };

  // After a waiting customer leaves the list, reload and open the next waiting one.
  const moveOn = async (m) => {
    setSelectedKeys((s) => ({ ...s, waiting: nextAfter(tabs.waiting, m.requestKey) }));
    await load();
  };

  const setStatus = async (m, status) => {
    stopWatchFor(m);
    setBusy(true);
    setActionError(null);
    try {
      await call('updateMatch', { versionId, requestKey: m.requestKey, status });
      setEdits(({ [m.requestKey]: _dropped, ...rest }) => rest);
      await moveOn(m);
    } catch (err) {
      setActionError(`Not changed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // "Use template": replace this reply with the template (drops unsaved typing too), then reload.
  const useTemplate = async (m) => {
    stopWatchFor(m);
    setBusy(true);
    setActionError(null);
    try {
      await call('updateMatch', { versionId, requestKey: m.requestKey, resetDraft: true });
      setEdits(({ [m.requestKey]: _dropped, ...rest }) => rest);
      showFlag({ id: `template-${m.requestKey}-${Date.now()}`, title: 'Reply reset to template', type: 'success', isAutoDismiss: true });
      await load();
      setBoxRevision((n) => n + 1);
    } catch (err) {
      setActionError(`Not reset: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // "Rescan": runs the scan again (keeps sent, skipped, not related and saved drafts), then reloads this screen.
  const rescan = async () => {
    if (rescanning) return;
    stopWatch();
    setRescanning(true);
    setBusy(true);
    setActionError(null);
    try {
      const summary = await call('rescanRelease', { versionId });
      showFlag({ id: `rescan-${versionId}-${Date.now()}`, title: `Scan done: ${plural(summary.total, 'customer', 'customers')} matched`, type: 'success', isAutoDismiss: true });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setRescanning(false);
      setBusy(false);
    }
  };

  // "Refresh": loads this release again (for example after Rovo saved a draft). Real unsaved typing
  // is kept; "edits" that equal the saved text are dropped so the new saved draft shows.
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setActionError(null);
    const saved = Object.fromEntries(Object.values(tabs).flat().map((m) => [m.requestKey, m.draft || '']));
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([key, text]) => text !== saved[key])));
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // "Improve with Rovo": save any unsaved typing (Rovo reads the saved draft), then open Rovo chat with
  // the Loop Closer agent and "Improve the reply for KEY". If Rovo cannot open, say what to type instead.
  const improve = async (m) => {
    setActionError(null);
    const hadEdit = isEdited(m);
    setBusy(true);
    const saved = await saveEdit(m);
    setBusy(false);
    if (!saved) return;
    if (hadEdit) await load(); // show the saved text, not the old draft
    const key = { versionId, requestKey: m.requestKey };
    let baseline;
    try {
      baseline = await call('getMatch', key); // what the reply looks like before Rovo
      await rovo.open(rovoOpenPayload(m));
    } catch (err) {
      setActionError(`Could not open Rovo chat (${err.message || 'unknown error'}). Open Rovo chat, pick Loop Closer, and ask: "${improvePrompt(m.requestKey)}"`);
      return;
    }
    // Show Rovo's draft as soon as it is saved: quiet checks every 3 s for up to 60 s, no spinner.
    stopWatch();
    const stop = watchDraft({
      read: () => call('getMatch', key),
      baseline,
      onChange: async () => {
        watchRef.current = null;
        await load(); // reply box, Template / Rovo / Edited label and counts
        showFlag({ id: `rovo-${m.requestKey}-${Date.now()}`, title: 'Rovo draft saved', type: 'success', isAutoDismiss: true });
      },
    });
    watchRef.current = { requestKey: m.requestKey, stop };
  };

  // "Send and next": save the edit, then ask to confirm. Nothing is sent here.
  const askToSend = async (m) => {
    stopWatchFor(m);
    setActionError(null);
    setBusy(true);
    const saved = await saveEdit(m);
    setBusy(false);
    if (saved) setConfirming(m);
  };

  // The "Send reply" click in the confirm modal: the only call to sendReply.
  const send = async () => {
    const m = confirming;
    if (!m || busy) return; // one click, one send
    setBusy(true);
    try {
      const data = await call('sendReply', { versionId, requestKey: m.requestKey });
      setConfirming(null);
      showFlag({ id: `sent-${m.requestKey}`, title: `Reply sent to ${firstName(m.customerName)}`, type: 'success', isAutoDismiss: true });
      if (data.warning) showFlag({ id: `resolve-${m.requestKey}`, title: 'Request not resolved', description: data.warning, type: 'warning' });
      await moveOn(m);
    } catch (err) {
      setConfirming(null);
      setActionError(err.message); // resolver messages already start with "Not sent:"
    } finally {
      setBusy(false);
    }
  };

  const tabBody = (tab) => {
    const matches = tabs[tab.key];
    if (matches.length === 0) return <EmptyState header={tab.empty} />;
    const selected = selectedIn(tab.key);
    const editable = tab.key === 'waiting';
    const draft = editable && edits[selected.requestKey] !== undefined ? edits[selected.requestKey] : selected.draft || '';
    return (
      <Inline space="space.200" grow="fill" alignBlock="start">
        <Box xcss={leftColumnStyle}>
          <Stack space="space.100" grow="fill">
            {matches.map((m) => (
              <MatchRow key={m.requestKey} match={m} selected={m.requestKey === selected.requestKey} onSelect={(key) => select(tab.key, key)} />
            ))}
          </Stack>
        </Box>
        <Box xcss={rightColumnStyle}>
          <MatchPanel
            match={selected}
            releaseName={release.name}
            editable={editable}
            draft={draft}
            edited={editable && isEdited(selected)}
            busy={busy}
            boxRevision={boxRevision}
            onDraftChange={(text) => {
              // Typing in this reply box ends the Rovo check, so what the user types is never overwritten.
              if (watchRef.current?.requestKey === selected.requestKey) stopWatch();
              setEdits((e) => ({ ...e, [selected.requestKey]: text }));
            }}
            onUseTemplate={() => useTemplate(selected)}
            onImprove={() => improve(selected)}
            onSkip={() => setStatus(selected, 'skipped')}
            onNotRelated={() => setStatus(selected, 'not_related')}
            onSend={() => askToSend(selected)}
          />
        </Box>
      </Inline>
    );
  };

  return (
    <Stack space="space.300" grow="fill">
      {back}
      <Stack space="space.100" grow="fill">
        <Inline space="space.200" alignBlock="center">
          <Heading as="h2" size="medium">{`Release ${release.name}`}</Heading>
          <LoadingButton isLoading={rescanning} isDisabled={(busy && !rescanning) || refreshing} onClick={rescan}>Rescan</LoadingButton>
          <RefreshButton refreshing={refreshing} isDisabled={busy} onClick={refresh} />
        </Inline>
        <Text color="color.text.subtle">
          {`${plural(release.bugCount, 'bug fixed', 'bugs fixed')} · ${plural(release.total, 'customer matched', 'customers matched')}`}
        </Text>
        <ProgressBar value={release.total ? release.sent / release.total : 0} ariaLabel={told} />
        <Text size="small">{told}</Text>
      </Stack>

      {actionError ? <SectionMessage appearance="error"><Text>{actionError}</Text></SectionMessage> : null}

      <Tabs id="release-tabs">
        <TabList>
          {TABS.map((t) => <Tab key={t.key}>{`${t.label} ${tabs[t.key].length}`}</Tab>)}
        </TabList>
        {TABS.map((t) => (
          <TabPanel key={t.key}>
            <Box xcss={panelStyle}>{tabBody(t)}</Box>
          </TabPanel>
        ))}
      </Tabs>

      <SendConfirmModal match={confirming} sending={busy} onCancel={() => setConfirming(null)} onConfirm={send} />
    </Stack>
  );
};

export default ReleaseDetail;
