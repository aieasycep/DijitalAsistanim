/** Motion — restrained. Pressed: scale .97/.98 in 120 ms. Toast: slides 16px from bottom, 2.6 s. Skeleton shimmer 1.6 s. */
export const motion = {
  duration: {
    press: 120,
    fast: 160,
    base: 220,
    slow: 320,
    reveal: 420,
    toast: 2600,
    shimmer: 1600,
    spinner: 800,
  },
  scale: {
    buttonPressed: 0.97,
    cardPressed: 0.98,
  },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    emphasized: [0.3, 0, 0, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  /** Reveal stagger between cards (Today / briefing) */
  stagger: 40,
} as const;

/** Haptic moments annotated in the design. */
export const hapticMoments = {
  cardComplete: 'success',
  approvalApproved: 'success',
  approvalRejected: 'warning',
  swipeThreshold: 'selection',
  toggle: 'selection',
  recordStart: 'medium',
  recordStop: 'light',
  error: 'error',
} as const;
