import { Easing } from 'react-native-reanimated';
import { motion } from '@da/design-tokens';

/** Standard curve from the motion tokens — used for every enter / move animation. */
export const standardEasing = Easing.bezier(...motion.easing.standard);
/** Exit curve from the motion tokens. */
export const exitEasing = Easing.bezier(...motion.easing.exit);
/** Emphasized curve (sheet open, success moments). */
export const emphasizedEasing = Easing.bezier(...motion.easing.emphasized);
