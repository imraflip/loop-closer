import React, { useEffect, useState } from 'react';
import {
  Button, Label, LoadingButton, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition,
  SectionMessage, Select, Spinner, Stack, Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const call = async (name, payload) => {
  const res = await invoke(name, payload);
  if (!res?.ok) throw new Error(res?.message || 'unknown error');
  return res.data;
};

const optionLabel = (v) => (v.releaseDate ? `${v.name} (released ${v.releaseDate})` : v.name);

// "Scan a release": pick a released version that has no scan yet, then run rescanRelease.
// The Select is uncontrolled (no `value`); the chosen option is kept from onChange.
const ScanModal = ({ isOpen, onClose, onScanned }) => {
  const [versions, setVersions] = useState({ loading: true, error: null, list: [] });
  const [chosen, setChosen] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setChosen(null);
    setScanError(null);
    setVersions({ loading: true, error: null, list: [] });
    call('listReleasedVersions')
      .then((list) => setVersions({ loading: false, error: null, list }))
      .catch((err) => setVersions({ loading: false, error: err.message, list: [] }));
  }, [isOpen]);

  const scan = async () => {
    if (!chosen || scanning) return;
    setScanning(true);
    setScanError(null);
    try {
      const release = await call('rescanRelease', { versionId: chosen.value });
      onScanned(release);
    } catch (err) {
      setScanError(`Scan failed: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  let body;
  if (versions.loading) {
    body = <Spinner size="medium" label="Loading released versions" />;
  } else if (versions.error) {
    body = <SectionMessage appearance="error"><Text>{`Could not load versions: ${versions.error}`}</Text></SectionMessage>;
  } else if (versions.list.length === 0) {
    body = <Text>Every released version has been scanned. Release a version in your Jira project to scan a new one.</Text>;
  } else {
    body = (
      <Stack space="space.100">
        <Label labelFor="scan-version">Released version</Label>
        <Select
          inputId="scan-version"
          placeholder="Choose a version"
          options={versions.list.map((v) => ({ label: optionLabel(v), value: v.id }))}
          onChange={(option) => setChosen(option || null)}
          isDisabled={scanning}
        />
      </Stack>
    );
  }

  return (
    <ModalTransition>
      {isOpen ? (
        <Modal onClose={scanning ? undefined : onClose}>
          <ModalHeader>
            <ModalTitle>Scan a release</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.200">
              {body}
              {scanError ? <SectionMessage appearance="error"><Text>{scanError}</Text></SectionMessage> : null}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={onClose} isDisabled={scanning}>Cancel</Button>
            <LoadingButton appearance="primary" isLoading={scanning} isDisabled={!chosen} onClick={scan}>Scan</LoadingButton>
          </ModalFooter>
        </Modal>
      ) : null}
    </ModalTransition>
  );
};

export default ScanModal;
