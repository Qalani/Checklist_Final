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
            'radial-gradient(circle at 20% 20%, rgba(var(--color-sage-400), 0.32), transparent 60%)',
        }}
        className="absolute -inset-[30%] opacity-70 blur-3xl"
      />
      <motion.div
        style={{
          y: layerTwoY,
          background:
            'radial-gradient(circle at 80% 30%, rgba(var(--color-warm-400), 0.28), transparent 65%)',
        }}
        className="absolute -inset-[35%] opacity-60 blur-3xl"
      />
      <motion.div
        style={{
          y: layerThreeY,
          background:
            'radial-gradient(circle at 50% 80%, rgba(var(--color-zen-300), 0.25), transparent 70%)',
        }}
        className="absolute -inset-[40%] opacity-55 blur-[140px]"
      />
    </div>
  );
}
