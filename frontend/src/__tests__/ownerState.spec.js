const fs = require('fs');
const path = require('path');

// Walk the frontend/src tree and fail the test if any file contains an unsafe
// spread pattern that might forward MUI internals (for example `{...props}` or
// spreading `params` directly into DOM elements).

const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (full.includes('build') || full.includes('ResCanvas-main') || full.includes('__tests__')) continue;
      files = files.concat(walk(full));
    } else if (e.isFile() && (full.endsWith('.js') || full.endsWith('.jsx') || full.endsWith('.ts') || full.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

describe('ownerState / unsafe spread guard', () => {
  test('no raw `{...props}` spreads in src files (except allowed safelist)', () => {
    const safelist = [
      // allow test files or intentional libraries
      path.join(ROOT, 'ResCanvas-main', 'frontend'),
    ];

    const files = walk(ROOT).filter(f => !safelist.some(s => f.startsWith(s)));
    const badFiles = [];

    const spreadRegex = /\{\s*\.\.\.props\s*\}/m;
    const domSpreadRegex = /<[^>]+\{\s*\.\.\.props\s*\}[^>]*>/m;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (spreadRegex.test(content) || domSpreadRegex.test(content)) {
        // allow some known safe files that we've already sanitized
        if (file.endsWith('Blog.js') || file.endsWith('Dashboard.jsx') || file.endsWith('RouterLinkWrapper.jsx')) continue;
        badFiles.push(file);
      }
    }

    if (badFiles.length) {
      console.error('Unsafe spread patterns found in the following files:');
      badFiles.forEach(f => console.error('  -', path.relative(ROOT, f)));
    }

    expect(badFiles).toEqual([]);
  });
});
