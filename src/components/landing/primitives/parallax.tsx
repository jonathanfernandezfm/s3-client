"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

interface ParallaxProps {
  children: ReactNode;
  /** Max vertical drift in px while the element crosses the viewport. Negative drifts up. */
  speed?: number;
  className?: string;
}

/** Scroll-linked vertical drift. Renders statically under reduced motion. */
export function Parallax({ children, speed = 40, className }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  // Defer the reduced-motion check past hydration: the server always renders
  // the animated branch, so server and first client render must agree.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(!!prefersReduced);
  }, [prefersReduced]);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-speed, speed]);

  if (reduced) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}
