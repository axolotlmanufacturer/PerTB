import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ticket 0.3 / known trap 12.
 *
 * `src/lib/affiliate.ts` encodes URL parameters that are contractual with
 * Amazon Associates and the eBay Partner Network. Dropping `mkevt` or `toolid`
 * silently zeroes revenue — the links keep working, they just stop paying, and
 * nothing in the test suite or the UI would notice.
 *
 * ESLint has no per-file "lint but never autofix" switch, so the guarantee is
 * this test: run the fixer and the formatter against a copy of the repo state
 * and assert the file comes back byte-identical.
 *
 * The file does not exist until ticket 2.5. Until then this test asserts the
 * *configuration* is in place, so the protection is live the moment the file
 * lands rather than being retrofitted after the first bad autofix.
 */

const ROOT = resolve(__dirname, '..', '..');
const AFFILIATE_REL = 'src/lib/affiliate.ts';
const AFFILIATE_ABS = join(ROOT, AFFILIATE_REL);

function run(bin: string, args: string[]): void {
  execFileSync(join(ROOT, 'node_modules', '.bin', bin), args, {
    cwd: ROOT,
    stdio: 'pipe',
  });
}

describe('affiliate.ts is protected from autofix', () => {
  it('is excluded from Prettier', () => {
    const ignore = readFileSync(join(ROOT, '.prettierignore'), 'utf8');
    expect(ignore).toMatch(/^src\/lib\/affiliate\.ts$/m);
  });

  it('has an ESLint block disabling fixable rules for it', () => {
    const config = readFileSync(join(ROOT, 'eslint.config.mjs'), 'utf8');
    expect(config).toContain('affiliate-no-autofix');
    expect(config).toContain(AFFILIATE_REL);
  });

  it.skipIf(!existsSync(AFFILIATE_ABS))(
    'survives eslint --fix and prettier --write byte-identical',
    () => {
      const before = readFileSync(AFFILIATE_ABS);
      const backupDir = mkdtempSync(join(tmpdir(), 'affiliate-guard-'));
      const backup = join(backupDir, 'affiliate.ts');
      copyFileSync(AFFILIATE_ABS, backup);

      try {
        run('eslint', [AFFILIATE_REL, '--fix']);
        run('prettier', ['--write', AFFILIATE_REL]);

        const after = readFileSync(AFFILIATE_ABS);
        expect(after.equals(before)).toBe(true);
      } finally {
        // Restore unconditionally: a failing assertion must not leave a
        // rewritten affiliate.ts in the working tree.
        copyFileSync(backup, AFFILIATE_ABS);
        rmSync(backupDir, { recursive: true, force: true });
      }
    },
  );
});
