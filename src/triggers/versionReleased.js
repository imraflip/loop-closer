// Runs the scan when a Jira version is released (avi:jira:released:version).
// Payload: event.version = { id, projectId, name, releaseDate?, released, ... }
import { scanRelease } from '../lib/scan.js';

export async function onVersionReleased(event) {
  const version = event?.version;
  if (!version?.id) {
    console.warn('version released event without a version id');
    return;
  }
  console.log(`version released: ${version.name} (${version.id})`);
  // Runs as the app: there is no user in a product trigger.
  // scanRelease logs its own result and never throws.
  await scanRelease(version.id, { asUser: false });
}
