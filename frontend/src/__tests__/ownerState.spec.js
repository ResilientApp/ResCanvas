const fs = require('fs');
const path = require('path');


const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (full.includes('build') || full.includes('ResCanvas-main') || full.includes('__tests__') || full.includes('__mocks__')) continue;
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
      path.join(ROOT, 'ResCanvas-main', 'frontend'),
    ];

    const files = walk(ROOT).filter(f => !safelist.some(s => f.startsWith(s)));
    const badFiles = [];

    const spreadRegex = /\{\s*\.\.\.props\s*\}/m;
    const domSpreadRegex = /<[^>]+\{\s*\.\.\.props\s*\}[^>]*>/m;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (spreadRegex.test(content) || domSpreadRegex.test(content)) {
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
