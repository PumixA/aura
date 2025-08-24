// app/pair-qr.tsx
import { useEffect, useState, useMemo } from 'react'
import { View, Text } from 'react-native'
import { Screen, H1 } from '../src/components/ui'
import { api } from '../src/api/client'

type ScannerModule = typeof import('expo-barcode-scanner')
export default function PairQR() {
    const [perm, setPerm] = useState<'unknown'|'granted'|'denied'>('unknown')
    const [Scanner, setScanner] = useState<ScannerModule['BarCodeScanner'] | null>(null)
    const [err, setErr] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                // charge le module seulement quand on arrive sur cet écran
                const mod = (await import('expo-barcode-scanner')) as ScannerModule
                if (!mounted) return
                setScanner(() => mod.BarCodeScanner)
                const { status } = await mod.BarCodeScanner.requestPermissionsAsync()
                if (!mounted) return
                setPerm(status === 'granted' ? 'granted' : 'denied')
            } catch (e:any) {
                setErr(e?.message ?? 'Module BarCodeScanner indisponible')
            }
        })()
        return () => { mounted = false }
    }, [])

    const onScan = useMemo(() => {
        return async ({ data }: { data: string }) => {
            try {
                await api.post('/devices/pair', { token: data })
                // TODO: router.back() ou toast succès
            } catch (e) {
                console.log('pair error', e)
            }
        }
    }, [])

    return (
        <Screen>
            <H1>Associer un miroir (QR)</H1>

            {err && (
                <Text style={{ color: '#fca5a5', marginBottom: 12 }}>
                    {err}{'\n'}Installe le module avec: `npx expo install expo-barcode-scanner`
                </Text>
            )}

            {perm === 'unknown' && <Text style={{ color: 'white' }}>Demande de permission caméra…</Text>}
            {perm === 'denied' && <Text style={{ color: '#fca5a5' }}>Accès caméra refusé.</Text>}

            {Scanner && perm === 'granted' && (
                <View style={{ overflow: 'hidden', borderRadius: 16 }}>
                    <Scanner
                        onBarCodeScanned={onScan}
                        style={{ width: '100%', height: 320 }}
                    />
                </View>
            )}
        </Screen>
    )
}
