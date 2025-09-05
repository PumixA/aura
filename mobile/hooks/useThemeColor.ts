import { getTheme } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export function useThemeColor(
    props: { light?: string; dark?: string },
    colorName: keyof ReturnType<typeof getTheme>
) {
    const scheme = useColorScheme() ?? 'dark';
    const colorFromProps = props[scheme];

    if (colorFromProps) return colorFromProps;

    const theme = getTheme(scheme as 'light' | 'dark');

    if (colorName === 'background') return 'transparent';

    return theme[colorName];
}
