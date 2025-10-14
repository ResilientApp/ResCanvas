# Migration Checklist - Unified Test Runner

## Pre-Migration Validation ✅

- [x] Unified script created: `scripts/run_all_tests_unified.sh`
- [x] Script syntax validated (no bash errors)
- [x] Script made executable (chmod +x)
- [x] Documentation created
  - [x] Usage guide: `scripts/README_UNIFIED_TESTS.md`
  - [x] Analysis document: `scripts/CONSOLIDATION_ANALYSIS.md`
  - [x] Implementation summary: `scripts/IMPLEMENTATION_SUMMARY.md`
  - [x] Quick reference: `scripts/test_reference.sh`

## Testing the Unified Script

### Step 1: Quick Syntax Check ✅
```bash
bash -n scripts/run_all_tests_unified.sh
# Expected: No output (syntax is valid)
```
**Status**: ✅ PASSED

### Step 2: Dry Run (Recommended)
```bash
# Make sure backend and frontend are running first
# Check backend: curl http://localhost:10010/health
# Check frontend: curl http://localhost:3000

# Then run the unified script
./scripts/run_all_tests_unified.sh
```
**Expected**:
- All test phases execute
- No tests skipped
- Clear pass/fail summary
- Coverage reports generated

### Step 3: Test Server Auto-Start (Optional)
```bash
# Stop all servers first
lsof -ti:10010 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# Run unified script (it should start servers)
./scripts/run_all_tests_unified.sh
```
**Expected**:
- Script detects no servers running
- Starts backend on port 10010
- Starts frontend on port 3000
- Runs all tests
- Cleans up servers on exit

## Migration Actions

### Phase 1: Backup Original Scripts
```bash
# Create legacy directory
mkdir -p scripts/legacy

# Backup all four original scripts
cp frontend/run-all-tests.sh scripts/legacy/frontend_run-all-tests.sh.bak
cp scripts/run_all_tests_complete.sh scripts/legacy/run_all_tests_complete.sh.bak
cp scripts/run_all_tests.sh scripts/legacy/run_all_tests.sh.bak
cp scripts/run_playwright_tests.sh scripts/legacy/run_playwright_tests.sh.bak

# Verify backups
ls -lh scripts/legacy/
```
**Status**: [ ] TODO

### Phase 2: Update CI/CD Configuration

#### GitHub Actions (if using)
```yaml
# .github/workflows/tests.yml
- name: Run All Tests
  run: |
    chmod +x scripts/run_all_tests_unified.sh
    ./scripts/run_all_tests_unified.sh
```

#### GitLab CI (if using)
```yaml
# .gitlab-ci.yml
test:
  script:
    - chmod +x scripts/run_all_tests_unified.sh
    - ./scripts/run_all_tests_unified.sh
```

#### Jenkins (if using)
```groovy
stage('Test') {
    steps {
        sh 'chmod +x scripts/run_all_tests_unified.sh'
        sh './scripts/run_all_tests_unified.sh'
    }
}
```

**Status**: [ ] TODO

### Phase 3: Update Documentation

#### Files to Update:
- [ ] `README.md` - Update test running instructions
- [ ] `CI_CD.md` - Update CI/CD pipeline examples
- [ ] `CONTRIBUTING.md` - Update developer testing guidelines
- [ ] Any developer onboarding docs

#### Example README.md Section:
```markdown
## Running Tests

Run all tests with a single command:
```bash
./scripts/run_all_tests_unified.sh
```

This will run:
- Backend unit, integration, and E2E tests
- Frontend unit tests
- All Playwright E2E tests (9 test files)
- Generate coverage reports

See `scripts/README_UNIFIED_TESTS.md` for more details.
```

**Status**: [ ] TODO

### Phase 4: Update Scripts Directory README

Create or update `scripts/README.md`:
```markdown
# Test Scripts

## Current (Unified)
- `run_all_tests_unified.sh` - **USE THIS** - Comprehensive test runner
- `test_reference.sh` - Quick reference for test commands

## Documentation
- `README_UNIFIED_TESTS.md` - Full usage guide
- `CONSOLIDATION_ANALYSIS.md` - Analysis of script consolidation
- `IMPLEMENTATION_SUMMARY.md` - Implementation details

## Legacy (Archived)
- `legacy/` - Old test scripts (kept for reference)
```

