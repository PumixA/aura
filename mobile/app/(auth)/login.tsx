import { useState } from 'react'
import { TextInput, View, Text } from 'react-native'
import { Screen, H1, Button } from '../../src/components/ui'
import { useAuth } from '../../src/store/auth'
import { router, Link } from 'expo-router'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const loading = useAuth((s) => s.loading)
    const login = useAuth((s) => s.login)

    return (
        <Screen>
            <H1>Connexion</H1>
            <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail}
                       style={{ backgroundColor: '#111827', color:'white', padding: 12, borderRadius: 10, marginVertical: 6 }} />
            <TextInput placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword}
                       style={{ backgroundColor: '#111827', color:'white', padding: 12, borderRadius: 10, marginVertical: 6 }} />
            <Button title="Se connecter" loading={loading} onPress={async () => {
                try {
                    await login(email, password)
                    router.replace('/(tabs)')
                } catch (e:any) {
                    console.log(e?.response?.data || e?.message)
                }
            }} />
            <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#9ca3af' }}>
                    Pas de compte ? <Link href="/(auth)/register">Créer un compte</Link>
                </Text>
            </View>
        </Screen>
    )
}
