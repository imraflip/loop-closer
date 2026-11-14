import React from 'react';
import { Box, Stack, Text } from '@forge/react';
import { tileStyle } from './styles';

const StatTile = ({ label, value, danger }) => (
  <Box xcss={tileStyle}>
    <Stack space="space.050">
      <Text size="small" color="color.text.subtle">{label}</Text>
      {/* Heading has no red colour, so the number is a large bold Text. */}
      <Text size="large" weight="bold" color={danger ? 'color.text.danger' : 'color.text'}>{String(value)}</Text>
    </Stack>
  </Box>
);

export default StatTile;
