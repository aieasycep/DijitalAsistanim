import type { JSX } from 'react';
import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, kerning, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import type { WidgetEnvironment } from 'expo-widgets';
import type { TodayPrioritiesProps } from './types';

/**
 * "Bugün · 3 öncelik" — systemMedium (and the Android 4×2 cell).
 * Each row is its own `Link` into the item; the header / empty area opens Today.
 */
export function TodayPrioritiesWidget(props: TodayPrioritiesProps, environment: WidgetEnvironment): JSX.Element {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? { bg: '#141311', ink: '#F5F4F0', secondary: '#B5B1A8', tertiary: '#8A867E', accent: '#8586F2', critical: '#F07A66', warning: '#F0B24A', success: '#4DBF8A' }
    : { bg: '#F5F4F0', ink: '#1B1917', secondary: '#5F5B54', tertiary: '#9B978E', accent: '#5B5CE2', critical: '#E0553F', warning: '#E09A1C', success: '#2E9E6B' };
  const dot = (tone: string): string => (tone === 'critical' ? c.critical : tone === 'warning' ? c.warning : tone === 'accent' ? c.accent : tone === 'success' ? c.success : c.tertiary);
  const rows = props.signedIn ? props.rows.slice(0, 3) : [];

  return (
    <VStack alignment="leading" spacing={8} modifiers={[containerBackground(c.bg, 'widget'), widgetURL(props.todayUrl), padding({ horizontal: 16, vertical: 14 })]}>
      <HStack spacing={5}>
        <Image systemName="sparkles" size={14} color={c.accent} />
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), kerning(0.66), foregroundStyle(c.accent), lineLimit(1)]}>{props.header}</Text>
        <Spacer />
        {props.timeLabel ? <Text modifiers={[font({ size: 11 }), foregroundStyle(c.tertiary)]}>{props.timeLabel}</Text> : null}
      </HStack>
      {!props.signedIn ? (
        <VStack alignment="center" spacing={0}>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.secondary), lineLimit(2)]}>{props.signedOutTitle}</Text>
          <Spacer />
        </VStack>
      ) : rows.length === 0 ? (
        <VStack alignment="center" spacing={0}>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(2)]}>{props.emptyTitle}</Text>
          <Spacer />
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={10}>
          {rows.map((row) => (
            <Link key={row.id} destination={row.deepLink}>
              <HStack spacing={8}>
                <Image systemName="circle.fill" size={6} color={dot(row.tone)} />
                <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(1)]}>{row.title}</Text>
                <Spacer />
                {row.time ? <Text modifiers={[font({ size: 11 }), foregroundStyle(c.tertiary), lineLimit(1)]}>{row.time}</Text> : null}
              </HStack>
            </Link>
          ))}
          <Spacer />
        </VStack>
      )}
    </VStack>
  );
}
