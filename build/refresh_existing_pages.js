#!/usr/bin/env node
const {performance} = require('node:perf_hooks');

const messages = Object.freeze({
  INPUT:'Invalid Pages refresh configuration',
  HOSTING:'Existing Pages hosting must be legacy main /',
  HTTP:'Pages API request failed',
  HTTP_5XX:'Pages API transient HTTP failure',
  REDIRECT:'Pages API redirects are not allowed',
  NETWORK:'Pages API connection failed',
  TIMEOUT:'Pages API request timeout',
  RESPONSE:'Invalid Pages API response',
  BUILD_FAILED:'Expected Pages build failed',
  DEADLINE:'Pages build verification timed out'
});
const failure = code => Object.assign(new Error(messages[code]), {code});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
const sleepDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

async function refreshExistingPages({repository, token, expectedCommit, fetchImpl = fetch,
  sleep = sleepDefault, clock = () => performance.now(), maxWaitMs = 600000,
  requestTimeoutMs = 20000, pollIntervalMs = 10000}){
  const parts = typeof repository === 'string' ? repository.split('/') : [];
  if (parts.length !== 2 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(parts[0]) ||
    !/^[A-Za-z0-9._-]{1,100}$/.test(parts[1]) || ['.','..'].includes(parts[1]) ||
    !sha(expectedCommit) || typeof token !== 'string' || !/^[!-~]{1,4096}$/.test(token) ||
    !Number.isInteger(maxWaitMs) || maxWaitMs < 1 || maxWaitMs > 600000 ||
    !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000 ||
    !Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 60000 ||
    typeof fetchImpl !== 'function' || typeof sleep !== 'function' || typeof clock !== 'function') throw failure('INPUT');
  const expected = expectedCommit.toLowerCase();
  const started = clock();
  if (!Number.isFinite(started)) throw failure('INPUT');
  const deadline = started + maxWaitMs;
  const base = 'https://api.github.com/repos/' + parts.map(encodeURIComponent).join('/') + '/pages';
  const remaining = () => {
    const left = deadline - clock();
    if (!Number.isFinite(left) || left <= 0) throw failure('DEADLINE');
    return left;
  };
  const pause = async ms => { await sleep(Math.min(ms, remaining())); };

  async function request(suffix, method = 'GET'){
    const attempts = method === 'GET' ? 2 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++){
      const timeoutMs = Math.min(requestTimeoutMs, remaining());
      const controller = new AbortController();
      let timer;
      try {
        const operation = (async () => {
          let res;
          try {
            res = await fetchImpl(base + suffix, {method, redirect:'error', signal:controller.signal,
              headers:{Authorization:'Bearer ' + token, Accept:'application/vnd.github+json',
                'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'seoul-jari-pages-refresh'}});
          } catch { throw failure('NETWORK'); }
          if (!res || !Number.isInteger(res.status) || typeof res.text !== 'function') throw failure('RESPONSE');
          if (res.redirected || res.status >= 300 && res.status < 400) throw failure('REDIRECT');
          if (res.status < 200 || res.status >= 300) throw failure(res.status >= 500 && res.status <= 599 ? 'HTTP_5XX' : 'HTTP');
          if (res.status !== (method === 'GET' ? 200 : 201)) throw failure('RESPONSE');
          let text;
          try { text = await res.text(); } catch { throw failure('NETWORK'); }
          if (method === 'POST') return;
          try { return JSON.parse(text); } catch { throw failure('RESPONSE'); }
        })();
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(() => { reject(failure('TIMEOUT')); controller.abort(); }, timeoutMs);
        });
        const result = await Promise.race([operation, timeout]);
        remaining();
        return result;
      } catch (error) {
        if (attempt === attempts || !['NETWORK','TIMEOUT','HTTP_5XX'].includes(error.code)) throw error;
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
      await pause(250 * attempt);
    }
  }

  const site = await request('');
  if (!record(site) || site.build_type !== 'legacy' || !record(site.source) ||
    site.source.branch !== 'main' || site.source.path !== '/') throw failure('HOSTING');
  // POST is intentionally not retried: a lost response may already have queued a build.
  await request('/builds','POST');
  const statuses = ['queued','pending','in_progress','building','built','errored','failed'];
  const maxPolls = Math.min(600, Math.ceil(maxWaitMs / pollIntervalMs) + 1);
  for (let polls = 1; polls <= maxPolls; polls++){
    const latest = await request('/builds/latest');
    if (!record(latest) || !sha(latest.commit) || !statuses.includes(latest.status)) throw failure('RESPONSE');
    if (latest.commit.toLowerCase() === expected){
      if (latest.status === 'built') return {commit:expected, status:'built', polls};
      if (latest.status === 'errored' || latest.status === 'failed') throw failure('BUILD_FAILED');
    }
    if (polls === maxPolls) break;
    await pause(pollIntervalMs);
  }
  throw failure('DEADLINE');
}

async function main({env = process.env, log = console.log, ...options} = {}){
  const result = await refreshExistingPages({...options, repository:env.GITHUB_REPOSITORY,
    token:env.GITHUB_TOKEN, expectedCommit:env.EXPECTED_DATA_COMMIT});
  log('Existing Pages build verified for ' + result.commit);
  return result;
}

if (require.main === module) main().catch(error => {
  console.error(Object.hasOwn(messages, error.code) ? messages[error.code] : 'Pages refresh failed');
  process.exitCode = 1;
});
module.exports = {refreshExistingPages, main};
