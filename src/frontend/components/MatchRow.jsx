import React from 'react';
import { Inline, Pressable, Stack, Text } from '@forge/react';
import MatchLozenge from './MatchLozenge';
import { rowStyle, selectedRowStyle } from './styles';
import { firstWord as firstName } from '../../lib/drafts';
import { cut } from './format';

// Left column row: first name, request key, summary cut at 40 characters, match lozenge.
const MatchRow = ({ match, selected, onSelect }) => (
  <Pressable xcss={selected ? selectedRowStyle : rowStyle} onClick={() => onSelect(match.requestKey)}>
    <Stack space="space.050">
      <Inline spread="space-between" alignBlock="center" grow="fill">
        <Text weight="semibold">{`${firstName(match.customerName)} · ${match.requestKey}`}</Text>
        <MatchLozenge match={match} />
      </Inline>
      <Text size="small" color="color.text.subtle">{cut(match.requestSummary, 40)}</Text>
    </Stack>
  </Pressable>
);

export default MatchRow;
