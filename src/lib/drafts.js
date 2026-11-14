// templateDraft(): builds the default reply draft for a match (templates in design.md).
// The agent's name is unknown at scan time, so drafts keep AGENT_PLACEHOLDER;
// sendReply replaces it with fillAgentName() for every draft source.

export const MAX_WORDS = 120;
export const AGENT_PLACEHOLDER = '{agentFirstName}';
const SUMMARY_CUT_WORDS = 60;

const TEMPLATES = {
  friendly: ({ firstName, requestSummary, releaseName }) =>
    `Hi ${firstName},\n\n` +
    `Good news: the problem you told us about, "${requestSummary}", is fixed in our latest release (${releaseName}).\n\n` +
    `If you still see it, just reply here and we will take another look.\n\n` +
    `Thanks for letting us know,\n${AGENT_PLACEHOLDER}`,
  formal: ({ firstName, requestSummary, releaseName }) =>
    `Dear ${firstName},\n\n` +
    `The issue you reported, "${requestSummary}", has been resolved in release ${releaseName}.\n\n` +
    `If the problem continues, please reply to this request and we will investigate further.\n\n` +
    `Kind regards,\n${AGENT_PLACEHOLDER}`,
};

const words = (text) => String(text ?? '').split(/\s+/).filter(Boolean);

export function wordCount(text) {
  return words(text).length;
}

// First word of a display name; "there" when missing, so the greeting reads "Hi there".
export function firstWord(name) {
  return words(name)[0] || 'there';
}

export function templateDraft(match, settings) {
  const render = settings?.tone === 'formal' ? TEMPLATES.formal : TEMPLATES.friendly;
  const fields = {
    firstName: firstWord(match?.customerName),
    releaseName: String(match?.releaseName ?? '').trim(),
  };

  // Shorten the customer's summary only when the full draft would go over MAX_WORDS.
  const summaryWords = words(match?.requestSummary);
  const budget = MAX_WORDS - (wordCount(render({ ...fields, requestSummary: 'x' })) - 1);
  let requestSummary = summaryWords.join(' ');
  if (summaryWords.length > budget) {
    requestSummary = `${summaryWords.slice(0, Math.max(1, Math.min(SUMMARY_CUT_WORDS, budget))).join(' ')}…`;
  }
  return render({ ...fields, requestSummary });
}

// Used by sendReply: swaps the placeholder for the agent's first name (template, edited or Rovo drafts).
// With no agent name, the placeholder is removed.
export function fillAgentName(draft, agentDisplayName) {
  const name = words(agentDisplayName)[0] || '';
  return String(draft ?? '').split(AGENT_PLACEHOLDER).join(name).trimEnd();
}
