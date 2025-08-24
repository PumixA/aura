import { Text } from 'react-native'
import { Screen, H1, Button } from '../../src/components/ui'
import { useAuth } from '../../src/store/auth'
import { router } from 'expo-router'

export default function Profile() {
    const user = useAuth((s) => s.user)
    const logout = useAuth((s) => s.logout)

    return (
        <Screen>
            <H1>Profil</H1>
            <Text style={{ color: 'white', marginBottom: 12 }}>
                {user ? `Connecté: ${user.email}` : 'Non connecté'}
            </Text>
            <Button title="Se déconnecter" onPress={async () => { await logout(); router.replace('/(auth)/login') }} />
        </Screen>
    )
}
