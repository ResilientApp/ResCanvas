#!/usr/bin/env python3
"""
Fix authentication token structure in all E2E test files.
Changes from: {access_token: token} to: {token, user}
"""

import re
import sys

def fix_register_and_login_helper(content):
    """Fix the registerAndLogin helper function"""
    # Pattern for the helper function
    old_pattern = r'''// Helper: Register and login a user
async function registerAndLogin\(page, username, password\) \{
  // Register user via API
  const registerResponse = await page\.request\.post\('http://localhost:10010/auth/register', \{
    data: \{
      username: username,
      password: password,
      email: `\$\{username\}@test\.com`
    \}
  \}\);

  if \(!registerResponse\.ok\(\)\) \{
    // User might already exist, try login
    const loginResponse = await page\.request\.post\('http://localhost:10010/auth/login', \{
      data: \{ username, password \}
    \}\);
    const loginData = await loginResponse\.json\(\);
    return loginData\.access_token;
  \}

  const registerData = await registerResponse\.json\(\);
  return registerData\.access_token;
\}'''
    
    new_pattern = '''// Helper: Register and login a user - returns {token, user}
async function registerAndLogin(page, username, password) {
  // Register user via API
  const registerResponse = await page.request.post('http://localhost:10010/auth/register', {
    data: {
      username: username,
      password: password,
      email: `${username}@test.com`
    }
  });

  if (!registerResponse.ok()) {
    // User might already exist, try login
    const loginResponse = await page.request.post('http://localhost:10010/auth/login', {
      data: { username, password }
    });
    const loginData = await loginResponse.json();
    return { token: loginData.token, user: loginData.user };
  }

  const registerData = await registerResponse.json();
  return { token: registerData.token, user: registerData.user };
}'''
    
    content = re.sub(old_pattern, new_pattern, content, flags=re.MULTILINE)
    return content

def fix_token_usages(content):
    """Fix all token variable declarations and usages"""
    # Fix: const token1 = await registerAndLogin(...) -> const auth1 = await registerAndLogin(...)
    content = re.sub(
        r'const token(\d+) = await registerAndLogin\(',
        r'const auth\1 = await registerAndLogin(',
        content
    )
    
    # Fix: const token = await registerAndLogin(...) -> const auth = await registerAndLogin(...)
    content = re.sub(
        r'const token = await registerAndLogin\(',
        r'const auth = await registerAndLogin(',
        content
    )
    
    # Fix localStorage.setItem with token variable
    # Pattern: await page1.evaluate((token) => { localStorage.setItem('auth', JSON.stringify({ access_token: token })); }, token1);
    content = re.sub(
        r'''await (page\d*)\.evaluate\(\(token\) => \{
\s*localStorage\.setItem\('auth', JSON\.stringify\(\{ access_token: token \}\)\);
\s*\}, token(\d*)\);''',
        r'''await \1.evaluate((auth) => {
        localStorage.setItem('auth', JSON.stringify(auth));
      }, auth\2);''',
        content,
        flags=re.MULTILINE
    )
    
    # Fix: createRoom(page, token1, ...) -> createRoom(page, auth1.token, ...)
    content = re.sub(
        r'createRoom\((page\d*), token(\d*),',
        r'createRoom(\1, auth\2.token,',
        content
    )
    
    # Fix: createRoom(page, token, ...) -> createRoom(page, auth.token, ...)
    content = re.sub(
        r'createRoom\((page), token,',
        r'createRoom(\1, auth.token,',
        content
    )
    
    return content

def main():
    if len(sys.argv) != 2:
        print("Usage: fix_auth.py <file>")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # content = fix_register_and_login_helper(content)
    content = fix_token_usages(content)
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Fixed {filepath}")

if __name__ == '__main__':
    main()
