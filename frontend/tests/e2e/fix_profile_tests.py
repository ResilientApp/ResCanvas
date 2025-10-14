#!/usr/bin/env python3
"""
Fix profile.spec.js tests to use addInitScript instead of evaluate for localStorage.
This ensures localStorage is set BEFORE the Layout component mounts.
"""

import re

# Read the file
with open('profile.spec.js', 'r') as f:
    content = f.read()

# Remove the beforeEach that navigates to home (conflicts with addInitScript approach)
content = re.sub(
    r'  test\.beforeEach\(async \(\{ page \}\) => \{\s*// Navigate to home page\s*await page\.goto\(\'http://localhost:3000\'\);\s*\}\);',
    '',
    content,
    flags=re.MULTILINE
)

# Pattern 1: Replace goto + registerAndLogin + evaluate + goto profile
# with registerAndLogin + addInitScript + goto profile
pattern1 = r'''    await page\.goto\('http://localhost:3000'\);\s*
    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.evaluate\(\(auth\) => \{\s*
        localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
      \}, auth\);\s*
\s*
    // Navigate to profile\s*
    await page\.goto\('http://localhost:3000/profile'\);'''

replacement1 = r'''    const auth = await registerAndLogin(page, '\1', '\2');
    await page.addInitScript((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    await page.goto('http://localhost:3000/profile');'''

content = re.sub(pattern1, replacement1, content, flags=re.MULTILINE)

# Pattern 2: For tests that don't navigate to profile but to dashboard
pattern2 = r'''    await page\.goto\('http://localhost:3000'\);\s*
    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.evaluate\(\(auth\) => \{\s*
        localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
      \}, auth\);\s*
\s*
    // Navigate to dashboard first\s*
    await page\.goto\('http://localhost:3000/dashboard'\);'''

replacement2 = r'''    const auth = await registerAndLogin(page, '\1', '\2');
    await page.addInitScript((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);

    await page.goto('http://localhost:3000/dashboard');'''

content = re.sub(pattern2, replacement2, content, flags=re.MULTILINE)

# Pattern 3: Any remaining goto + registerAndLogin + evaluate patterns
pattern3 = r'''    await page\.goto\('http://localhost:3000'\);\s*
    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.evaluate\(\(auth\) => \{\s*
        localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
      \}, auth\);'''

replacement3 = r'''    const auth = await registerAndLogin(page, '\1', '\2');
    await page.addInitScript((auth) => {
      localStorage.setItem('auth', JSON.stringify(auth));
    }, auth);'''

content = re.sub(pattern3, replacement3, content, flags=re.MULTILINE)

# Write back
with open('profile.spec.js', 'w') as f:
    f.write(content)

print("Fixed profile.spec.js")
