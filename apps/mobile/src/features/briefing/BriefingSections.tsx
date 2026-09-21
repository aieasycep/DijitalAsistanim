import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { iconNames, type IconName } from '@da/design-tokens';
import {
  BRIEFING_SECTIONS,
  type Briefing,
  type BriefingItem,
  type BriefingSection,
} from '@da/domain';
import { ListGroup, ListGroupTitle, ListRow, useTheme } from '@da/ui';

const SECTION_FALLBACK_ICON: Record<BriefingSection, IconName> = {
  priorities: 'mail',
  schedule: 'event',
  waiting_for_you: 'person',
  waiting_for_others: 'followUp',
  deadlines: 'deadline',
  personal: 'shipment',
  completed: 'complete',
  carried_over: 'mail',
  follow_ups: 'followUp',
  first_event_tomorrow: 'event',
  changes: 'move',
  rest_of_day: 'event',
};

const GLYPH_TO_ICON: Record<string, IconName> = Object.fromEntries(
  (Object.entries(iconNames) as [IconName, string][]).map(([name, glyph]) => [glyph, name]),
) as Record<string, IconName>;

/** Briefing items carry a Material glyph name; map it back to the icon vocabulary (section fallback otherwise). */
export function iconForBriefingItem(item: Pick<BriefingItem, 'icon' | 'section'>): IconName {
  return GLYPH_TO_ICON[item.icon] ?? SECTION_FALLBACK_ICON[item.section];
}

/** Items grouped in the canonical section order (empty sections omitted). */
export function groupBriefingItems(
  items: BriefingItem[],
): { section: BriefingSection; items: BriefingItem[] }[] {
  return BRIEFING_SECTIONS.map((section) => ({
    section,
    items: items.filter((i) => i.section === section).sort((a, b) => a.position - b.position),
  })).filter((g) => g.items.length > 0);
}

export interface BriefingSectionsProps {
  briefing: Briefing;
  /** Restrict to these sections (default: every non-empty section). */
  sections?: BriefingSection[];
  onItemPress?: (item: BriefingItem) => void;
  testIDPrefix?: string;
}

/** kicker + list-group per briefing section; rows open their source through `onItemPress`. */
export function BriefingSections({
  briefing,
  sections,
  onItemPress,
  testIDPrefix = 'briefing-row',
}: BriefingSectionsProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const groups = groupBriefingItems(briefing.items).filter(
    (g) => !sections || sections.includes(g.section),
  );

  return (
    <View style={[styles.wrap, { gap: theme.layout.sectionGapLarge }]}>
      {groups.map((group) => (
        <View key={group.section}>
          <ListGroupTitle
            label={t(`briefing.sections.${group.section}`, { count: group.items.length })}
          />
          <ListGroup>
            {group.items.map((item, index) => (
              <ListRow
                key={item.id}
                title={item.title}
                meta={item.meta}
                icon={iconForBriefingItem(item)}
                done={item.status === 'done'}
                onPress={
                  onItemPress && (item.source || item.entityId)
                    ? () => onItemPress(item)
                    : undefined
                }
                testID={`${testIDPrefix}-${group.section}-${index}`}
              />
            ))}
          </ListGroup>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
