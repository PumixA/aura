// hooks/useThemeColor.ts
import { getTheme } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

/**
 * Renvoie une couleur de thème cohérente avec notre palette.
 * - S'appuie sur getTheme('light' | 'dark')
 * - Pour 'background', on force 'transparent' => laisse voir le gradient global des tabs
 */
export function useThemeColor(
    props: { light?: string; dark?: string },
    colorName: keyof ReturnType<typeof getTheme>
) {
    const scheme = useColorScheme() ?? 'dark';
    const colorFromProps = props[scheme];

    if (colorFromProps) return colorFromProps;

    // Palette du thème courant
    const theme = getTheme(scheme as 'light' | 'dark');

    // IMPORTANT : on laisse le fond des scènes réellement transparent
    if (colorName === 'background') return 'transparent';

    return theme[colorName];
}
