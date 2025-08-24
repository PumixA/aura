import { useEffect } from 'react'
import { FlatList, Text, View } from 'react-native'
import { Screen, H1 } from '../../src/components/ui'
import { useDevices } from '../../src/store/devices'

export default function Devices() {
    const { items, loading, fetch } = useDevices()
    useEffect(() => { fetch() }, [])

    return (
        <Screen>
            <H1>Mes appareils</H1>
            {loading ? <Text style={{color:'white'}}>Chargement…</Text> :
                <FlatList
                    data={items}
                    keyExtractor={(d) => d.id}
                    renderItem={({ item }) => (
                        <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#111827', marginBottom: 8 }}>
                            <Text style={{ color: 'white', fontWeight: '600' }}>{item.name}</Text>
                            <Text style={{ color: '#9ca3af' }}>{new Date(item.createdAt).toLocaleString()}</Text>
                        </View>
                    )}
                    ListEmptyComponent={<Text style={{color:'#9ca3af'}}>Aucun appareil. Ajoute-en un via le QR dans le prochain sprint.</Text>}
                />
            }
        </Screen>
    )
}
