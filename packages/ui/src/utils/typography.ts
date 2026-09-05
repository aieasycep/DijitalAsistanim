import type { TextStyle } from 'react-native';
import type { FontWeightToken } from '@da/design-tokens';
import { fontFor } from '../primitives/Text';

/**
 * Weight override for the sans family. The Text primitive derives the font family from the
 * type token, so a bare `fontWeight` override would be ignored on iOS with custom fonts —
 * always set both.
 */
export function sansWeight(weight: FontWeightToken): TextStyle {
  return { fontWeight: weight, fontFamily: fontFor('sans', weight) };
}
