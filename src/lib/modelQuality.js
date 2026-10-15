/** Choose the cabin GLB quality tier using the same rules in the studio and Hero scenes. */
export function pickModelUrl(model) {
  if (typeof model === 'string') return model;
  const params = new URLSearchParams(window.location.search);
  const lowQuality = params.get('quality') === 'low';
  const mobile = window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  return lowQuality || mobile ? model.mobile : model.desktop;
}
