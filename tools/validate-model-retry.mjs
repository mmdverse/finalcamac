import assert from 'node:assert/strict';
import { FileLoader } from 'three';

// Exercise the installed wrapper against a deterministic transport without a browser.
globalThis.window = { location: { href: 'https://camaclift.ir/', origin: 'https://camaclift.ir' }, setTimeout };
const savedLoad = FileLoader.prototype.load;
let calls = 0;
let failures = 0;
FileLoader.prototype.load = function mockTransport(url, onLoad, onProgress, onError) {
  calls++;
  queueMicrotask(() => calls <= failures ? onError(new Error('simulated transport failure')) : onLoad('ok'));
};
await import('../src/lib/retryModelLoads.js');
const loader = new FileLoader();
async function run(url, failuresBeforeSuccess) {
  calls = 0;
  failures = failuresBeforeSuccess;
  return new Promise((resolve) => loader.load(url, (data) => resolve({ data, calls }), undefined, (error) => resolve({ error, calls })));
}
try {
  assert.deepEqual(await run('/models/hero-motor.glb', 2), { data: 'ok', calls: 3 });
  const failed = await run('/models/hero-motor.glb', 3);
  assert.equal(failed.error.message, 'simulated transport failure');
  assert.equal(failed.calls, 3, 'persistent failure stops after two retries');
  const other = await run('https://other.example/model.glb', 1);
  assert.equal(other.calls, 1, 'cross-origin requests are not retried');
  console.log('PASS: transient model requests retry twice; persistent and unrelated requests remain bounded.');
} finally {
  FileLoader.prototype.load = savedLoad;
  delete globalThis.window;
}
