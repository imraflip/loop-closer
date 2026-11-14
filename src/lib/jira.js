// Jira REST helpers (searchJql, getVersion, getFixedBugs, getOpenRequests) and adfToText().
import api, { route } from '@forge/api';

const PAGE_SIZE = 100;
const MAX_ISSUES = 300;
const REQUEST_FIELDS = ['summary', 'description', 'reporter', 'created', 'components'];

function jira(asUser) {
  return asUser ? api.asUser() : api.asApp();
}

async function readJson(res, what) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${what} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Guard values we put inside JQL so a bad setting cannot change the query.
function checkProjectKey(key) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(String(key))) throw new Error(`Bad project key: ${key}`);
  return key;
}
function checkId(id) {
  if (!/^\d+$/.test(String(id))) throw new Error(`Bad id: ${id}`);
  return id;
}

export async function searchJql(jql, fields, { asUser = false } = {}) {
  const issues = [];
  let nextPageToken;
  do {
    const body = { jql, fields, maxResults: PAGE_SIZE };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await jira(asUser).requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const page = await readJson(res, 'JQL search');
    issues.push(...(page.issues || []));
    nextPageToken = page.isLast ? undefined : page.nextPageToken;
  } while (nextPageToken && issues.length < MAX_ISSUES);
  return issues.slice(0, MAX_ISSUES);
}

export async function getVersion(versionId, { asUser = false } = {}) {
  const res = await jira(asUser).requestJira(route`/rest/api/3/version/${versionId}`, {
    headers: { Accept: 'application/json' },
  });
  return readJson(res, 'Get version');
}

export function getFixedBugs(versionId, jiraKey, { asUser = false } = {}) {
  const jql = `project = ${checkProjectKey(jiraKey)} AND fixVersion = ${checkId(versionId)} AND issuetype = Bug`;
  return searchJql(jql, ['summary', 'description', 'components', 'issuelinks'], { asUser });
}

export function getOpenRequests(jsmKey, lookbackDays, { asUser = false } = {}) {
  const jql = `project = ${checkProjectKey(jsmKey)} AND statusCategory != Done AND created >= -${checkId(lookbackDays)}d`;
  return searchJql(jql, REQUEST_FIELDS, { asUser });
}

// Linked requests missing from getOpenRequests: open ones only, no created limit.
export function getOpenRequestsByKeys(keys, { asUser = false } = {}) {
  if (!keys.length) return Promise.resolve([]);
  for (const k of keys) {
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(String(k))) throw new Error(`Bad issue key: ${k}`);
  }
  const jql = `key in (${keys.join(', ')}) AND statusCategory != Done`;
  return searchJql(jql, REQUEST_FIELDS, { asUser });
}

// Atlassian Document Format -> plain text: every `text` value, joined with spaces.
export function adfToText(adf) {
  if (!adf || typeof adf !== 'object') return '';
  const parts = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(adf);
  return parts.join(' ');
}
