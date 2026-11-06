/**
 * Home cinéma : toutes les commandes relevées dans K-Touch (ktouch_commands.json).
 * Modifie les IP ici si un appareil change d'adresse sur la Livebox.
 */

export const HOSTS = {
  /** Kramer SL-12 : projecteur, écran, lift (UDP, Protocol 3000) */
  sl12: { host: '192.168.1.200', port: 50000 },
  /** Yamaha RX-A1040 (TCP, protocole YNCA) */
  yamaha: { host: '192.168.1.210', port: 50000 },
  /** Lecteur Blu-ray Sony (HTTP IRCC), réveillé par Wake-on-LAN */
  sony: { host: '192.168.1.211', port: 50001, mac: 'D8:D4:3C:F1:4D:D3', wolDelayMs: 10_000 },
  /** Décodeur TV Orange (HTTP) */
  orange: { host: '192.168.1.10', port: 8080 },
  /** Adresse de broadcast du réseau local (pour le Wake-on-LAN) */
  broadcast: '192.168.1.255',
} as const;

/** Le SL-12 voit K-Touch comme un clavier K-NET n°11 : on envoie « bouton n relâché ». */
export const SL12_KEYPAD_ID = 11;

/** Entrées de l'ampli */
export const INPUTS = {
  bluray: 'AV1', // Sony (films et CD)
  appletv: 'AV2',
  tv: 'AV4', // décodeur Orange
  tuner: 'TUNER',
} as const;

/** Codes IRCC du Sony (base64), relevés dans les trames K-Touch */
export const SONY = {
  power: 'AAAAAwAAHFoAAAAVAw==', // bascule ON/OFF
  topMenu: 'AAAAAwAAHFoAAAAsAw==',
  popupMenu: 'AAAAAwAAHFoAAAApAw==',
  up: 'AAAAAwAAHFoAAAA5Aw==',
  down: 'AAAAAwAAHFoAAAA6Aw==',
  left: 'AAAAAwAAHFoAAAA7Aw==',
  right: 'AAAAAwAAHFoAAAA8Aw==',
  enter: 'AAAAAwAAHFoAAAA9Aw==',
  return: 'AAAAAwAAHFoAAABDAw==',
  subtitle: 'AAAAAwAAHFoAAABjAw==',
  yellow: 'AAAAAwAAHFoAAABpAw==',
  blue: 'AAAAAwAAHFoAAABmAw==',
  red: 'AAAAAwAAHFoAAABnAw==',
  green: 'AAAAAwAAHFoAAABoAw==',
  rewind: 'AAAAAwAAHFoAAAAbAw==',
  playPause: 'AAAAAwAAHFoAAAAaAw==',
  forward: 'AAAAAwAAHFoAAAAcAw==',
  previous: 'AAAAAwAAHFoAAABXAw==',
  next: 'AAAAAwAAHFoAAABWAw==',
  stop: 'AAAAAwAAHFoAAAAYAw==',
} as const;
export type SonyKey = keyof typeof SONY;

/** Codes touches du décodeur Orange */
export const ORANGE = {
  '0': 512, '1': 513, '2': 514, '3': 515, '4': 516,
  '5': 517, '6': 518, '7': 519, '8': 520, '9': 521,
  up: 103, down: 108, left: 105, right: 106, ok: 352,
  chUp: 402, chDown: 403,
} as const;
export type OrangeKey = keyof typeof ORANGE;

/** Stations FM programmées dans K-Touch */
export const RADIOS = [
  { name: 'France Inter', freq: '87.80' },
  { name: 'France Culture', freq: '93.50' },
  { name: 'France Musique', freq: '91.70' },
  { name: 'France Info', freq: '105.50' },
  { name: 'RTL', freq: '104.30' },
  { name: 'Europe 1', freq: '104.70' },
  { name: 'Nova', freq: '101.50' },
  { name: 'FIP', freq: '105.10' },
  { name: 'Radio Classique', freq: '101.10' },
] as const;

/** Une étape de scénario */
export type Step =
  | { kind: 'sl12'; button: number }
  | { kind: 'yamaha'; cmd: string }
  | { kind: 'sonyWake' } // Wake-on-LAN + attente + Power si le lecteur dort
  | { kind: 'sonyOff' } // Power seulement si le lecteur est allumé
  | { kind: 'wait'; ms: number };

export type SceneId = 'appletv' | 'film' | 'tv' | 'radio' | 'cd' | 'off';

const yOn: Step = { kind: 'yamaha', cmd: '@MAIN:PWR=On' };
const input = (i: string): Step => ({ kind: 'yamaha', cmd: `@MAIN:INP=${i}` });
const btn = (...n: number[]): Step[] => n.map((button) => ({ kind: 'sl12', button }));

/**
 * Scénarios = séquences K-Touch + corrections :
 *  - l'ampli est allumé explicitement (K-Touch ne le faisait jamais → panne)
 *  - les boutons SL-12 sont espacés (cf. SL12_GAP_MS)
 * Hypothèses (non vérifiées) : 9 = projecteur ON, 5/7 = descente écran/lift,
 * 6/8 = remontée, 2 = projecteur OFF, 4 = format 1.33, 1 = ?
 */
export const SCENES: Record<SceneId, { label: string; steps: Step[]; remote?: Remote }> = {
  appletv: { label: 'Apple TV', remote: 'appletv', steps: [yOn, input(INPUTS.appletv), ...btn(9, 1, 5, 7)] },
  film: { label: 'Film', remote: 'bluray', steps: [{ kind: 'sonyWake' }, yOn, input(INPUTS.bluray), ...btn(9)] },
  tv: { label: 'TV', remote: 'tv', steps: [yOn, input(INPUTS.tv), ...btn(9)] },
  radio: { label: 'Radio', remote: 'radio', steps: [yOn, input(INPUTS.tuner), ...btn(1, 6, 8)] },
  cd: { label: 'CD', remote: 'cd', steps: [{ kind: 'sonyWake' }, yOn, input(INPUTS.bluray)] },
  off: { label: 'Tout éteindre', steps: [...btn(2, 6, 8), { kind: 'sonyOff' }, { kind: 'yamaha', cmd: '@MAIN:PWR=Standby' }] },
};

export type Remote = 'appletv' | 'bluray' | 'tv' | 'radio' | 'cd';

/** Pause entre deux boutons SL-12 (K-Touch en envoyait parfois deux en 2 ms) */
export const SL12_GAP_MS = 500;
/** Le protocole YNCA demande ~100 ms entre deux commandes */
export const YNCA_GAP_MS = 150;
