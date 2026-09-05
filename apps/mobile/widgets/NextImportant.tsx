import type { JSX } from 'react';
import { AccessoryWidgetBackground, HStack, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { clipShape, containerBackground, font, foregroundStyle, frame, kerning, lineLimit, opacity, padding, widgetURL, background } from '@expo/ui/swift-ui/modifiers';
import type { WidgetEnvironment } from 'expo-widgets';
import type { NextImportantProps } from './types';

/**
 * "Sıradaki" — answers one question: what is the next important thing?
 * Families: systemSmall (home), accessoryRectangular / accessoryInline / accessoryCircular (lock screen).
 * The whole widget is one tap target (`widgetURL`); no write action is ever performed from a widget.
 */
export function NextImportantWidget(props: NextImportantProps, environment: WidgetEnvironment): JSX.Element {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { bg: '#141311', surface: '#1E1C19', ink: '#F5F4F0', secondary: '#B5B1A8', tertiary: '#8A867E', accent: '#8586F2', critical: '#F07A66', warning: '#F0B24A', success: '#4DBF8A', criticalSoft: '#3A1F1B', warningSoft: '#3A2E14', accentSoft: '#26264A', successSoft: '#163126', neutralSoft: '#2A2723' }
    : { bg: '#F5F4F0', surface: '#FFFFFF', ink: '#1B1917', secondary: '#5F5B54', tertiary: '#9B978E', accent: '#5B5CE2', critical: '#E0553F', warning: '#E09A1C', success: '#2E9E6B', criticalSoft: '#FBE4E0', warningSoft: '#FBEFD6', accentSoft: '#E4E4FA', successSoft: '#DDF3E8', neutralSoft: '#ECEAE4' };
  const toneColor = (tone: string): string => (tone === 'critical' ? c.critical : tone === 'warning' ? c.warning : tone === 'accent' ? c.accent : tone === 'success' ? c.success : c.secondary);
  const toneSoft = (tone: string): string => (tone === 'critical' ? c.criticalSoft : tone === 'warning' ? c.warningSoft : tone === 'accent' ? c.accentSoft : tone === 'success' ? c.successSoft : c.neutralSoft);
  const family = environment.widgetFamily;
  const url = props.item?.deepLink ?? props.todayUrl;

  if (family === 'accessoryInline') {
    return (
      <HStack spacing={4} modifiers={[widgetURL(props.todayUrl)]}>
        <Image systemName="sparkles" size={12} />
        <Text modifiers={[font({ size: 12, weight: 'medium' }), lineLimit(1)]}>{props.signedIn ? props.inlineLabel : props.signedOutTitle}</Text>
      </HStack>
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(props.todayUrl)]}>
        <AccessoryWidgetBackground />
        <VStack spacing={1} alignment="center">
          <Text modifiers={[font({ size: 9, weight: 'semibold' }), kerning(0.5), opacity(0.8)]}>{props.circularLabel}</Text>
          <Text modifiers={[font({ size: 20, weight: 'semibold' })]}>{props.signedIn ? String(props.count) : '–'}</Text>
        </VStack>
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    const rect = props.rectangular;
    const rectUrl = rect?.deepLink ?? props.todayUrl;
    return (
      <ZStack modifiers={[widgetURL(rectUrl)]}>
        <AccessoryWidgetBackground />
        <HStack>
          <VStack spacing={2} alignment="leading" modifiers={[padding({ horizontal: 10, vertical: 6 })]}>
            <Text modifiers={[font({ size: 10, weight: 'semibold' }), kerning(0.6), opacity(0.8), lineLimit(1)]}>{rect ? rect.kicker : props.kicker}</Text>
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), lineLimit(2)]}>{!props.signedIn ? props.signedOutTitle : rect ? rect.title : props.emptyTitle}</Text>
            {rect?.sub ? <Text modifiers={[font({ size: 10 }), opacity(0.8), lineLimit(1)]}>{rect.sub}</Text> : null}
          </VStack>
          <Spacer />
        </HStack>
      </ZStack>
    );
  }

  // systemSmall (and the Android 2×2 cell)
  return (
    <VStack alignment="leading" spacing={0} modifiers={[containerBackground(c.bg, 'widget'), widgetURL(url), padding({ all: 14 })]}>
      <HStack spacing={6}>
        <Image systemName="sparkles" size={16} color={c.accent} />
        <Spacer />
        {props.signedIn && props.item?.badgeLabel ? (
          <Text modifiers={[font({ size: 10, weight: 'bold' }), kerning(0.5), foregroundStyle(toneColor(props.item.tone)), padding({ horizontal: 6, vertical: 2 }), background(toneSoft(props.item.tone)), clipShape('capsule')]}>
            {props.item.badgeLabel}
          </Text>
        ) : null}
      </HStack>
      <Spacer />
      {!props.signedIn ? (
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(c.secondary), lineLimit(3)]}>{props.signedOutTitle}</Text>
      ) : props.item ? (
        <VStack alignment="leading" spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(c.ink), lineLimit(3)]}>{props.item.title}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.tertiary), lineLimit(1)]}>{props.item.meta}</Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={6}>
          <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(c.ink), lineLimit(3)]}>{props.emptyTitle}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.tertiary), lineLimit(1), frame({ height: 14 })]}>{props.kicker}</Text>
        </VStack>
      )}
    </VStack>
  );
}
