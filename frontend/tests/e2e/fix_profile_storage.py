#!/usr/bin/env python3
"""
Fix profile tests to manually dispatch storage event after setting localStorage.
"""

import re

with open('profile.spec.js', 'r') as f:
    content = f.read()

# Replace all addInitScript patterns with the storage event dispatch pattern
pattern = r'''    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.addInitScript\(\(auth\) => \{\s*
      localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
    \}, auth\);

    await page\.goto\('http://localhost:3000/profile'\);'''

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
    }, auth);
    await page.goto('http://localhost:3000/profile');'''

content = re.sub(pattern, replacement, content, flags=re.MULTILINE)

# Pattern for dashboard navigations
pattern2 = r'''    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.addInitScript\(\(auth\) => \{\s*
      localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
    \}, auth\);

    await page\.goto\('http://localhost:3000/dashboard'\);'''

replacement2 = r'''    const auth = await registerAndLogin(page, '\1', '\2');
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
    }, auth);
    await page.goto('http://localhost:3000/dashboard');'''

content = re.sub(pattern2, replacement2, content, flags=re.MULTILINE)

# Pattern for tests that don't navigate anywhere (just check loading state)
pattern3 = r'''    const auth = await registerAndLogin\(page, '([^']+)', '([^']+)'\);\s*
    await page\.addInitScript\(\(auth\) => \{\s*
      localStorage\.setItem\('auth', JSON\.stringify\(auth\)\);\s*
    \}, auth\);'''

replacement3 = r'''    const auth = await registerAndLogin(page, '\1', '\2');
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

content = re.sub(pattern3, replacement3, content, flags=re.MULTILINE)

with open('profile.spec.js', 'w') as f:
    f.write(content)

print("Fixed all profile tests with storage event dispatch")
