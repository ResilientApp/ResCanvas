#!/usr/bin/env python3
"""
Fix roomSettings tests to manually dispatch storage event.
"""

import re

with open('roomSettings.spec.js', 'r') as f:
    content = f.read()

# Replace addInitScript patterns
pattern = r'''    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.addInitScript\(\(auth\) => \{\s*
      localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
    \}, auth\);'''

replacement = r'''    const auth = await registerAndLogin(page, '\1', '\2');
    await page.goto('http://localhost:3000/');
    await page.evaluate((auth) => {
      const authStr = JSON.stringify(auth);
      localStorage.setItem('auth', authStr);
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'auth',
        newValue: authStr,
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href
      }));
    }, auth);'''

content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

with open('roomSettings.spec.js', 'w') as f:
    f.write(content)

print("Fixed roomSettings tests with storage event dispatch")
