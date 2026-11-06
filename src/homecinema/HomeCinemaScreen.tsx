import React, { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RADIOS, SCENES, type Remote, type SceneId, type SonyKey, type OrangeKey } from './config';
import { orange, sl12, sony, yamaha } from './devices';
import { runScene } from './scenes';

const ACTIVITIES: SceneId[] = ['film', 'tv', 'appletv', 'radio', 'cd'];

export default function HomeCinemaScreen() {
  const [remote, setRemote] = useState<Remote | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [volume, setVolume] = useState<string | null>(null);

  const push = (m: string) => setLog((l) => [m, ...l].slice(0, 6));

  useEffect(() => {
    const unsub = yamaha.onUpdate((line) => {
      const v = line.match(/^@MAIN:VOL=(.+)$/);
      if (v) setVolume(v[1]);
    });
    // libère la connexion YNCA (une seule autorisée) quand l'app passe en arrière-plan
    const sub = AppState.addEventListener('change', (state: string) => state !== 'active' && yamaha.disconnect());
    return () => {
      unsub();
      sub.remove();
    };
  }, []);

  const start = async (id: SceneId) => {
    setBusy(true);
    setRemote(SCENES[id].remote ?? null);
    await runScene(id, push);
    setBusy(false);
  };

  /** Appui simple : n'affiche une erreur que si la commande échoue */
  const tap = (fn: () => Promise<unknown>) => () => {
    fn().catch((e) => push(`✗ ${String(e)}`));
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Btn label="⏻  Tout éteindre" danger onPress={() => { start('off'); setRemote(null); }} disabled={busy} />

      <View style={s.grid}>
        {ACTIVITIES.map((id) => (
          <Btn key={id} label={SCENES[id].label} style={s.tile} active={remote === SCENES[id].remote}
               onPress={() => start(id)} disabled={busy} />
        ))}
      </View>

      <View style={s.row}>
        <Btn label="Vol −" onPress={tap(yamaha.volDown)} />
        <Btn label="Muet" onPress={tap(yamaha.muteToggle)} />
        <Btn label="Vol +" onPress={tap(yamaha.volUp)} />
      </View>
      {volume && <Text style={s.muted}>Volume : {volume} dB</Text>}

      {(remote === 'bluray' || remote === 'cd') && <BlurayRemote full={remote === 'bluray'} tap={tap} />}
      {remote === 'tv' && <TvRemote tap={tap} />}
      {remote === 'radio' && <RadioRemote tap={tap} />}
      {remote === 'appletv' && (
        <Text style={s.muted}>Utilise la télécommande de l'Apple TV (ou l'app Apple TV Remote de l'iPhone).</Text>
      )}

      <View style={s.log}>
        {log.map((l, i) => <Text key={i} style={[s.logLine, i > 0 && s.muted]}>{l}</Text>)}
      </View>

      <Btn label="Tester la connexion" small onPress={async () => {
        push((await sl12.ping()) ? 'SL-12 ✓' : 'SL-12 ✗ (injoignable)');
        push((await sony.isAwake()) ? 'Blu-ray allumé' : 'Blu-ray en veille / injoignable');
      }} />
    </ScrollView>
  );
}

type Tap = (fn: () => Promise<unknown>) => () => void;

function BlurayRemote({ full, tap }: { full: boolean; tap: Tap }) {
  const k = (key: SonyKey) => tap(() => sony.key(key));
  return (
    <View style={s.panel}>
      {full && (
        <>
          <View style={s.row}>
            <Btn label="Top menu" onPress={k('topMenu')} />
            <Btn label="▲" onPress={k('up')} />
            <Btn label="Pop-up" onPress={k('popupMenu')} />
          </View>
          <View style={s.row}>
            <Btn label="◀" onPress={k('left')} />
            <Btn label="OK" onPress={k('enter')} />
            <Btn label="▶" onPress={k('right')} />
          </View>
          <View style={s.row}>
            <Btn label="Sous-titres" onPress={k('subtitle')} />
            <Btn label="▼" onPress={k('down')} />
            <Btn label="Retour" onPress={k('return')} />
          </View>
          <View style={s.row}>
            <Btn label="A" onPress={k('yellow')} />
            <Btn label="B" onPress={k('blue')} />
            <Btn label="C" onPress={k('red')} />
            <Btn label="D" onPress={k('green')} />
            <Btn label="1.33" onPress={tap(() => sl12.button(4))} />
          </View>
          <View style={s.row}>
            <Btn label="⏪" onPress={k('rewind')} />
            <Btn label="⏯" onPress={k('playPause')} />
            <Btn label="⏩" onPress={k('forward')} />
          </View>
        </>
      )}
      <View style={s.row}>
        <Btn label="⏮" onPress={k('previous')} />
        {full && <Btn label="⏹" onPress={k('stop')} />}
        <Btn label="⏭" onPress={k('next')} />
      </View>
    </View>
  );
}

function TvRemote({ tap }: { tap: Tap }) {
  const k = (key: OrangeKey) => tap(() => orange.key(key));
  const digits: OrangeKey[][] = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['0']];
  return (
    <View style={s.panel}>
      {digits.map((r, i) => (
        <View key={i} style={s.row}>{r.map((d) => <Btn key={d} label={d} onPress={k(d)} />)}</View>
      ))}
      <View style={s.row}><Btn label="Ch +" onPress={k('chUp')} /><Btn label="▲" onPress={k('up')} /><Btn label="Ch −" onPress={k('chDown')} /></View>
      <View style={s.row}><Btn label="◀" onPress={k('left')} /><Btn label="OK" onPress={k('ok')} /><Btn label="▶" onPress={k('right')} /></View>
      <View style={s.row}><Btn label="▼" onPress={k('down')} /></View>
    </View>
  );
}

function RadioRemote({ tap }: { tap: Tap }) {
  return (
    <View style={s.panel}>
      <View style={s.row}>
        <Btn label="⏮ Recherche" onPress={tap(yamaha.seekDown)} />
        <Btn label="Recherche ⏭" onPress={tap(yamaha.seekUp)} />
      </View>
      <View style={s.grid}>
        {RADIOS.map((r) => (
          <Btn key={r.freq} label={r.name} style={s.tile} onPress={tap(() => yamaha.fm(r.freq))} />
        ))}
      </View>
    </View>
  );
}

function Btn(p: {
  label: string; onPress: () => void; disabled?: boolean; active?: boolean;
  danger?: boolean; small?: boolean; style?: object;
}) {
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      style={({ pressed }: { pressed: boolean }) => [
        s.btn, p.style, p.active && s.btnActive, p.danger && s.btnDanger,
        p.small && s.btnSmall, (pressed || p.disabled) && { opacity: 0.5 },
      ]}
    >
      <Text style={s.btnText}>{p.label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: '#15171a', flexGrow: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  panel: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#1f2226' },
  tile: { flexBasis: '31%', flexGrow: 1, paddingVertical: 22 },
  btn: { flexGrow: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#2b2f35' },
  btnActive: { backgroundColor: '#2f5d8a' },
  btnDanger: { backgroundColor: '#7a2a2a' },
  btnSmall: { paddingVertical: 8, flexGrow: 0, alignSelf: 'center' },
  btnText: { color: '#f2f2f2', fontSize: 16, fontWeight: '600' },
  muted: { color: '#8a9098', textAlign: 'center' },
  log: { gap: 2, minHeight: 60 },
  logLine: { color: '#cfd3d8', fontSize: 13 },
});
