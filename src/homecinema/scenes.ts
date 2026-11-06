import { SCENES, SL12_GAP_MS, type SceneId, type Step } from './config';
import { sl12, yamaha, sony } from './devices';
import { sleep } from './transport';

export type Log = (msg: string) => void;

async function runStep(step: Step, log: Log) {
  switch (step.kind) {
    case 'sl12': {
      const reply = await sl12.button(step.button);
      log(`SL-12 bouton ${step.button}${reply ? ' ✓' : ' (pas de réponse)'}`);
      await sleep(SL12_GAP_MS);
      return;
    }
    case 'yamaha':
      await yamaha.cmd(step.cmd);
      log(`Ampli ${step.cmd}`);
      if (step.cmd === '@MAIN:PWR=On') await sleep(1500);
      return;
    case 'sonyWake':
      log('Blu-ray : réveil…');
      // en parallèle du reste : le WOL prend ~10 s
      sony.wake().then(() => log('Blu-ray prêt'), (e) => log(`Blu-ray ✗ ${String(e)}`));
      return;
    case 'sonyOff':
      await sony.off().catch(() => undefined);
      log('Blu-ray éteint');
      return;
    case 'wait':
      await sleep(step.ms);
  }
}

let running: Promise<void> | null = null;

/** Lance un scénario ; ignore les appuis pendant qu'un autre tourne. */
export function runScene(id: SceneId, log: Log = () => undefined): Promise<void> {
  if (running) {
    log('Un scénario est déjà en cours');
    return running;
  }
  running = (async () => {
    log(`▶ ${SCENES[id].label}`);
    for (const step of SCENES[id].steps) {
      try {
        await runStep(step, log);
      } catch (e) {
        log(`✗ ${step.kind} : ${String(e)}`); // on continue : un appareil en panne ne bloque pas les autres
      }
    }
    log('✔ terminé');
  })().finally(() => {
    running = null;
  });
  return running;
}
