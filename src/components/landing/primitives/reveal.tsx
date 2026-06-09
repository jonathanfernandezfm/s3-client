"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

interface RevealProps {
  children: ReactNode;
  /** Stagger offset in seconds. */
  delay?: number;
  className?: string;
}

/** Fades + rises children into view on scroll. Renders statically under reduced motion. */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const prefersReduced = useReducedMotion();
  // Defer the reduced-motion check past hydration: the server always renders
  // the animated branch, so server and first client render must agree.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(!!prefersReduced);
  }, [prefersReduced]);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}
