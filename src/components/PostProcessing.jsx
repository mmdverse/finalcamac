import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

/** Desktop-only studio polish; loaded lazily so mobile and the opening hero skip this pass. */
export default function PostProcessing() {
  return (
    <EffectComposer multisampling={2}>
      <Bloom intensity={0.32} luminanceThreshold={0.92} luminanceSmoothing={0.2} mipmapBlur />
      <Vignette offset={0.3} darkness={0.4} />
    </EffectComposer>
  );
}
