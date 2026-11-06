/**
 * Couche réseau : UDP (SL-12, Wake-on-LAN), TCP (Yamaha) et HTTP (Sony, Orange).
 * Dépendances natives : react-native-udp, react-native-tcp-socket, buffer.
 */
import dgram from 'react-native-udp';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Envoie un datagramme UDP et renvoie la réponse éventuelle (ou null après timeout). */
export function sendUdp(
  host: string,
  port: number,
  payload: string | Buffer,
  opts: { broadcast?: boolean; replyTimeoutMs?: number } = {},
): Promise<string | null> {
  const { broadcast = false, replyTimeoutMs = 500 } = opts;
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4' });
    let done = false;
    const finish = (value: string | null, err?: unknown) => {
      if (done) return;
      done = true;
      try { socket.close(); } catch { /* déjà fermé */ }
      err ? reject(err) : resolve(value);
    };
    socket.on('message', (msg: Buffer) => finish(msg.toString('latin1')));
    socket.on('error', (e: unknown) => finish(null, e));
    socket.bind(0, () => {
      if (broadcast) socket.setBroadcast(true);
      const buf = typeof payload === 'string' ? Buffer.from(payload, 'latin1') : payload;
      socket.send(buf, 0, buf.length, port, host, (err?: unknown) => {
        if (err) return finish(null, err);
        setTimeout(() => finish(null), replyTimeoutMs);
      });
    });
  });
}

/** Paquet magique Wake-on-LAN : 6 × FF puis 16 × l'adresse MAC. */
export function wakeOnLan(mac: string, broadcast: string) {
  const macBytes = Buffer.from(mac.replace(/[^0-9a-f]/gi, ''), 'hex');
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBytes)]);
  return sendUdp(broadcast, 9, packet, { broadcast: true, replyTimeoutMs: 0 });
}

/** fetch avec timeout */
export async function http(
  url: string,
  init: RequestInit = {},
  timeoutMs = 3000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Connexion TCP persistante à l'ampli Yamaha (YNCA).
 * - l'ampli n'accepte qu'UNE connexion YNCA à la fois → on la partage
 * - il ignore souvent la 1re commande après connexion → requête « réveil » d'abord
 * - les commandes sont espacées (file d'attente)
 * - fermeture automatique après une période d'inactivité
 */
export class YncaClient {
  private socket: ReturnType<typeof TcpSocket.createConnection> | null = null;
  private connecting: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(line: string) => void>();
  private rx = '';

  constructor(
    private host: string,
    private port: number,
    private gapMs = 150,
    private idleCloseMs = 30_000,
  ) {}

  /** Abonnement aux réponses de l'ampli (ex. « @MAIN:VOL=-36.0 ») */
  onLine(cb: (line: string) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private connect(): Promise<void> {
    if (this.socket) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise<void>((resolve, reject) => {
      const s = TcpSocket.createConnection({ host: this.host, port: this.port }, async () => {
        this.socket = s;
        this.connecting = null;
        s.write('@SYS:MODELNAME=?\r\n'); // réveil
        await sleep(300);
        resolve();
      });
      s.on('data', (data: Buffer | string) => {
        this.rx += typeof data === 'string' ? data : data.toString('latin1');
        const lines = this.rx.split('\r\n');
        this.rx = lines.pop() ?? '';
        lines.filter(Boolean).forEach((l) => this.listeners.forEach((cb) => cb(l)));
      });
      s.on('error', (e: unknown) => {
        this.reset();
        reject(e);
      });
      s.on('close', () => this.reset());
    });
    return this.connecting;
  }

  private reset() {
    this.socket = null;
    this.connecting = null;
    this.rx = '';
  }

  private armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close(), this.idleCloseMs);
  }

  /** Envoie une commande YNCA (ex. '@MAIN:PWR=On') */
  send(cmd: string): Promise<void> {
    const job = this.queue.then(async () => {
      await this.connect();
      this.socket!.write(cmd + '\r\n');
      this.armIdle();
      await sleep(this.gapMs);
    });
    this.queue = job.catch(() => undefined); // une erreur ne bloque pas la file
    return job;
  }

  close() {
    this.socket?.destroy();
    this.reset();
  }
}
