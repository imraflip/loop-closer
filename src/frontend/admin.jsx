import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  HelperMessage, Inline, Label, LoadingButton, SectionMessage, Select, Spinner, Stack, Text, Textfield, Toggle,
} from '@forge/react';
import { invoke, showFlag } from '@forge/bridge';
import { changeText, testResultText } from './components/format';

// Screen 4: Settings (Jira admin page). Fields, defaults and help text from design.md.
const TONES = [
  { label: 'Friendly', value: 'friendly' },
  { label: 'Formal', value: 'formal' },
];
const STRICTNESS = [
  { label: 'Loose', value: 0.12 },
  { label: 'Normal', value: 0.19 },
  { label: 'Strict', value: 0.3 },
];
const LOOKBACK = [
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '365 days', value: 365 },
];
const DEFAULTS = {
  jiraProjectKey: '', jsmProjectKey: '', tone: 'friendly', autoResolve: false, resolveStatusName: 'Resolved', threshold: 0.19, lookbackDays: 180,
};

const call = async (name, payload) => {
  const res = await invoke(name, payload);
  if (!res?.ok) throw new Error(res?.message || 'unknown error');
  return res.data;
};

const projectOptions = (list) => list.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }));
const pick = (options, value) => options.find((o) => o.value === value) || null;

// One labelled field with its help text.
const Field = ({ id, label, help, children }) => (
  <Stack space="space.050">
    <Label labelFor={id}>{label}</Label>
    {children}
    <HelperMessage>{help}</HelperMessage>
  </Stack>
);

const App = () => {
  const [page, setPage] = useState({ loading: true, error: null, projects: { software: [], service: [] } });
  const [form, setForm] = useState(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [versions, setVersions] = useState({ loading: false, error: null, list: [] });
  const [versionId, setVersionId] = useState(null);
  const [test, setTest] = useState({ running: false, result: null, error: null });

  useEffect(() => {
    (async () => {
      try {
        const [settings, projects] = await Promise.all([call('getSettings'), call('listProjects')]);
        setForm({ ...DEFAULTS, ...(settings || {}) });
        setPage({ loading: false, error: null, projects });
      } catch (err) {
        setPage({ loading: false, error: err.message, projects: { software: [], service: [] } });
      }
    })();
  }, []);

  // Released versions of the Jira project on the form (scanned or not), for "Test on a release".
  useEffect(() => {
    setVersionId(null);
    setTest({ running: false, result: null, error: null });
    if (!form.jiraProjectKey) {
      setVersions({ loading: false, error: null, list: [] });
      return;
    }
    let live = true;
    setVersions({ loading: true, error: null, list: [] });
    call('listReleasedVersions', { jiraProjectKey: form.jiraProjectKey, includeScanned: true })
      .then((list) => live && setVersions({ loading: false, error: null, list }))
      .catch((err) => live && setVersions({ loading: false, error: err.message, list: [] }));
    return () => {
      live = false;
    };
  }, [form.jiraProjectKey]);

  if (page.loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="medium" label="Loading settings" />
        <Text>Loading settings</Text>
      </Inline>
    );
  }
  if (page.error) {
    return <SectionMessage appearance="error"><Text>{`Could not load settings: ${page.error}`}</Text></SectionMessage>;
  }

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setTest((t) => ({ ...t, result: null, error: null })); // an old result no longer matches the form
  };
  const software = projectOptions(page.projects.software);
  const service = projectOptions(page.projects.service);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await call('saveSettings', form);
      setForm({ ...DEFAULTS, ...saved });
      showFlag({ id: `settings-saved-${Date.now()}`, title: 'Settings saved', type: 'success', isAutoDismiss: true });
    } catch (err) {
      setSaveError(`Not saved: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!versionId || test.running) return;
    setTest({ running: true, result: null, error: null });
    try {
      setTest({ running: false, result: await call('testMatching', { versionId, settings: form }), error: null });
    } catch (err) {
      setTest({ running: false, result: null, error: err.message });
    }
  };

  return (
    <Stack space="space.300">
      <Text color="color.text.subtle">Choose where Loop Closer looks for fixes and customers, and how it replies.</Text>

      <Field id="jira-project" label="Jira project with the fixes" help="Where your bugs and versions live">
        <Select
          inputId="jira-project"
          placeholder="Choose a project"
          options={software}
          value={pick(software, form.jiraProjectKey)}
          onChange={(o) => set('jiraProjectKey')(o?.value || '')}
        />
      </Field>

      <Field id="jsm-project" label="Service desk project" help="Where customers raise requests">
        <Select
          inputId="jsm-project"
          placeholder="Choose a project"
          options={service}
          value={pick(service, form.jsmProjectKey)}
          onChange={(o) => set('jsmProjectKey')(o?.value || '')}
        />
      </Field>

      <Field id="tone" label="Reply tone" help="Used by templates and by Rovo">
        <Select inputId="tone" options={TONES} value={pick(TONES, form.tone)} onChange={(o) => o && set('tone')(o.value)} />
      </Field>

      <Field id="auto-resolve" label="Resolve request after sending" help="Moves the request to the status below">
        <Toggle id="auto-resolve" isChecked={form.autoResolve} onChange={() => set('autoResolve')(!form.autoResolve)} />
      </Field>

      <Field id="resolve-status" label="Resolve status name" help="Must match a transition in your service desk">
        <Textfield
          id="resolve-status"
          value={form.resolveStatusName}
          maxLength={100}
          onChange={(e) => set('resolveStatusName')(changeText(e) ?? '')}
        />
      </Field>

      <Field id="strictness" label="Match strictness" help="Higher means fewer, surer matches">
        <Select
          inputId="strictness"
          options={STRICTNESS}
          value={pick(STRICTNESS, Number(form.threshold))}
          onChange={(o) => o && set('threshold')(o.value)}
        />
      </Field>

      <Field id="lookback" label="Look back" help="How old a request can be to match">
        <Select
          inputId="lookback"
          options={LOOKBACK}
          value={pick(LOOKBACK, Number(form.lookbackDays))}
          onChange={(o) => o && set('lookbackDays')(o.value)}
        />
      </Field>

      {saveError ? <SectionMessage appearance="error"><Text>{saveError}</Text></SectionMessage> : null}
      <Inline>
        <LoadingButton appearance="primary" isLoading={saving} onClick={save}>Save settings</LoadingButton>
      </Inline>

      <Field id="test-version" label="Test on a release" help="Uses the settings above. Nothing is saved and no one is contacted.">
        <Select
          key={form.jiraProjectKey /* new project: fresh, empty picker */}
          inputId="test-version"
          placeholder={form.jiraProjectKey ? 'Choose a released version' : 'Choose a Jira project first'}
          options={versions.list.map((v) => ({ label: v.releaseDate ? `${v.name} (released ${v.releaseDate})` : v.name, value: v.id }))}
          isLoading={versions.loading}
          isDisabled={!form.jiraProjectKey}
          onChange={(o) => {
            setVersionId(o?.value || null);
            setTest({ running: false, result: null, error: null });
          }}
        />
      </Field>
      {versions.error ? <SectionMessage appearance="error"><Text>{`Could not load versions: ${versions.error}`}</Text></SectionMessage> : null}
      <Inline>
        <LoadingButton isLoading={test.running} isDisabled={!versionId} onClick={runTest}>Test on a release</LoadingButton>
      </Inline>
      {test.result ? <SectionMessage appearance="information"><Text>{testResultText(test.result)}</Text></SectionMessage> : null}
      {test.error ? <SectionMessage appearance="error"><Text>{`Test failed: ${test.error}`}</Text></SectionMessage> : null}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
