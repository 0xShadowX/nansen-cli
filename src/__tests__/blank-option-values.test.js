import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildCommands, parseArgs } from '../cli.js';
import { buildTradingCommands } from '../trading.js';
import { buildLimitOrderCommands } from '../limit-order.js';
import { buildWalletCommands, createWallet, showWallet } from '../wallet.js';
import { buildResearchCommands } from '../commands/research.js';
import { sendTokens } from '../transfer.js';

vi.mock('../transfer.js', async importOriginal => ({
  ...await importOriginal(),
  sendTokens: vi.fn().mockResolvedValue({ from: 'sender' }),
}));

const deps = { log: vi.fn(), exit: vi.fn() };
let tempDir;
beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nansen-blank-options-'));
  vi.stubEnv('HOME', tempDir);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const quoteOptions = { chain: 'base', from: 'ETH', to: 'USDC', amount: '1000' };
const sendOptions = { chain: 'base', to: '0x1111111111111111111111111111111111111111', amount: '1' };
const researchCases = [
  ['search', 'SOL', 'chain'],
  ['smart-money', 'netflow', 'chain'],
  ['smart-money', 'netflow', 'chains'],
  ['profiler', 'balance', 'chain'],
  ['token', 'screener', 'chain'],
  ['token', 'screener', 'chains'],
  ['token', 'screener', 'timeframe'],
  ['token', 'ohlcv', 'timeframe'],
  ['token', 'flow-intelligence', 'timeframe'],
];

describe.each(['', ' \t '])('explicit blank option %j', blank => {
  it.each(['swap-mode', 'wallet', 'to-chain', 'aggregator', 'amount-unit'])('rejects quote --%s', async name => {
    const parsed = parseArgs(['--' + name, blank]);
    await expect(buildTradingCommands(deps).quote([], null, parsed.flags, {
      ...quoteOptions, ...parsed.options,
    })).rejects.toMatchObject({ code: 'MISSING_PARAM', message: expect.stringContaining(`--${name} requires a value. Usage: --${name} `) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects limit-order create --expires with positional tokens', async () => {
    const parsed = parseArgs(['SOL', 'USDC', '1', '--expires', blank]);
    await expect(buildLimitOrderCommands(deps).create(parsed._, null, parsed.flags, {
      ...parsed.options, 'trigger-mint': 'SOL', 'trigger-condition': 'below', 'trigger-price': '80',
    })).rejects.toMatchObject({ code: 'MISSING_PARAM', message: expect.stringContaining('--expires requires a value. Usage: --expires 7d') });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['token', 'wallet'])('rejects wallet send --%s', async name => {
    await expect(buildWalletCommands(deps).wallet(['send'], null, {}, {
      ...sendOptions, [name]: blank,
    })).rejects.toMatchObject({ code: 'MISSING_PARAM', message: expect.stringContaining(`--${name} requires a value`) });
    expect(sendTokens).not.toHaveBeenCalled();
  });

  it.each(researchCases)('rejects research %s %s --%s', async (category, sub, name) => {
    const api = { generalSearch: vi.fn(), tokenScreener: vi.fn(), tokenOhlcv: vi.fn(), tokenFlowIntelligence: vi.fn(), smartMoneyNetflow: vi.fn(), profilerBalance: vi.fn() };
    await expect(buildCommands(deps).research([category, sub], api, {}, {
      token: 'So11111111111111111111111111111111111111112', [name]: blank,
    })).rejects.toMatchObject({ code: 'MISSING_PARAM', message: expect.stringContaining(`--${name} requires a value`) });
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });

  it.each([
    ['address-premium-labels', 'chain'],
    ['smart-money-pnl-leaderboard', 'chains'],
    ['chain-rank', 'chain-type'],
    ['chain-rank', 'timeframe-days'],
    ['historical-token-ohlcv', 'timeframe'],
  ])('rejects direct research %s --%s', async (sub, name) => {
    const api = { chainRank: vi.fn(), addressPremiumLabels: vi.fn(), smartMoneyPnlLeaderboard: vi.fn() };
    await expect(buildResearchCommands(deps).research([sub], api, {}, {
      address: '0x1111111111111111111111111111111111111111', [name]: blank,
    })).rejects.toMatchObject({ code: 'MISSING_PARAM', message: expect.stringContaining(`--${name} requires a value`) });
    for (const method of Object.values(api)) expect(method).not.toHaveBeenCalled();
  });
});

it.each([0, '0', undefined])('preserves quote slippage caps %j and omitted quote defaults', async value => {
  createWallet('default', null);
  const wallet = showWallet('default');
  fetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ success: false, quotes: [] }) });
  const options = value === undefined ? {} : typeof value === 'string'
    ? parseArgs(['--slippage', value, '--max-auto-slippage', value]).options
    : { slippage: value, 'max-auto-slippage': value };
  // Stop at the mocked response after capturing the complete outgoing request.
  await expect(buildTradingCommands(deps).quote([], null, { 'auto-slippage': true }, {
    ...quoteOptions, ...options,
  })).rejects.toThrow('No quotes available');
  const body = Object.fromEntries(new URL(fetch.mock.calls[0][0]).searchParams);
  expect(body).toMatchObject({ chainIndex: '8453', amount: '1000', userWalletAddress: wallet.evm });
  expect(body).not.toHaveProperty('toChainIndex');
  expect(body).not.toHaveProperty('swapMode');
  if (value === undefined) {
    expect(body).not.toHaveProperty('slippagePercent');
    expect(body).not.toHaveProperty('maxAutoSlippagePercent');
  } else {
    expect(body.slippagePercent).toBe(String(value));
    expect(body.maxAutoSlippagePercent).toBe(String(value));
  }
});

it('keeps native token and default wallet selection when send options are omitted', async () => {
  createWallet('default', null);
  await buildWalletCommands(deps).wallet(['send'], null, { 'dry-run': true }, sendOptions);
  expect(sendTokens).toHaveBeenCalledWith(expect.objectContaining({ token: null, wallet: null }));
});

it('keeps research defaults when chain and timeframe options are omitted', async () => {
  const api = { tokenScreener: vi.fn(), chainRank: vi.fn(), addressPremiumLabels: vi.fn() };
  await buildCommands(deps).research(['token', 'screener'], api, {}, {});
  expect(api.tokenScreener).toHaveBeenCalledWith(expect.objectContaining({ chains: ['solana'], timeframe: '24h' }));
  await buildResearchCommands(deps).research(['chain-rank'], api, {}, {});
  expect(api.chainRank).toHaveBeenCalledWith({ chainType: 'all', timeFrame: 7 });
  await buildResearchCommands(deps).research(['address-premium-labels'], api, {}, { address: '0xabc' });
  expect(api.addressPremiumLabels).toHaveBeenCalledWith(expect.objectContaining({ chain: 'all' }));
});
