import { test, expect } from 'vitest';
import { adfToText } from '../src/lib/jira.js';

test('adfToText: null becomes an empty string', () => {
  expect(adfToText(null)).toBe('');
});

test('adfToText: a plain paragraph', () => {
  const adf = {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'PDF export times out' }] }],
  };
  expect(adfToText(adf)).toBe('PDF export times out');
});

test('adfToText: nested nodes are joined with spaces', () => {
  const adf = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello,' }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'export' }] }] },
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'big', marks: [{ type: 'strong' }] }, { type: 'text', text: 'reports' }] }],
          },
        ],
      },
    ],
  };
  expect(adfToText(adf)).toBe('Hello, export big reports');
});
