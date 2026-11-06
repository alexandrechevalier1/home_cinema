/** Un objet par appareil, au-dessus de la couche réseau. */
import {
  HOSTS, SL12_KEYPAD_ID, SONY, ORANGE, YNCA_GAP_MS,
  type SonyKey, type OrangeKey,
} from './config';
import { sendUdp, wakeOnLan, http, sleep, YncaClient } from './transport';

export const sl12 = {
  /** « Appui » sur un bouton du clavier virtuel ; renvoie la réponse (« ~01@BTN 9,11,R OK ») */
  button: (n: number) =>
    sendUdp(HOSTS.sl12.host, HOSTS.sl12.port, `#01@BTN ${n},${SL12_KEYPAD_ID},R\r`),
  /** Test de présence : le SL-12 répond « ~01@ OK » */
  ping: async () => (await sendUdp(HOSTS.sl12.host, HOSTS.sl12.port, '#\r', { replyTimeoutMs: 1000 }))?.includes('OK') ?? false,
};

const ynca = new YncaClient(HOSTS.yamaha.host, HOSTS.yamaha.port, YNCA_GAP_MS);

export const yamaha = {
  cmd: (c: string) => ynca.send(c),
  on: () => ynca.send('@MAIN:PWR=On'),
  standby: () => ynca.send('@MAIN:PWR=Standby'),
  input: (i: string) => ynca.send(`@MAIN:INP=${i}`),
  volUp: () => ynca.send('@MAIN:VOL=Up'),
  volDown: () => ynca.send('@MAIN:VOL=Down'),
  muteToggle: () => ynca.send('@MAIN:MUTE=On/Off'),
  fm: (freq: string) => ynca.send(`@TUN:FMFREQ=${freq}`),
  seekUp: () => ynca.send('@TUN:FMFREQ=Auto Up'),
  seekDown: () => ynca.send('@TUN:FMFREQ=Auto Down'),
  /** Abonnement aux retours (volume, entrée, état…) */
  onUpdate: (cb: (line: string) => void) => ynca.onLine(cb),
  disconnect: () => ynca.close(),
};

const sonyBase = `http://${HOSTS.sony.host}:${HOSTS.sony.port}`;

export const sony = {
  key: (k: SonyKey) =>
    http(`${sonyBase}/upnp/control/IRCC`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        SOAPAction: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
      },
      body:
        '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
        `<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${SONY[k]}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`,
    }),

  /** Le lecteur répond-il sur le réseau ? (en veille profonde : non) */
  isAwake: async () => {
    try {
      await http(`${sonyBase}/`, {}, 1500);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Réveil : Power est une BASCULE, donc on ne l'envoie que si le lecteur dormait.
   * (K-Touch l'envoyait à l'aveugle : passer de CD à Film pouvait l'éteindre.)
   */
  wake: async () => {
    if (await sony.isAwake()) return;
    await wakeOnLan(HOSTS.sony.mac, HOSTS.broadcast);
    await sleep(HOSTS.sony.wolDelayMs);
    await sony.key('power');
  },

  off: async () => {
    if (await sony.isAwake()) await sony.key('power');
  },
};

export const orange = {
  key: (k: OrangeKey) =>
    http(`http://${HOSTS.orange.host}:${HOSTS.orange.port}/remoteControl/cmd?operation=01&key=${ORANGE[k]}&mode=0`),
  /** Tape un numéro de chaîne (ex. « 12 ») */
  channel: async (num: string) => {
    for (const d of num) {
      await orange.key(d as OrangeKey);
      await sleep(250);
    }
  },
};
