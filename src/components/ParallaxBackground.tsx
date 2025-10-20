'use client';

import { motion, useScroll, useTransform } from 'framer-motion';

export default function ParallaxBackground() {
  const { scrollY } = useScroll();
  const layerOneY = useTransform(scrollY, value => value * -0.08);
  const layerTwoY = useTransform(scrollY, value => value * -0.04);
  const layerThreeY = useTransform(scrollY, value => value * -0.02);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        style={{
          y: layerOneY,
          background:
            'radial-gradient(circle at 18% 18%, rgba(var(--color-zen-400), 0.38), transparent 62%)',
        }}
        className="absolute -inset-[32%] opacity-70 blur-[140px]"
      />
      <motion.div
        style={{
          y: layerTwoY,
          background:
            'radial-gradient(circle at 82% 30%, rgba(var(--color-sage-300), 0.34), transparent 68%)',
        }}
        className="absolute -inset-[36%] opacity-65 blur-[160px]"
      />
      <motion.div
        style={{
          y: layerThreeY,
          background:
            'radial-gradient(circle at 50% 82%, rgba(var(--color-warm-200), 0.28), transparent 72%)',
        }}
        className="absolute -inset-[40%] opacity-55 blur-[180px]"
      />
    </div>
  );
}
