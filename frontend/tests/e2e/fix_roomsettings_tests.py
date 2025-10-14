#!/usr/bin/env python3
"""
Fix roomSettings.spec.js tests to use addInitScript for single-page tests.
"""

import re

# Read the file
with open('roomSettings.spec.js', 'r') as f:
    content = f.read()

# Pattern: goto + registerAndLogin + evaluate -> registerAndLogin + addInitScript
# But only for single-page tests (not multi-context tests)
pattern = r'''    await page\.goto\('http://localhost:3000'\);\s*
    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.evaluate\(\(auth\) => \{\s*
      localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
    \}, auth\);'''

replacement = r'''    const auth = await registerAndLogin(page, '\1', '\2');
    await page.addInitScript((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);'''

content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

# Write back
with open('roomSettings.spec.js', 'w') as f:
    f.write(content)

print("Fixed roomSettings.spec.js")
