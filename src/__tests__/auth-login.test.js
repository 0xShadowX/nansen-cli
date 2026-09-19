import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { browserLogin } from '../auth-login.js';
import { buildCommands, runCLI } from '../cli.js';
import { NansenAPI, loadConfig } from '../api.js';
import { createAuthState } from '../auth-state.js';
import { createAuthStore } from '../auth-store.js';
import { AuthError, authConfigView, resolveCredential } from '../auth-credentials.js';
import { getAuthStatus } from '../doctor.js';
import { buildMcpCommands } from '../commands/mcp.js';
import { sessionFixture, memoryOperation } from './fixtures/auth-fixture.js';
const dirs = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-login-')); dirs.push(home);
  const directory = path.join(home, '.nansen'); fs.mkdirSync(directory);
  const memory = memoryOperation();
  const store = createAuthStore(memory);
  const state = createAuthState({ directory, store, retire: async () => ({ remote: 'recorded_pending' }) });
  return { home, directory, memory, state, env: { HOME: home }, file: path.join(directory, 'config.json') };
}
describe('browser login public command integration', () => {
  it.each(['none', 'environment', 'saved-key', 'saved-session'])('fresh plain login from %s saves B and never prints secrets', async initial => {
    const f = fixture();
    if (initial === 'environment') f.env.NANSEN_API_KEY = 'ENV_A';
    if (initial === 'saved-key') fs.writeFileSync(f.file, JSON.stringify({ apiKey: 'SAVED_A' }));
    if (initial === 'saved-session') {
      const a = await f.state.begin(); await f.state.install(a, { bundle: sessionFixture({ accountId: 'A' }), baseUrl: 'https://api.nansen.ai' }); await f.state.finish(a);
    }
    const bundle = sessionFixture(); const log = vi.fn(); const errorOutput = vi.fn();
    const pair = vi.fn(async (_client, options) => {
      await options.onPending({ verification_uri: 'https://idp.nansen.ai/device?user_code=ABCD-EFGH', user_code: 'ABCD-EFGH', expires_at: '2026-09-19T00:00:00Z' });
      options.onIssued(bundle); return bundle;
    });
    const openBrowser = vi.fn();
    const commands = buildCommands({ authState: f.state, env: f.env, log, errorOutput, isTTY: false, browserLoginFn: options => browserLogin({ ...options, pair, openBrowser, signals: new EventEmitter() }) });
    await commands.login([], null, { 'no-browser': true }, {});
    expect(pair).toHaveBeenCalledOnce(); expect(openBrowser).not.toHaveBeenCalled();
    const events = log.mock.calls.map(([line]) => JSON.parse(line));
    expect(events.map(e => e.event)).toEqual(['pending', 'saved']);
    expect(events[1].effective_source).toBe(initial === 'environment' ? 'env' : 'session');
    expect(JSON.parse(fs.readFileSync(f.file))).not.toHaveProperty('apiKey');
    const output = JSON.stringify([log.mock.calls, errorOutput.mock.calls, fs.readFileSync(f.file, 'utf8'), fs.readdirSync(path.join(f.directory, 'auth-operations')).filter(n => n.endsWith('.json')).map(n => fs.readFileSync(path.join(f.directory, 'auth-operations', n), 'utf8'))]);
    for (const secret of [bundle.accessToken, bundle.refreshToken, bundle.privateJwk.d]) expect(output).not.toContain(secret);
    const status = getAuthStatus({ env: f.env, passwordSourceFn: () => null });
    expect(status.saved_session.account_id).toBe('account-B'); expect(status.saved_session.validity).toBe('cached_unverified');
    expect(authConfigView(f.env).selected.kind).toBe(initial === 'environment' ? 'api-key' : 'session');
  });
  it('preflight failure prevents authorize and produces exactly one machine error', async () => {
    const pair = vi.fn(); const log = vi.fn();
    await expect(browserLogin({ state: { begin: async () => { throw new Error('native secret echo'); } }, env: {}, isTTY: false, log, pair, signals: new EventEmitter() })).rejects.toMatchObject({ reported: true });
    expect(pair).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce(); expect(log.mock.calls[0][0]).not.toContain('native secret echo');
  });
  it('cancels approval without replacing the previous key and emits one terminal event', async () => {
    const f = fixture(); fs.writeFileSync(f.file, JSON.stringify({ apiKey: 'A' }));
    const signals = new EventEmitter(); const log = vi.fn();
    const pair = async (_client, { signal }) => { signals.emit('SIGINT'); signal.throwIfAborted(); };
    await expect(browserLogin({ env: f.env, state: f.state, pair, signals, log, errorOutput: vi.fn(), isTTY: false })).rejects.toMatchObject({ code: 'PAIRING_CANCELLED' });
    expect(JSON.parse(fs.readFileSync(f.file)).apiKey).toBe('A');
    expect(log.mock.calls.map(([s]) => JSON.parse(s).event)).toEqual(['cancelled']);
    expect(signals.listenerCount('SIGINT')).toBe(0);
  });
  it.each(['verification', 'storage'])('preserves A and retires issued B after %s failure', async failure => {
    const f = fixture(); f.env.NANSEN_API_KEY = 'ENV_A';
    fs.writeFileSync(f.file, JSON.stringify({ apiKey: 'SAVED_A' }));
    const bundle = sessionFixture();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ refresh_family_revoked: true, access_tokens_revoked: false })));
    vi.stubGlobal('fetch', fetch);
    if (failure === 'storage') vi.spyOn(f.state.store, 'write').mockRejectedValue(new Error('write failure'));
    const pair = async (_client, { onIssued }) => {
      onIssued(bundle);
      if (failure === 'verification') throw new AuthError('SESSION_VERIFICATION_FAILED', 'Candidate rejected.');
      return bundle;
    };
    const log = vi.fn();
    await expect(browserLogin({ env: f.env, state: f.state, pair, log, errorOutput: vi.fn(), isTTY: false, signals: new EventEmitter() })).rejects.toThrow();
    expect(JSON.parse(fs.readFileSync(f.file)).apiKey).toBe('SAVED_A');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('https://idp.nansen.ai/token/revoke');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(f.memory.entries.size).toBe(0);
    expect(log.mock.calls.map(([line]) => JSON.parse(line).event)).toEqual(['error']);
    expect(JSON.stringify(log.mock.calls)).not.toContain(bundle.refreshToken);
  });
  it('legacy --human still prefers env and uses the state owner without prompting', async () => {
    const f = fixture(); f.env.NANSEN_API_KEY = 'key-A'; const promptFn = vi.fn();
    function API() { return { getAccount: async () => ({ credits_remaining: 0 }) }; }
    await buildCommands({ authState: f.state, env: f.env, promptFn, isTTY: false, log: vi.fn(), NansenAPIClass: API }).login([], null, { human: true }, {});
    expect(promptFn).not.toHaveBeenCalled(); expect(JSON.parse(fs.readFileSync(f.file))).toMatchObject({ apiKey: 'key-A', auth: { active: { kind: 'api-key' } } });
  });
  it('logout wins while an explicit key is still being verified', async () => {
    const f = fixture(); let release, started;
    const verifying = new Promise(resolve => { started = resolve; });
    function API() { return { getAccount: async () => { started(); return new Promise(resolve => { release = resolve; }); } }; }
    const commands = buildCommands({ authState: f.state, env: f.env, log: vi.fn(), NansenAPIClass: API });
    const login = commands.login([], null, {}, { 'api-key': 'candidate' });
    await verifying; await f.state.logout(); release({ credits_remaining: 0 });
    await expect(login).rejects.toMatchObject({ code: 'AUTH_SELECTION_CHANGED' });
    expect(JSON.parse(fs.readFileSync(f.file)).auth.active.kind).toBe('none');
  });
  it('keeps status entirely offline and does not open native storage', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await runCLI(['auth', 'status'], { output: vi.fn(), errorOutput: vi.fn(), exit: vi.fn() });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('selected credential and payment boundary', () => {
  it.each([401, 402, 403, 503])('a selected key receiving %s never enters automatic payment', async status => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'denied' }), { status })); vi.stubGlobal('fetch', fetch);
    const api = new NansenAPI('selected-invalid-A', 'https://api.nansen.ai', { retry: { maxRetries: 0 } });
    const paid = vi.spyOn(api, '_x402Retry');
    await expect(api.getAccount()).rejects.toMatchObject({ status });
    expect(paid).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('retains explicit manual payment alongside an API key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch);
    await new NansenAPI('A', 'https://api.nansen.ai', { defaultHeaders: { 'Payment-Signature': 'manual' } }).getAccount();
    expect(fetch.mock.calls[0][1].headers).toMatchObject({ apikey: 'A', 'Payment-Signature': 'manual' });
  });
  it('never exports a browser session through key-only trading or MCP seams', async () => {
    const f = fixture(); const bundle = sessionFixture(); const attempt = await f.state.begin();
    await f.state.install(attempt, { bundle }); await f.state.finish(attempt);
    vi.stubEnv('HOME', f.home); vi.stubEnv('NANSEN_API_KEY', undefined);
    expect(loadConfig().apiKey).toBeNull(); // trading verifySwapOutcome caller
    const api = new NansenAPI(); expect(api.apiKey).toBeNull();
    const log = vi.fn();
    await expect(buildMcpCommands({ log }).mcp(['install', 'claude-code'], api, { 'dry-run': true }, {})).rejects.toMatchObject({ code: 'API_KEY_REQUIRED' });
    expect(log).not.toHaveBeenCalled();
  });
  it('expired selected sessions fail before network or cache', async () => {
    const f = fixture(); const bundle = sessionFixture({ now: Date.now() - 7200000 });
    const attempt = await f.state.begin(); await f.state.install(attempt, { bundle, baseUrl: bundle.audience }); await f.state.finish(attempt);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const selection = resolveCredential({ env: f.env });
    const api = new NansenAPI(null, bundle.audience, { credential: selection, authState: f.state, cache: { enabled: true } });
    await expect(api.getAccount()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('browser session errors never echo tokens and never fall back', async () => {
    const f = fixture(); const bundle = sessionFixture(); const attempt = await f.state.begin(); await f.state.install(attempt, { bundle, baseUrl: bundle.audience }); await f.state.finish(attempt);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: bundle.accessToken }), { status: 402 })); vi.stubGlobal('fetch', fetch);
    const api = new NansenAPI(null, bundle.audience, { credential: resolveCredential({ env: f.env }), authState: f.state });
    const error = await api.getAccount().catch(e => e);
    expect(JSON.stringify(error)).not.toContain(bundle.accessToken); expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1].headers.apikey).toBeUndefined();
  });
});
