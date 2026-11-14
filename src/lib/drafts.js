// templateDraft(): builds the default reply draft for a match (templates in design.md).
// The agent's name is unknown at scan time, so stored drafts keep AGENT_PLACEHOLDER;
// the inbox resolvers and sendReply replace it with fillAgentName() for every draft source.

export const MAX_WORDS = 120;
export const AGENT_PLACEHOLDER = '{agentFirstName}';
export const MAX_DRAFT_CHARS = 1500; // updateMatch and the reply box use the same limit
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

// First name from a display name; "there" when missing, so the greeting reads "Hi there".
// Email-like names ("ana.lima@example.com"): part before @, first piece split on . _ or -, capitalized ("Ana").
// Otherwise the first word. Never returns the email address.
export function firstWord(name) {
  const text = String(name ?? '').trim();
  if (text.includes('@')) {
    const piece = text.split('@')[0].split(/[._\-\s]+/).filter(Boolean)[0];
    return piece ? piece[0].toUpperCase() + piece.slice(1) : 'there';
  }
  return words(text)[0] || 'there';
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

export const AGENT_NAME_FALLBACK = 'Support';
// Also catches small variants a person or Rovo might type: "{ agentFirstName }", "{AgentFirstName}".
const PLACEHOLDER_RE = /\{\s*agentFirstName\s*\}/gi;

// First word of the signed-in user's display name; "Support" when unknown.
export function agentFirstName(agentDisplayName) {
  if (!String(agentDisplayName ?? '').trim()) return AGENT_NAME_FALLBACK;
  const name = firstWord(agentDisplayName);
  return name === 'there' ? AGENT_NAME_FALLBACK : name;
}

// True when the draft says something besides the sign-off placeholder.
export function hasReplyText(draft) {
  return String(draft ?? '').replace(PLACEHOLDER_RE, '').trim() !== '';
}

// Swaps the placeholder for the signed-in user's first name (any draft source), or "Support".
// Used when the inbox shows a draft and when sendReply posts it, so the braces never reach anyone.
export function fillAgentName(draft, agentDisplayName) {
  return String(draft ?? '').replace(PLACEHOLDER_RE, agentFirstName(agentDisplayName)).trimEnd();
}
