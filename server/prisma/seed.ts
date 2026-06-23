import { PrismaClient } from '@prisma/client';

async function main() {
  console.log('Stap 1: script gestart');

  let PIRATES: any[];
  try {
    const data = require('../../data-pirates.js');
    PIRATES = data.PIRATES;
  } catch (e) {
    console.error('Kon data-pirates.js niet laden:', e);
    return;
  }

  if (!Array.isArray(PIRATES)) {
    console.error(
      'PIRATES is geen lijst (type: ' + typeof PIRATES + '). ' +
      'Staat de module.exports-regel onderaan data-pirates.js, en klopt het pad?'
    );
    return;
  }
  console.log('Stap 2: ' + PIRATES.length + ' characters gevonden in data-pirates.js');

  const prisma = new PrismaClient();
  console.log('Stap 3: verbinden met de database...');
  await prisma.$connect();
  console.log('Stap 4: verbonden, characters wegschrijven...');

  for (const p of PIRATES) {
    await prisma.character.upsert({
      where: { name: p.n },
      update: {},
      create: {
        name: p.n,
        role: p.r,
        power: p.p,
        defense: p.d,
        speed: p.s,
        crew: p.c,
        attacks: Array.isArray(p.sp) ? p.sp.filter(Boolean) : [],
        altRoles: Array.isArray(p.alt) ? p.alt : [],
        isCaptain: p.cap === true,
        isNavy: p.navy === true,
      },
    });
  }

  const totaal = await prisma.character.count();
  console.log('Klaar — ' + totaal + ' characters in de database.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error('Onverwachte fout:', e); process.exit(1); });