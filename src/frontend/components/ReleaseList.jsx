import React from 'react';
import { EmptyState, Inline, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import ReleaseCard from './ReleaseCard';

const ReleaseList = ({ state, onOpen }) => {
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
      {state.releases.map((r) => <ReleaseCard key={r.versionId} release={r} onOpen={onOpen} />)}
    </Stack>
  );
};

export default ReleaseList;
