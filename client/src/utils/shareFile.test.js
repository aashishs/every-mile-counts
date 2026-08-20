import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { canShareFiles, downloadBlob, shareOrDownload } from './shareFile.js';

function blob() {
  return new Blob(['png'], { type: 'image/png' });
}

function stubNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  stubNavigator(undefined);
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: undefined,
  });
});

describe('shareFile', () => {
  it('detects file sharing support', () => {
    stubNavigator({ canShare: () => true });
    assert.equal(canShareFiles(blob()), true);
    stubNavigator({ canShare: () => { throw new Error('bad'); } });
    assert.equal(canShareFiles(blob()), false);
    stubNavigator({});
    assert.equal(canShareFiles(blob()), false);
  });

  it('uses Web Share when files are supported', async () => {
    const calls = [];
    stubNavigator({
      canShare: () => true,
      share: async (payload) => { calls.push(payload); },
    });
    const result = await shareOrDownload({ blob: blob(), filename: 'emc.png', title: 'EMC', text: 'run' });
    assert.equal(result.method, 'share');
    assert.equal(calls[0].files[0].name, 'emc.png');
  });

  it('treats share abort as cancelled, not failure', async () => {
    stubNavigator({
      canShare: () => true,
      share: async () => {
        const err = new Error('nope');
        err.name = 'AbortError';
        throw err;
      },
    });
    const result = await shareOrDownload({ blob: blob(), filename: 'emc.png' });
    assert.equal(result.method, 'cancelled');
  });

  it('falls back to download when share is unsupported', async () => {
    const clicks = [];
    stubNavigator({});
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: () => ({
          click() { clicks.push('click'); },
          remove() {},
        }),
        body: { appendChild() {} },
      },
    });
    const result = await shareOrDownload({ blob: blob(), filename: 'emc.png' });
    assert.equal(result.method, 'download');
    assert.equal(clicks.length, 1);
  });

  it('downloadBlob throws without a document', () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: undefined,
    });
    assert.throws(() => downloadBlob(blob(), 'x.png'), /not available/);
  });
});