**Status**: [ ] TODO

### Phase 5: Test in Different Environments

- [ ] Test on local development machine
- [ ] Test in CI/CD environment
- [ ] Test with servers already running
- [ ] Test with servers not running
- [ ] Test all exit codes (success and failure scenarios)

### Phase 6: Remove or Archive Old Scripts (After Validation)

**Option A: Archive** (Recommended initially)
```bash
# Keep in legacy folder for reference
# Already done if you completed Phase 1
```

**Option B: Remove** (After thorough validation)
```bash
# Remove from main directories (backups in legacy/)
rm frontend/run-all-tests.sh
rm scripts/run_all_tests_complete.sh
rm scripts/run_all_tests.sh
rm scripts/run_playwright_tests.sh
```

**Status**: [ ] TODO (Wait for validation period)

## Validation Period

### Recommended Timeline: 1-2 weeks

During this period:
1. Use unified script for all test runs
2. Monitor for any issues or missing tests
3. Compare results with old scripts (if needed)
4. Gather feedback from team members
5. Document any edge cases

### Validation Checklist:
- [ ] All backend unit tests execute correctly
- [ ] All backend integration tests execute correctly
- [ ] All backend E2E tests execute correctly
- [ ] Coverage reports generate successfully
- [ ] Frontend unit tests execute correctly
- [ ] All 9 Playwright E2E tests execute individually
- [ ] Server auto-start works when needed
- [ ] Server cleanup works on exit/interrupt
- [ ] No tests are skipped inappropriately
- [ ] Exit codes are correct (0 for pass, 1 for fail)
- [ ] CI/CD integration works

## Communication

### Team Announcement Template:
```
📢 Test Runner Update

We've consolidated our 4 test runner scripts into a single unified script!

🎯 New Command:
./scripts/run_all_tests_unified.sh

✅ Benefits:
- Single command runs ALL tests (no skips!)
- Better error reporting
- Automatic server management
- Individual E2E test tracking
- Comprehensive coverage reports

📚 Documentation:
- Usage: scripts/README_UNIFIED_TESTS.md
- Quick ref: scripts/test_reference.sh

🔄 Migration:
Old scripts are backed up in scripts/legacy/
Please use the new unified script going forward.

Questions? Check the docs or ask in #dev-channel
```

## Rollback Plan

If issues are discovered:

### Temporary Rollback:
```bash
# Use legacy scripts from backup
./scripts/legacy/run_all_tests.sh.bak
```

### Permanent Rollback (if needed):
```bash
# Restore old scripts
cp scripts/legacy/*.bak scripts/
cp scripts/legacy/frontend_run-all-tests.sh.bak frontend/run-all-tests.sh

# Remove .bak extensions
cd scripts
for f in *.bak; do mv "$f" "${f%.bak}"; done
```

## Success Criteria

Migration is considered successful when:

- ✅ Unified script runs without errors
- ✅ All tests execute (no inappropriate skips)
- ✅ Coverage reports generate correctly
- ✅ CI/CD pipelines use new script successfully
- ✅ Team is comfortable with new script
- ✅ Documentation is updated
- ✅ No critical issues for 1-2 weeks

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Pre-Migration Validation | Complete | ✅ Done |
| Initial Testing | 1-2 days | [ ] TODO |
| Team Rollout | 1 week | [ ] TODO |
| Validation Period | 1-2 weeks | [ ] TODO |
| Documentation Updates | Ongoing | [ ] TODO |
| Archive Old Scripts | After validation | [ ] TODO |

## Notes

- Keep this checklist updated as you complete each step
- Document any issues or edge cases discovered
- Update the unified script if improvements are needed
- Gather team feedback during validation period

---

**Created**: October 14, 2025
**Last Updated**: October 14, 2025
**Completed By**: _____________________
**Validation Complete**: _____________________
