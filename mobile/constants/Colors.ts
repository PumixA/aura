// constants/Colors.ts
const primary = {
    50: '#f3f1ff',
    100: '#e7e2ff',
    200: '#cfc6ff',
    300: '#b0a0ff',
    400: '#927dff',
    500: '#7a5af8', // base
    600: '#6a48e8',
    700: '#5a39cf',
    800: '#4a2ea8',
    900: '#3c2786',
};

export const Gradients = {
    primary: ['#7A5AF8', '#4DA8F0'],
    mint: ['#4DA8F0', '#7AF8D1'],
};

export default {
    light: {
        text: '#0f1220',
        background: '#F8F9FC',
        card: 'rgba(255,255,255,0.72)',
        border: 'rgba(15,18,32,0.08)',
        primary: primary[500],
    },
    dark: {
        text: '#ECEEF7',
        background: '#0B0E15',
        card: 'rgba(20,24,33,0.52)',
        border: 'rgba(236,238,247,0.06)',
        primary: primary[500],
    },
};
