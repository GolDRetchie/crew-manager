"use strict";

/* ====================================================================
   scheduler.ts — automatische speeldagen (19:00) + trainingen afronden (6u)

   Plek:  server/src/scheduler.ts
   Nodig: npm i node-cron   (en: npm i -D @types/node-cron)

   Start in index.ts, ná app.listen(...):
       import { startScheduler } from "./scheduler";
       startScheduler();

   Wat hij doet:
   - Elke dag 19:00 Europe/Amsterdam: voor elke actieve wereld de volgende
     speeldag (engine.ts). Vangnet bij opstarten + elk uur (gemiste tik).
   - Elke 15 minuten: trainingen die 6 uur oud zijn afronden (+3, slot vrij).
   ==================================================================== */

import * as cron from "node-cron";
import { syncAllActiveWorlds } from "./engine";
import { completeDueTrainings } from "./training";

async function tickTrainings(){
  try {
    const n = await completeDueTrainings();
    if (n > 0) console.log("[scheduler] " + n + " training(en) afgerond");
  } catch (e) { console.error("[scheduler] training-afronding:", e); }
}

export function startScheduler(){
  // 1) de echte klok: elke dag 19:00 Amsterdam -> speeldag
  cron.schedule("0 19 * * *", () => {
    syncAllActiveWorlds().catch(e => console.error("[scheduler] 19:00-run:", e));
  }, { timezone: "Europe/Amsterdam" });

  // 2) vangnet bij opstarten: speeldagen + trainingen meteen bijwerken
  syncAllActiveWorlds().catch(e => console.error("[scheduler] boot-sync:", e));
  tickTrainings();

  // 3) speeldag-vangnet elk uur (op :05)
  cron.schedule("5 * * * *", () => {
    syncAllActiveWorlds().catch(() => { /* stil — boot/19:00-run logt al */ });
  }, { timezone: "Europe/Amsterdam" });

  // 4) trainingen elke 15 minuten afronden
  cron.schedule("*/15 * * * *", () => { tickTrainings(); }, { timezone: "Europe/Amsterdam" });

  console.log("[scheduler] actief — speeldagen 19:00 Europe/Amsterdam, trainingen elke 15 min");
}