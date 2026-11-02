import { FileLoader } from 'three';

// Three's FileLoader otherwise rejects the entire React scene on the first transient
// transport error. Retry only our same-origin 3D files, without changing global fetch.
const originalLoad = FileLoader.prototype.load;
const retryDelays = [300, 1000];

FileLoader.prototype.load = function loadWithModelRetry(url, onLoad, onProgress, onError) {
  const resolved = new URL(`${this.path || ''}${url || ''}`, window.location.href);
  const isModelAsset = resolved.origin === window.location.origin
    && (/^\/models\/.*\.glb$/i.test(resolved.pathname)
      || /^\/draco\/gltf\/draco_(?:decoder|wasm_wrapper)\.(?:js|wasm)$/i.test(resolved.pathname));
  if (!isModelAsset || typeof onError !== 'function') {
    return originalLoad.call(this, url, onLoad, onProgress, onError);
  }

  let attempt = 0;
  const load = () => originalLoad.call(this, url, onLoad, onProgress, (error) => {
    if (attempt >= retryDelays.length) {
      onError(error);
      return;
    }
    const delay = retryDelays[attempt++];
    console.warn(`[CAMAC] Retrying 3D asset after a load failure (${attempt}/${retryDelays.length}): ${resolved.pathname}`);
    window.setTimeout(load, delay);
  });
  return load();
};
