import React from 'react';
import { Box, Button, Inline, Lozenge, ProgressBar, Stack, Text } from '@forge/react';
import { cardStyle } from './styles';
import { daysAgo, plural } from './format';

const ReleaseCard = ({ release, onOpen }) => {
  const title = [`Release ${release.name}`, daysAgo(release.releasedAt), plural(release.bugCount, 'bug fixed', 'bugs fixed')]
    .filter(Boolean)
    .join(' · ');
  const told = `${release.sent} of ${plural(release.total, 'customer', 'customers')} told`;
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150" grow="fill">
        <Inline spread="space-between" alignBlock="center" grow="fill">
          <Text weight="semibold">{title}</Text>
          <Button onClick={() => onOpen(release.versionId)}>Open</Button>
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

export default ReleaseCard;
