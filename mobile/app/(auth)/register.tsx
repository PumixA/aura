import { useState } from 'react'
import { TextInput, Text } from 'react-native'
import { Screen, H1, Button } from '../../src/components/ui'
import { useAuth } from '../../src/store/auth'
import { router } from 'expo-router'

export default function Register() {
    const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
    const [firstName, setFirst] = useState(''); const [lastName, setLast] = useState('')
    const loading = useAuth((s) => s.loading)
    const register = useAuth((s) => s.register)

    return (
        <Screen>
            <H1>Créer un compte</H1>
            <TextInput placeholder="Prénom" value={firstName} onChangeText={setFirst} style={s}/>
            <TextInput placeholder="Nom" value={lastName} onChangeText={setLast} style={s}/>
            <TextInput placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} style={s}/>
            <TextInput placeholder="Mot de passe" secureTextEntry value={password} onChangeText={setPassword} style={s}/>
            <Button title="S'inscrire" loading={loading} onPress={async () => {
                await register({ email, password, firstName, lastName }); router.replace('/(auth)/login')
            }} />
            <Text style={{ color:'#9ca3af', marginTop: 10 }}>Tu pourras ajouter un miroir après connexion.</Text>
        </Screen>
    )
}
const s = { backgroundColor:'#111827', color:'white', padding:12, borderRadius:10, marginVertical:6 }
