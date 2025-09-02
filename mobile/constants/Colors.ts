// constants/Colors.ts

export type ThemeName = 'light' | 'dark';

/** Palette de base (Aura + Apple Glass) */
export const Palette = {
    // Aura brand
    brandViolet: '#7A5AF8',
    brandCyan:   '#4DA8F0',
    brandPink:   '#FF6EC7',

    // Semantic
    green:  '#10B981',
    greenSoft: '#34D399',
    red:    '#DC2626',
    redSoft:'#F87171',

    // Greys
    white:  '#FFFFFF',
    black:  '#000000',
    grey100:'#F5F7FB',
    grey200:'#E7EAF2',
    grey300:'#C7CBD6',
    grey700:'#323544',
    grey800:'#191B25',
    grey900:'#0F1222',
};

/** Dégradés utilisés */
export const Gradients = {
    primary: [Palette.brandViolet, Palette.brandCyan],
    background: [Palette.grey900, '#161A2F'],
    online: ['rgba(52,211,153,0.35)', 'rgba(16,185,129,0.35)'],
    offline: ['rgba(248,113,113,0.35)', 'rgba(220,38,38,0.35)'],
};

/** Règles Apple Liquid Glass */
export const Radii = {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 28,
    pill: 999,
};

export const Spacing = {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
};

export const Shadows = {
    light: {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
    },
    dark: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10,
    },
};

/** Thème (couleurs de texte, surface glass, bordures) */
export function getTheme(name: ThemeName) {
    if (name === 'dark') {
        return {
            name,
            background: Palette.grey900,
            surface: 'rgba(255,255,255,0.10)',
            surfaceStrong: 'rgba(255,255,255,0.14)',
            border: 'rgba(255,255,255,0.22)',
            text: 'rgba(255,255,255,0.92)',
            textMuted: 'rgba(255,255,255,0.62)',
            divider: 'rgba(255,255,255,0.08)',
        };
    }
    return {
        name,
        background: Palette.grey100,
        surface: 'rgba(255,255,255,0.40)',
        surfaceStrong: 'rgba(255,255,255,0.55)',
        border: 'rgba(0,0,0,0.08)',
        text: 'rgba(0,0,0,0.92)',
        textMuted: 'rgba(0,0,0,0.60)',
        divider: 'rgba(0,0,0,0.06)',
    };
}

/** Compat héritage (le projet utilisait `Colors.*`) */
export const Colors = {
    background: Palette.grey900, // utilisé sur le layout de fond
    text: {
        primary: 'rgba(255,255,255,0.92)',
        muted:   'rgba(255,255,255,0.62)',
    },
    primary: {
        solid: Palette.brandViolet,
        from:  Palette.brandViolet,
        to:    Palette.brandCyan,
    },
    glass: {
        card: 'rgba(255,255,255,0.10)',
        border: 'rgba(255,255,255,0.22)',
    },
    status: {
        onlineBg: 'rgba(16,185,129,0.18)',
        onlineText: '#16A34A',
        offlineBg: 'rgba(220,38,38,0.18)',
        offlineText: '#DC2626',
    },
    feedback: {
        error: Palette.red,
    },
};

export default Colors;
