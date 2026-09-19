/**
 * Package Integrity Test
 *
 * Packs the tarball, installs it in a temp directory, and runs the CLI.
 * Catches issues like missing files in the `files` field (e.g., 1.18.0 breakage).
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execSync, execFileSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Package Integrity', () => {
  const tmpDirs = [];

  afterAll(() => {
    // Cleanup temp directories
    for (const dir of tmpDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('should run after npm pack (catches missing files)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'nansen-pack-test-'));
    tmpDirs.push(tmpDir);

    // Pack from repo root
    const packOutput = execSync('npm pack --json', {
      encoding: 'utf-8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const [packInfo] = JSON.parse(packOutput);
    const tgzPath = join(process.cwd(), packInfo.filename);

    // Install in isolated temp directory. --no-audit skips npm's post-install
    // vulnerability check: that network call has been hanging indefinitely
    // (not just slow) rather than failing, so nothing short of avoiding it
    // keeps this test from hanging the whole CI job.
    execSync('npm init -y', { cwd: tmpDir, stdio: 'ignore' });
    execSync(`npm install --omit=optional --no-audit --no-fund "${tgzPath}"`, { cwd: tmpDir, stdio: 'ignore' });

    // Every child (including background update checks) inherits a local-only transport.
    const capture = join(tmpDir, 'capture.mjs');
    writeFileSync(capture, `globalThis.fetch = async () => new Response(JSON.stringify({data: []}));`);
    const childEnv = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${capture}`, DO_NOT_TRACK: '1', NANSEN_NO_TELEMETRY: '1' };
    const packageRoot = join(tmpDir, 'node_modules/nansen-cli');
    const result = execFileSync(process.execPath, [join(packageRoot, 'src/index.js'), '--help'], { cwd: tmpDir, encoding: 'utf8', env: childEnv });
    const onboarding = execFileSync(process.execPath, [join(packageRoot, 'scripts/postinstall.js')], { cwd: tmpDir, encoding: 'utf8', env: { ...childEnv, npm_config_global: 'true' }, stdio: ['pipe', 'pipe', 'pipe'] });
    expect(onboarding).toBe('');
    const recovery = readFileSync(join(packageRoot, 'docs/browser-login.md'), 'utf8');
    expect(recovery).toContain('## Offline recovery without native locking');
    expect(recovery).toContain('v2');
    expect(existsSync(join(packageRoot, 'docs/releases/api508-evidence.json'))).toBe(false);
    expect(readFileSync(join(packageRoot, 'skills/nansen-wallet-profiler/SKILL.md'), 'utf8')).toContain('Browser rollout acceptance is still pending.');
    expect(result).toContain('nansen');
    expect(result).toContain('COMMANDS');
    expect(existsSync(join(tmpDir, 'node_modules/nansen-cli/docs/browser-login.md'))).toBe(true);
    expect(existsSync(join(tmpDir, 'node_modules/nansen-cli/src/auth-store-native.js'))).toBe(true);
    // Native auth modules must stay lazy when optional bindings are omitted.
    const apiModule = join(tmpDir, 'node_modules/nansen-cli/src/api.js');
    const stateModule = join(tmpDir, 'node_modules/nansen-cli/src/auth-state.js');
    const smoke = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { pathToFileURL } from 'node:url';
      const { NansenAPI } = await import(pathToFileURL(${JSON.stringify(apiModule)}));
      globalThis.fetch = async (_url, options) => {
        if (options.headers.apikey !== 'synthetic-key') throw new Error('wrong credential');
        return new Response(JSON.stringify({user_id:'synthetic'}));
      };
      await new NansenAPI('synthetic-key').getAccount();
      const { createAuthState } = await import(pathToFileURL(${JSON.stringify(stateModule)}));
      try { await createAuthState({directory:${JSON.stringify(join(tmpDir, 'auth'))}}).begin(); throw new Error('unexpected native availability'); }
      catch (error) { if(error.code !== 'AUTH_LOCK_UNAVAILABLE' || !error.message.includes('offline-recovery-without-native-locking')) throw error; }
      console.log('key-auth-without-native-ok');
    `], { cwd: tmpDir, encoding: 'utf8', env: childEnv });
    expect(smoke).toContain('key-auth-without-native-ok');

    // Cleanup tarball
    rmSync(tgzPath, { force: true });
  }, 60000); // real installs take a few seconds; the margin is for a cold CI runner, not the audit hang above

  it('should not include test files in package', () => {
    const packOutput = execSync('npm pack --dry-run --json', {
      encoding: 'utf-8',
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const [packInfo] = JSON.parse(packOutput);
    const files = packInfo.files.map(f => f.path);

    const testFiles = files.filter(f => f.includes('__tests__'));
    expect(testFiles).toHaveLength(0);
  });
});
