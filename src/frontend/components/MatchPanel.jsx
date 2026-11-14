import React from 'react';
import { Box, Button, Heading, Inline, Label, Lozenge, Stack, Text, TextArea } from '@forge/react';
import { router } from '@forge/bridge';
import { MAX_DRAFT_CHARS, MAX_WORDS, firstWord as firstName, wordCount } from '../../lib/drafts';
import MatchLozenge from './MatchLozenge';
import { quoteStyle, readOnlyDraftStyle } from './styles';
import { SOURCE_LABEL, canSend, changeText, draftBoxKey, draftParagraphs, sentLabel, sharedWords } from './format';

// Right column: the selected customer, both sides of the match, and the reply draft.
// On the Waiting tab the draft is editable (saved by the parent) and the action buttons are live.
// `draft` is the text on screen (an unsaved edit or the stored draft); `edited` is true when it differs.
// The TextArea is uncontrolled: `defaultValue` sets the text once per mount and the box owns it while typing.
// A controlled `value` goes through the async UI Kit bridge on every keystroke, and the host field
// resets to the last value it was given, so typed and pasted text never sticks.
// `boxRevision` changes after "Use template" so the uncontrolled box remounts even if the saved text is unchanged.
const MatchPanel = ({
  match, releaseName, editable, draft, edited, busy, boxRevision = 0, onDraftChange, onUseTemplate, onSkip, onNotRelated, onSend,
}) => {
  const words = sharedWords(match);
  const source = edited ? 'edited' : match.draftSource;
  const showUseTemplate = editable && (source === 'edited' || source === 'rovo' || !draft.trim());
  const sent = match.status === 'sent' ? sentLabel(match.sentAt) : null;
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
          {editable ? <Label labelFor={draftId}>Reply to customer</Label> : <Text weight="semibold">Reply to customer</Text>}
          {source ? <Lozenge>{SOURCE_LABEL[source] || source}</Lozenge> : null}
          {sent ? <Lozenge appearance="success">{sent}</Lozenge> : null}
          {showUseTemplate ? (
            <Button appearance="subtle" spacing="compact" onClick={onUseTemplate} isDisabled={busy}>Use template</Button>
          ) : null}
        </Inline>
        {editable ? (
          <TextArea
            key={`${draftBoxKey(match)}|${boxRevision}`}
            id={draftId}
            defaultValue={draft}
            maxLength={MAX_DRAFT_CHARS}
            minimumRows={8}
            resize="vertical"
            onChange={(e) => {
              const text = changeText(e);
              if (text !== null) onDraftChange(text);
            }}
          />
        ) : (
          // Sent / skipped / not related: plain text, not a field (isReadOnly still shows a caret, isDisabled fades it).
          <Box xcss={readOnlyDraftStyle}>
            <Stack space="space.150">
              {draftParagraphs(draft).map((lines, p) => (
                <Stack key={p} space="space.0">
                  {lines.map((line, i) => <Text key={i}>{line || ' '}</Text>)}
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
        <Text size="small" color={wordCount(draft) > MAX_WORDS ? 'color.text.danger' : 'color.text.subtle'}>
          {`${wordCount(draft)} / ${MAX_WORDS} words`}
        </Text>
      </Stack>

      {editable ? (
        <Inline space="space.100" alignBlock="center" shouldWrap>
          {/* Phase 3: opens Rovo chat. */}
          <Button isDisabled>Improve with Rovo</Button>
          <Button onClick={onSkip} isDisabled={busy}>Skip</Button>
          <Button onClick={onNotRelated} isDisabled={busy}>Not related</Button>
          <Button appearance="primary" onClick={onSend} isDisabled={!canSend(draft, busy)}>Send and next</Button>
        </Inline>
      ) : null}
    </Stack>
  );
};

export default MatchPanel;
