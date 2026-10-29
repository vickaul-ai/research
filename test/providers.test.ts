import {describe, expect, it} from 'vitest';
import {CostMeter, createProviders} from '@/lib/providers';
import {MODELS} from '@/lib/models';

const ok = {status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: '# R'}]}], usage: {input_tokens: 10, output_tokens: 10}};

function providers(fetchImpl: typeof fetch, key = 'k') {
  return createProviders({model: MODELS.openai, keys: {openai: key}, meter: new CostMeter(1), fetchImpl});
}

describe('provider errors', () => {
  it('trims whitespace pasted around an API key', async () => {
    let auth = '';
    const fetchImpl = (async (_: RequestInfo | URL, init: RequestInit = {}) => {
      auth = (init.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify(ok));
    }) as typeof fetch;
    await providers(fetchImpl, ' sk-test\n').generate({system: 's', input: 'i', maxOutputTokens: 10, operation: 'write_report'});
    expect(auth).toBe('Bearer sk-test');
  });

  it('names the step and the cause when a request times out', async () => {
    const fetchImpl = (async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }) as typeof fetch;
    await expect(providers(fetchImpl).generate({system: 's', input: 'i', maxOutputTokens: 10, operation: 'write_report'}))
      .rejects.toThrow('Provider request failed: timeout: write_report');
  });

  it('passes on the provider message for an HTTP error', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({error: {message: 'The model does not exist'}}), {status: 404})) as typeof fetch;
    await expect(providers(fetchImpl).generate({system: 's', input: 'i', maxOutputTokens: 10, operation: 'write_report'}))
      .rejects.toThrow('Provider request failed: http_error (HTTP 404): write_report: The model does not exist');
  });
});
