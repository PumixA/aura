import { View, Text, Pressable, ActivityIndicator } from 'react-native'

export const Screen = ({ children }: any) => (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#0b0f14' }}>{children}</View>
)

export const H1 = ({ children }: any) => (
    <Text style={{ fontSize: 24, fontWeight: '700', color: 'white', marginBottom: 12 }}>{children}</Text>
)

export const Button = ({ title, onPress, disabled, loading }: any) => (
    <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={{
            backgroundColor: disabled ? '#334' : '#2563eb',
            padding: 14,
            borderRadius: 12,
            alignItems: 'center',
            marginTop: 8,
        }}>
        {loading ? <ActivityIndicator /> : <Text style={{ color: 'white', fontWeight: '600' }}>{title}</Text>}
    </Pressable>
)
