// Demo data texts from docs/spec/setup.md (7b and 7c), used by the matcher tests.

export const BUGS = [
  {
    key: 'LOOP-1',
    summary: 'PDF export times out on large reports',
    description: 'Exporting a report with more than 200 rows to PDF times out after 30 seconds.',
    components: ['Export'],
  },
  {
    key: 'LOOP-2',
    summary: 'Dark mode setting resets after logging in',
    description: 'Users who turn on dark mode find it switched back to the light theme after they log out and log back in.',
    components: ['Settings'],
  },
  {
    key: 'LOOP-3',
    summary: 'CSV import removes accented characters',
    description: 'Importing a CSV file drops letters such as é, ü and ñ from customer names.',
    components: ['Import'],
  },
];

// linkedTo: the bug this request is linked to in Jira (null = not linked).
export const REQUESTS = [
  { key: 'HELP-1', customer: 'Ana', summary: "Can't export my monthly report to PDF", description: 'Every time I export the monthly report as PDF it spins and then says timeout. It is a big report.', linkedTo: 'LOOP-1' },
  { key: 'HELP-2', customer: 'Budi', summary: 'Dark mode keeps turning off', description: 'I switch on dark mode but after I sign in the next day it is back to light.', linkedTo: 'LOOP-2' },
  { key: 'HELP-3', customer: 'Chen', summary: 'Names with accents broken after import', description: 'We imported our customer list and names like José lost the accent letters.', linkedTo: 'LOOP-3' },
  { key: 'HELP-4', customer: 'Dewi', summary: 'PDF download fails for large exports', description: 'Large exports to PDF fail with a timeout message.', linkedTo: 'LOOP-1' },
  { key: 'HELP-5', customer: 'Eko', summary: 'Report PDF never finishes', description: 'Exporting our sales report to PDF times out every time. Smaller reports are fine.', linkedTo: null },
  { key: 'HELP-6', customer: 'Fatima', summary: 'Theme resets to light after login', description: 'Dark mode resets whenever I log in again.', linkedTo: null },
  { key: 'HELP-7', customer: 'Gilang', summary: 'Import ruins customer names', description: 'After the CSV import, accented letters like é disappear from names.', linkedTo: null },
  { key: 'HELP-8', customer: 'Hana', summary: 'Timeout when exporting PDF', description: 'The PDF export of our yearly report times out.', linkedTo: null },
  { key: 'HELP-9', customer: 'Ivan', summary: 'Dark mode setting not saved', description: 'The dark mode setting is not saved after logging out and in.', linkedTo: null },
  { key: 'HELP-10', customer: 'Joko', summary: 'CSV import drops ñ and ü', description: 'Our Spanish and German customer names lose letters when we import the CSV file.', linkedTo: null },
  { key: 'HELP-11', customer: 'Kirana', summary: 'Export to Excel is slow', description: 'Excel export takes a long time but it does finish.', linkedTo: null },
  { key: 'HELP-12', customer: 'Lukas', summary: 'How do I change my password?', description: 'I want to update my password after I log in.', linkedTo: null },
];

// Scan step 6 only scores requests that are not already linked.
export const UNLINKED = REQUESTS.filter((r) => !r.linkedTo);

export const byKey = (key) => REQUESTS.find((r) => r.key === key);

// The same data shaped like Jira search results (ADF descriptions, issuelinks on the bugs).
const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

export const BUG_ISSUES = BUGS.map((b) => ({
  key: b.key,
  fields: {
    summary: b.summary,
    description: adf(b.description),
    components: b.components.map((name) => ({ name })),
    issuelinks: REQUESTS.filter((r) => r.linkedTo === b.key).map((r) => ({ outwardIssue: { key: r.key, fields: { summary: r.summary } } })),
  },
}));

export const REQUEST_ISSUES = REQUESTS.map((r, i) => ({
  key: r.key,
  fields: {
    summary: r.summary,
    description: adf(r.description),
    reporter: { displayName: r.customer, accountId: `acc-${i + 1}` },
    created: '2026-11-01T10:00:00.000+0000',
    components: [],
  },
}));
