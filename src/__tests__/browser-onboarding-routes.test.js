import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { runCLI, SCHEMA } from '../cli.js';
import { NansenAPI } from '../api.js';
import { createAuthState } from '../auth-state.js';
import { createAuthStore } from '../auth-store.js';
import { resolveCredential } from '../auth-credentials.js';
import { memoryOperation, sessionFixture } from './fixtures/auth-fixture.js';
import contract from './fixtures/api508-admitted-routes.json';
import examples from './fixtures/api508-skill-commands.json';

// Ancillary traffic is captured too; the resource transport below is real NansenAPI.request.
vi.mock('../update-check.js', () => ({ getUpdateNotification: () => null, getUpgradeNotice: () => null, scheduleUpdateCheck: vi.fn() }));
vi.mock('../cost-cache.js', () => ({ refreshCostMapIfStale: vi.fn(), getCostForEndpoint: () => null, creditsCharged: () => null }));
const admitted = new Set(contract.routes.map(r => r.join(' ')));
const conditional = [...new Set(examples.filter(r => r.admitted && !r.file.includes('agent-guide') && !r.file.includes('defi-positions')).map(r => r.file.split('/')[1]))];
const keyOnly = ['agent-guide', 'defi-positions', 'web-searcher', 'web-fetcher', 'smart-alerts', 'alerts-webhook-listener', 'trading', 'limit-orders', 'wallet-manager', 'wallet-keychain-migration'];
let state, selection, bundle;
const unexpected = vi.fn(() => { throw new Error('Unexpected issuer/retirement request'); });
beforeAll(async () => {
  vi.stubEnv('DO_NOT_TRACK', '1'); vi.stubEnv('NANSEN_NO_TELEMETRY', '1');
  bundle = sessionFixture();
  state = createAuthState({ directory: path.join(process.env.HOME, '.nansen'), store: createAuthStore(memoryOperation()), retire: unexpected, refresh: unexpected });
  const operation = await state.begin(); await state.install(operation, { bundle, baseUrl: bundle.audience }); await state.finish(operation);
  selection = resolveCredential();
});
afterAll(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
class SessionAPI extends NansenAPI {
  constructor(_key, _base, options) { super(undefined, bundle.audience, { ...options, credential: selection, authState: state, retry: { maxRetries: 0 } }); }
}
function assertComplete(result, calls, failures) {
  expect(result.code).toBe(0); expect(result.value?.type).toBe('success');
  expect(JSON.stringify(result.value?.data)).not.toMatch(/"error"\s*:/);
  expect(calls.length).toBeGreaterThan(0); expect(failures).toEqual([]);
}
async function dispatch(args, { fail = false, expand = false } = {}) {
  const calls = [], failures = [], output = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const endpoint = new URL(url).pathname;
    const route = `${options.method || 'GET'} ${endpoint}`;
    calls.push(route);
    expect(new URL(url).origin).toBe(bundle.audience);
    expect(options.headers.Authorization).toBe(`Bearer ${bundle.accessToken}`);
    expect(options.headers.apikey).toBeUndefined();
    if (fail) { failures.push(route); return new Response(JSON.stringify({ error: 'synthetic failure' }), { status: 400 }); }
    const data = expand && endpoint.endsWith('/counterparties') ? [{ counterparty_address: '0x0000000000000000000000000000000000000003', volume_usd: 1 }] : [];
    return new Response(JSON.stringify({ data }));
  }));
  let code = 0;
  const value = await runCLI(args, { NansenAPIClass: SessionAPI, isTTY: false, output: x => output.push(x), errorOutput: x => output.push(x), log: x => output.push(x), exit: x => { code = x; } });
  for (const secret of [bundle.accessToken, bundle.refreshToken, bundle.privateJwk.d]) expect(JSON.stringify(output)).not.toContain(secret);
  expect(unexpected).not.toHaveBeenCalled();
  return { result: { code, value }, calls, failures };
}
describe('published skill commands against frozen API505 method/path contract', () => {
  it('pins 58 unique routes and exactly 23 conditional / 10 key-only skills', () => {
    expect(admitted.size).toBe(58); expect(conditional).toHaveLength(23);
    for (const name of conditional) {
      const text = fs.readFileSync(`skills/${name}/SKILL.md`, 'utf8');
      const metadata = text.split('---')[1];
      expect(metadata).not.toContain('NANSEN_API_KEY');
      expect(text).toContain('Browser rollout acceptance is still pending.');
    }
    for (const name of keyOnly) expect(fs.readFileSync(`skills/nansen-${name}/SKILL.md`, 'utf8').split('---')[1]).toContain('NANSEN_API_KEY');
  });
  it('inventories every literal research example, including embedded scripts and reference files', () => {
    const actual = [];
    for (const name of fs.readdirSync('skills')) {
      for (const file of fs.readdirSync(`skills/${name}`).filter(f => f.endsWith('.md'))) {
        const filename = `skills/${name}/${file}`;
        const text = fs.readFileSync(filename, 'utf8').replace(/\\\n/g, ' ');
        for (const match of text.matchAll(/nansen research [^`\n]+/g)) {
          const example = match[0].split('#')[0].trim();
          if (example.includes('<sub>') || example.includes(' <command>')) continue;
          // Bare category references are prose, not executable examples.
          const words = example.split(/\s+/);
          if (words.length < 4) continue;
          if (words[2] !== 'search' && (words[3].startsWith('<') || ['skill','for'].includes(words[3]))) continue;
          actual.push({ file: filename, example });
        }
      }
    }
    expect(actual.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual(examples.map(({file,example}) => ({file,example})).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  });
  it.each(examples)('$file: $example', async row => {
    const { result, calls, failures } = await dispatch(row.args);
    assertComplete(result, calls, failures);
    expect([...new Set(calls)].sort()).toEqual(row.expectedRoutes);
    expect(calls.every(r => admitted.has(r))).toBe(row.admitted);
  });
  it.each([
    ['skills/nansen-sm-cross-chain-flows/SKILL.md', ['ethereum','solana','base','bnb']],
    ['skills/nansen-wallet-clustering/REFERENCE.md', ['base','arbitrum','optimism','polygon']],
  ])('expands every chain in the embedded loop in %s', async (file, chains) => {
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain(file.includes('sm-cross') ? `CHAINS=(${chains.join(' ')})` : `for CHAIN in ${chains.join(' ')}; do`);
    const row = examples.find(r => r.file === file && /\$chain/i.test(r.example));
    expect(row).toBeTruthy();
    for (const chain of chains) {
      const args = [...row.args]; args[args.indexOf('--chain') + 1] = chain;
      const { result, calls, failures } = await dispatch(args);
      assertComplete(result, calls, failures); expect(calls.every(r => admitted.has(r))).toBe(true);
    }
  });
  it('traverses a nonempty trace and refuses to treat partial composite results as acceptance', async () => {
    const row = examples.find(r => r.args.includes('trace'));
    const success = await dispatch([...row.args, '--delay', '0'], { expand: true });
    assertComplete(success.result, success.calls, success.failures);
    expect(success.calls.length).toBeGreaterThan(1);
    for (const sub of ['trace','batch','compare']) {
      const example = examples.find(r => r.args.includes(sub));
      const partial = await dispatch(example.args, { fail: true });
      expect(() => assertComplete(partial.result, partial.calls, partial.failures)).toThrow();
    }
    const unknown = await dispatch(['research','token','not-a-command']);
    expect(() => assertComplete(unknown.result, unknown.calls, unknown.failures)).toThrow();
  });
  it('keeps excluded route families out of the admitted fixture', () => {
    for (const route of admitted) expect(route).not.toMatch(/\/agent\/|\/portfolio\/|\/web\/|\/beta\/|\/internal\/|\/execution\/|\/wallet\//);
  });
  it('renders login, account, auth and schema guidance through public commands', async () => {
    const output = [];
    for (const args of [['--help'],['login','--help'],['auth','--help'],['account','--help'],['schema']]) {
      const result = await runCLI(args, { output: x => output.push(x), errorOutput: x => output.push(x), exit: code => { throw new Error(`Unexpected help exit ${code}`); } });
      expect(result).toBeTruthy();
    }
    const text = output.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join('\n');
    for (const phrase of ['NANSEN_API_KEY','--no-browser','--human','unverified','402']) expect(text).toContain(phrase);
    expect(SCHEMA.commands.login.description).toContain('fresh');
    expect(SCHEMA.commands.research.description).toContain('stable-v1 direct-data');
  });
});
