import type { JSX } from 'react';
import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  kerning,
  lineLimit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetEnvironment } from 'expo-widgets';
import type { DailyBriefProps } from './types';

/**
 * "Brifing" — systemLarge (and the Android 4×4 cell): briefing entry + next event + the open follow-up.
 * Block taps deep-link into the app; the root opens Today.
 */
export function DailyBriefWidget(
  props: DailyBriefProps,
  environment: WidgetEnvironment,
): JSX.Element {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const c = dark
    ? {
        bg: '#141311',
        surface: '#1E1C19',
        surface2: '#2A2723',
        ink: '#F5F4F0',
        secondary: '#B5B1A8',
        tertiary: '#8A867E',
        accent: '#8586F2',
        accentSoft: '#26264A',
      }
    : {
        bg: '#F5F4F0',
        surface: '#FFFFFF',
        surface2: '#ECEAE4',
        ink: '#1B1917',
        secondary: '#5F5B54',
        tertiary: '#9B978E',
        accent: '#5B5CE2',
        accentSoft: '#E4E4FA',
      };
  const hasContent =
    props.nextEvent !== null || props.followUp !== null || props.highlight !== null;

  if (!props.signedIn) {
    return (
      <VStack
        alignment="center"
        spacing={8}
        modifiers={[
          containerBackground(c.bg, 'widget'),
          widgetURL(props.todayUrl),
          padding({ all: 16 }),
        ]}
      >
        <Spacer />
        <Image systemName="sparkles" size={20} color={c.accent} />
        <Text
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            foregroundStyle(c.secondary),
            lineLimit(2),
          ]}
        >
          {props.signedOutTitle}
        </Text>
        <Spacer />
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={12}
      modifiers={[
        containerBackground(c.bg, 'widget'),
        widgetURL(props.todayUrl),
        padding({ all: 16 }),
      ]}
    >
      <Link destination={props.briefingUrl}>
        <VStack
          alignment="leading"
          spacing={6}
          modifiers={[
            padding({ all: 14 }),
            background(c.accentSoft),
            clipShape('roundedRectangle', 16),
          ]}
        >
          <HStack spacing={5}>
            <Image systemName="sparkles" size={14} color={c.accent} />
            <Text
              modifiers={[
                font({ size: 11, weight: 'semibold' }),
                kerning(0.66),
                foregroundStyle(c.accent),
                lineLimit(1),
              ]}
            >
              {props.briefKicker}
            </Text>
            <Spacer />
          </HStack>
          <Text
            modifiers={[
              font({ size: 19, weight: 'semibold' }),
              foregroundStyle(c.ink),
              lineLimit(3),
            ]}
          >
            <Text>{props.headlineBefore}</Text>
            {props.highlight ? (
              <Text modifiers={[foregroundStyle(c.accent)]}>{props.highlight}</Text>
            ) : null}
            <Text>{props.headlineAfter}</Text>
          </Text>
          {props.listenLabel ? (
            <HStack spacing={6}>
              <Image systemName="play.fill" size={12} color={c.accent} />
              <Text
                modifiers={[
                  font({ size: 12, weight: 'semibold' }),
                  foregroundStyle(c.accent),
                  lineLimit(1),
                ]}
              >
                {props.listenLabel}
              </Text>
              <Spacer />
            </HStack>
          ) : null}
        </VStack>
      </Link>

      <VStack alignment="leading" spacing={6}>
        <Text
          modifiers={[
            font({ size: 11, weight: 'semibold' }),
            kerning(0.66),
            foregroundStyle(c.tertiary),
            lineLimit(1),
          ]}
        >
          {props.nextEventKicker}
        </Text>
        {props.nextEvent ? (
          <Link destination={props.nextEvent.deepLink}>
            <HStack spacing={10}>
              <VStack
                alignment="center"
                spacing={0}
                modifiers={[
                  frame({ width: 40, height: 40 }),
                  background(c.surface2),
                  clipShape('roundedRectangle', 12),
                ]}
              >
                <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(c.ink)]}>
                  {props.nextEvent.hour}
                </Text>
                <Text
                  modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle(c.secondary)]}
                >
                  {props.nextEvent.minute}
                </Text>
              </VStack>
              <VStack alignment="leading" spacing={2}>
                <Text
                  modifiers={[
                    font({ size: 14, weight: 'semibold' }),
                    foregroundStyle(c.ink),
                    lineLimit(2),
                  ]}
                >
                  {props.nextEvent.title}
                </Text>
                {props.nextEvent.sub ? (
                  <Text modifiers={[font({ size: 12 }), foregroundStyle(c.tertiary), lineLimit(1)]}>
                    {props.nextEvent.sub}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
            </HStack>
          </Link>
        ) : (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(c.secondary), lineLimit(2)]}>
            {props.noEventLabel}
          </Text>
        )}
      </VStack>

      {props.followUp ? (
        <VStack alignment="leading" spacing={6}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              kerning(0.66),
              foregroundStyle(c.tertiary),
              lineLimit(1),
            ]}
          >
            {props.followUpKicker}
          </Text>
          <Link destination={props.followUp.deepLink}>
            <HStack spacing={10}>
              <VStack
                alignment="center"
                spacing={0}
                modifiers={[
                  frame({ width: 40, height: 40 }),
                  background(c.surface2),
                  clipShape('roundedRectangle', 12),
                ]}
              >
                <Image systemName="paperplane" size={18} color={c.secondary} />
              </VStack>
              <VStack alignment="leading" spacing={2}>
                <Text
                  modifiers={[
                    font({ size: 14, weight: 'semibold' }),
                    foregroundStyle(c.ink),
                    lineLimit(2),
                  ]}
                >
                  {props.followUp.title}
                </Text>
                {props.followUp.sub ? (
                  <Text modifiers={[font({ size: 12 }), foregroundStyle(c.tertiary), lineLimit(1)]}>
                    {props.followUp.sub}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
            </HStack>
          </Link>
        </VStack>
      ) : null}

      {!hasContent ? (
        <HStack spacing={6}>
          <Image systemName="checkmark.circle" size={14} color={c.accent} />
          <Text
            modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.ink), lineLimit(1)]}
          >
            {props.emptyTitle}
          </Text>
          <Spacer />
        </HStack>
      ) : null}
      <Spacer />
    </VStack>
  );
}
