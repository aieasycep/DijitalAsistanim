import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../primitives/Card';
import { ListRow } from '../primitives/ListRow';
import { SectionKicker, type SectionKickerProps } from '../primitives/SectionKicker';
import { SheetRow } from './BottomSheet';

export interface ListGroupProps {
  children?: ReactNode;
  /** Insert hairline dividers between rows (default true). */
  dividers?: boolean;
  /** Padding override — default 4/16 from the list-group card pattern. */
  padding?: number | { horizontal?: number; vertical?: number; top?: number; bottom?: number };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * White radius-18 card (padding 4/16) that stacks rows and inserts hairline dividers automatically.
 * ListRow / SheetRow children receive `divider`; any other child is wrapped with a hairline top border.
 */
export function ListGroup({ children, dividers = true, padding, style, testID }: ListGroupProps) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{
    divider?: boolean;
  }>[];
  return (
    <Card variant="listGroup" padding={padding} style={style} testID={testID}>
      {rows.map((row, index) => {
        if (!dividers || index === 0) return row;
        if (row.type === ListRow || row.type === SheetRow)
          return cloneElement(row, { divider: true });
        return (
          <View
            key={row.key ?? String(index)}
            style={[styles.divider, { borderTopColor: theme.colors.hairline }]}
          >
            {row}
          </View>
        );
      })}
    </Card>
  );
}

export type ListGroupTitleProps = SectionKickerProps;

/** Section kicker placed above a ListGroup (design: padding 0 4 8). */
export function ListGroupTitle({ style, ...rest }: ListGroupTitleProps) {
  return <SectionKicker {...rest} style={[styles.title, style]} />;
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  title: { paddingTop: 0, paddingBottom: 8 },
});
