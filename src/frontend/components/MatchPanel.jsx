import React from 'react';
import { Box, Button, Heading, Inline, Label, Lozenge, Stack, Text, TextArea } from '@forge/react';
import { router } from '@forge/bridge';
import { MAX_WORDS, firstWord as firstName, wordCount } from '../../lib/drafts';
import MatchLozenge from './MatchLozenge';
import { quoteStyle } from './styles';
import { SOURCE_LABEL, sharedWords } from './format';

// Right column: the selected customer, both sides of the match, and the reply draft.
// Buttons are placeholders until the updateMatch and sendReply tasks.
const MatchPanel = ({ match, releaseName, showActions }) => {
  const words = sharedWords(match);
  const draft = match.draft || '';
  const draftId = `draft-${match.requestKey}`;
  return (
    <Stack space="space.200" grow="fill">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Heading as="h3" size="small">{firstName(match.customerName)}</Heading>
        <Button appearance="subtle" spacing="compact" iconAfter="shortcut" onClick={() => router.open(`/browse/${match.requestKey}`)}>
          {match.requestKey}
        </Button>
      </Inline>

      <Inline space="space.100" alignBlock="center" shouldWrap>
        <MatchLozenge match={match} long />
        {words.length > 0 ? <Text size="small" color="color.text.subtle">{`Shared words: ${words.join(', ')}`}</Text> : null}
      </Inline>

      <Inline space="space.200" grow="fill" alignBlock="stretch">
        <Box xcss={quoteStyle}>
          <Stack space="space.050">
            <Text size="small" weight="bold">They wrote</Text>
            <Text>{match.requestSummary}</Text>
          </Stack>
        </Box>
        <Box xcss={quoteStyle}>
          <Stack space="space.050">
            <Text size="small" weight="bold">{`Fixed in ${releaseName}`}</Text>
            <Text>{`${match.bugKey}: ${match.bugSummary}`}</Text>
          </Stack>
        </Box>
      </Inline>

      <Stack space="space.075" grow="fill">
        <Inline space="space.100" alignBlock="center">
          <Label labelFor={draftId}>Reply to customer</Label>
          {match.draftSource ? <Lozenge>{SOURCE_LABEL[match.draftSource] || match.draftSource}</Lozenge> : null}
        </Inline>
        {/* Read-only until updateMatch saves edits. */}
        <TextArea id={draftId} value={draft} isReadOnly minimumRows={8} resize="vertical" />
        <Text size="small" color={wordCount(draft) > MAX_WORDS ? 'color.text.danger' : 'color.text.subtle'}>
          {`${wordCount(draft)} / ${MAX_WORDS} words`}
        </Text>
      </Stack>

      {showActions ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Button isDisabled>Improve with Rovo</Button>
          <Button isDisabled>Skip</Button>
          <Button isDisabled>Not related</Button>
          <Button appearance="primary" isDisabled>Send and next</Button>
        </Inline>
      ) : null}
    </Stack>
  );
};

export default MatchPanel;
