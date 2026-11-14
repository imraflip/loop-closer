// Service desk helpers: request status, add a public comment and resolve a request.
// All calls run as the current user (asUser), so the agent is the comment author.
import api, { route } from '@forge/api';

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

export function checkRequestKey(key) {
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(String(key))) throw new Error(`Bad request key: ${key}`);
  return key;
}

// Short reason from a failed JSM response ({ errorMessage } in the JSM error schema).
async function failure(res, what) {
  let reason = `${res.status}`;
  try {
    const text = await res.text();
    const msg = JSON.parse(text)?.errorMessage;
    reason = msg ? `${res.status} ${msg}` : `${res.status} ${text.slice(0, 200)}`;
  } catch {
    // keep the status code only
  }
  return new Error(`${what} failed: ${reason}`);
}

// GET /rest/servicedeskapi/request/{key} -> { status, statusCategory, requestTypeId }.
// statusCategory is UNDEFINED | NEW | INDETERMINATE | DONE. requestTypeId is null for work items created
// without a request type (for example with Jira's + Create button instead of the portal's Raise a request);
// the JSM comment API returns 404 for those.
// Only these fields are read; nothing else from the response (it includes reporter details) is kept.
export async function getRequestStatus(requestKey) {
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/request/${checkRequestKey(requestKey)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw await failure(res, 'Read request');
  const { currentStatus, requestTypeId } = await res.json();
  return {
    status: currentStatus?.status || '',
    statusCategory: currentStatus?.statusCategory || 'UNDEFINED',
    requestTypeId: requestTypeId ? String(requestTypeId) : null,
  };
}

// POST /rest/servicedeskapi/request/{key}/comment with { body, public: true }. Success is 201 only.
export async function addPublicComment(requestKey, body) {
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/request/${checkRequestKey(requestKey)}/comment`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ body, public: true }),
  });
  if (res.status !== 201) throw await failure(res, 'Post reply');
  const comment = await res.json();
  return { id: comment?.id ?? null };
}

// GET /rest/servicedeskapi/request/{key}/transition, then POST { id } for the transition whose
// name matches resolveStatusName (case-insensitive). Success is 204.
export async function resolveRequest(requestKey, resolveStatusName) {
  const key = checkRequestKey(requestKey);
  const wanted = String(resolveStatusName || '').trim().toLowerCase();
  const list = await api.asUser().requestJira(route`/rest/servicedeskapi/request/${key}/transition?limit=${50}`, {
    headers: { Accept: 'application/json' },
  });
  if (!list.ok) throw await failure(list, 'Read transitions');
  const transitions = (await list.json())?.values || [];
  const match = transitions.find((t) => String(t.name || '').trim().toLowerCase() === wanted);
  if (!match) {
    const names = transitions.map((t) => t.name).join(', ') || 'none';
    throw new Error(`no transition named "${resolveStatusName}" (available: ${names})`);
  }
  const res = await api.asUser().requestJira(route`/rest/servicedeskapi/request/${key}/transition`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ id: String(match.id) }),
  });
  if (res.status !== 204) throw await failure(res, 'Resolve request');
  return { transitionId: String(match.id), name: match.name };
}
