// Names, origins, personality, complications and appearance.

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function pickOne(text, rng) {
  // "a, b, or c" -> one of the options
  const parts = String(text).split(/,\s*(?:or\s+)?|\s+or\s+/).map((x) => x.trim()).filter(Boolean);
  return rng.pick(parts) || text;
}

const COMPOUND_BITS = ['wing', 'hawk', 'heart', 'strike', 'fall', 'blade', 'star', 'fist', 'storm', 'light', 'jack', 'wolf', 'shade', 'spark', 'born', 'guard'];

export function makeCodename(story, theme, alignment, rng, gender) {
  const words = theme?.codename?.words || ['Shadow', 'Comet', 'Valor'];
  const themeAdj = theme?.codename?.adjectives || [];
  const villain = alignment === 'villain';
  const titles = villain ? story.villain_titles : story.hero_titles;
  const adjectives = themeAdj.concat(villain ? story.villain_adjectives : story.hero_adjectives);
  const suffixes = villain ? story.villain_suffixes : story.hero_suffixes;
  const word = rng.pick(words);
  const roll = rng.next();
  if (roll < 0.34) return word;
  if (roll < 0.56) return `${rng.pick(adjectives)} ${word}`;
  if (roll < 0.72) {
    const genderedTitles = { Lady: 'Female', Miss: 'Female', Madame: 'Female', Queen: 'Female', Mistress: 'Female', Sister: 'Female', Mister: 'Male', Lord: 'Male', King: 'Male', Baron: 'Male', Count: 'Male' };
    const t = rng.pick(titles.filter((x) => !genderedTitles[x] || genderedTitles[x] === gender));
    return t === 'The' ? `The ${word}` : `${t} ${word}`;
  }
  if (roll < 0.86) {
    const fits = (x) => (gender === 'Female' ? !/^(Boy|Man)$/.test(x) : gender === 'Male' ? !/^(Girl|Woman)$/.test(x) : !/^(Girl|Boy|Man|Woman)$/.test(x));
    const suffix = rng.pick(suffixes.filter(Boolean).filter(fits)) || '';
    if (/^(Girl|Boy|Man|Woman)$/.test(suffix)) return `${word}-${suffix}`;
    return `${word}${suffix}`;
  }
  const base = word.split(/[\s-]/)[0];
  const bit = rng.pick(COMPOUND_BITS);
  return base.toLowerCase().endsWith(bit) ? `${base}${rng.pick(COMPOUND_BITS)}` : `${base}${bit}`;
}

function pickAge(rng) {
  const r = rng.next();
  if (r < 0.08) return rng.int(15, 17);
  if (r < 0.7) return rng.int(18, 34);
  if (r < 0.92) return rng.int(35, 55);
  return rng.chance(0.15) ? rng.int(100, 3000) : rng.int(56, 90); // a few immortals
}

function occupationFor(age, flavor, arch, rng) {
  const occ = flavor.occupations || {};
  const bySkill = {
    crimefighter: ['Billionaire philanthropist', 'Police detective', 'Private investigator', 'Forensic scientist', 'Martial arts instructor'],
    gadgeteer: ['Engineer', 'Inventor', 'Robotics researcher', 'Startup founder', 'Repair-shop owner'],
    battlesuit: ['Aerospace engineer', 'Test pilot', 'Defense contractor', 'CEO'],
    mystic: ['Occult bookseller', 'Antiquities curator', 'Stage magician', 'Physician'],
    mastermind: ['CEO', 'Disgraced scientist', 'Crime boss', 'Politician', 'Professor'],
    psychic: ['Therapist', 'Stage psychic', 'Graduate student', 'Intelligence analyst'],
  };
  if (age < 18) return 'Student';
  if (bySkill[arch.id] && rng.chance(0.6)) return rng.pick(bySkill[arch.id]);
  const tier = age <= 22 ? 'entry_level' : age <= 30 ? 'early_career' : age <= 50 ? 'mid_career' : 'late_career';
  const list = occ[tier] || [];
  const o = rng.pick(list) || 'Freelancer';
  return o === 'UNEMPLOYED' ? 'Unemployed' : o;
}

function homeland(flavor, rng) {
  const origins = flavor.characterOrigins || [];
  const region = rng.pick(origins);
  if (!region) return { region: 'Unknown', country: 'Unknown', language: 'English' };
  if (region.countries) {
    const c = rng.pick(region.countries);
    return { region: region.region, country: c.name, language: rng.pick(c.languages) };
  }
  return { region: region.region, country: region.region, language: rng.pick(region.languages || ['English']) };
}

function complicationsFor(ch, flavor, theme, rng, motivation) {
  const out = [];
  const story = flavor.story;
  out.push({ type: 'Motivation', text: `${motivation.name}: ${motivation.text}` });
  if (theme?.weakness?.length && rng.chance(0.65)) {
    const w = rng.pick(theme.weakness);
    out.push({ type: rng.chance(0.5) ? 'Weakness' : 'Power Loss', text: `Vulnerable to ${w}.` });
  }
  const pool = Object.entries(flavor.complications || {}).filter(([name]) => name !== 'Motivation');
  const n = rng.int(1, 2);
  for (const [name, c] of rng.sample(pool, n)) {
    const challenge = rng.pick(c.challenges || []);
    out.push({ type: name, text: `${c.description}${challenge ? ` Lately: ${challenge}` : ''}` });
  }
  if (rng.chance(0.5)) out.push({ type: 'Relationship', text: `Cares deeply about ${rng.pick(story.relationships)}.` });
  if (ch.alignment === 'hero' && rng.chance(0.4) && !out.some((x) => /Identity/.test(x.type))) {
    out.push({ type: 'Secret Identity', text: 'Keeps their civilian life separate, and the strain shows.' });
  }
  return out;
}

const ROBOT_WORDS = ['Sentinel', 'Vector', 'Bastion', 'Paragon', 'Cipher', 'Warden', 'Mainframe', 'Ironside', 'Talos', 'Servo', 'Axiom', 'Override', 'Kilowatt', 'Rook', 'Golem', 'Automata'];
const ROBOT_ORIGINS = [
  'was built in a hidden lab to be the perfect bodyguard, then rewrote its own orders',
  'woke up in a scrapyard with half its memory gone and a hero\'s face burned into its sensors',
  'was assembled from the wreckage of an alien war machine by a teenage engineer',
  'was a decommissioned military prototype that refused to be switched off',
  'was designed to replace heroes, and decided to become one instead',
  'came through a dimensional rift with no maker and no memory',
];

function designation(rng) {
  const L = 'ABCDEFGHJKLMNPRSTVWXZ';
  return `${L[rng.int(0, L.length - 1)]}${L[rng.int(0, L.length - 1)]}-${rng.int(1, 999)}`;
}

function minionIdentity(R, ch, arch, rng) {
  const flavor = R.raw.flavor;
  const story = flavor.story;
  const mindless = arch.automaton;
  const gender = mindless ? 'None' : rng.pick(['Female', 'Male']);
  const first = gender === 'Female' ? rng.pick(flavor.female_names) : rng.pick(flavor.male_names);
  return {
    identity: {
      codename: arch.name,
      realName: mindless ? `Unit ${designation(rng)}` : `${first} ${rng.pick(story.surnames)}`,
      gender, age: mindless ? null : rng.int(19, 52), occupation: arch.name, base: rng.pick(story.cities), languages: mindless ? [] : ['English'],
    },
    origin: { type: 'minion', label: 'Minion', text: arch.blurb || '' },
    goal: mindless ? 'obey its orders' : rng.pick(['get paid', 'stay alive', 'impress the boss', 'pay off a debt']),
    personality: mindless ? { positive: [], negative: [], quirk: null } : { positive: [rng.pick(flavor.PersonalityTraits?.positive_traits || ['loyal'])], negative: [rng.pick(flavor.PersonalityTraits?.negative_traits || ['greedy'])], quirk: null },
    appearance: { costume: arch.blurb || '' },
    complications: [],
    notes: 'Minion: uses the minion rules (no hero points; one failed Toughness check takes it out).',
  };
}

export function makeIdentity(R, ch, { arch, theme, themes, rng, gender: wantGender }) {
  if (arch?.minion) return minionIdentity(R, ch, arch, rng);
  const flavor = R.raw.flavor;
  const story = flavor.story;
  const nameRng = rng.fork('name');
  const g = wantGender && wantGender !== 'random' ? wantGender : nameRng.weighted([
    { v: 'Female', weight: 46 }, { v: 'Male', weight: 46 }, { v: 'Nonbinary', weight: 8 },
  ]).v;
  const first = g === 'Female' ? nameRng.pick(flavor.female_names)
    : g === 'Male' ? nameRng.pick(flavor.male_names)
      : nameRng.pick(story.neutral_names);
  const last = nameRng.pick(story.surnames);
  let codename = makeCodename(story, theme, ch.alignment, nameRng.fork('codename'), arch?.construct ? 'None' : g);
  if (arch?.construct && nameRng.chance(0.6)) codename = nameRng.chance(0.5) ? nameRng.pick(ROBOT_WORDS) : `${nameRng.pick(ROBOT_WORDS)}-${nameRng.int(1, 9)}`;

  const age = pickAge(rng);
  const home = homeland(flavor, rng);
  const originType = rng.pick(arch.origins || Object.keys(story.origins));
  const origin = story.origins[originType] || Object.values(story.origins)[0];
  const originLine = rng.pick(origin.lines);
  const powerSource = ch.archetype && !arch.powerless && theme?.origin_hint ? ` Their ${theme.name.toLowerCase()} powers trace back to ${pickOne(theme.origin_hint, rng)}.` : '';
  const motives = flavor.motivations?.[ch.alignment === 'villain' ? 'Villain' : 'Hero'] || {};
  const motivationName = rng.pick(Object.keys(motives)) || 'Justice';
  const motivation = { name: motivationName, text: motives[motivationName] || '' };
  const goal = rng.pick(ch.alignment === 'villain' ? story.villain_goals : story.hero_goals);

  const traits = flavor.PersonalityTraits || {};
  const personality = {
    positive: rng.sample(traits.positive_traits || [], rng.int(1, 3)),
    negative: rng.sample(traits.negative_traits || [], rng.int(1, 2)),
    quirk: rng.pick(story.quirks),
  };
  const phys = flavor.physical_traits || {};
  const pt = phys.PHYSICAL_TRAITS || {};
  const appearance = {
    height: rng.pick(pt.HEIGHT || ['Average']),
    eyes: rng.pick(pt.EYE_COLOR || ['Brown']),
    hair: rng.pick(pt.HAIR_COLOR || ['Black']),
    skin: rng.pick(pt.SKIN_TONE || ['Medium']),
    costume: `${cap(rng.pick(theme?.costume || ['black and gray']))}, ${String(rng.pick(phys.COSTUME_STYLES || ['practical'])).toLowerCase()}`,
    feature: rng.pick(phys.DISTINCTIVE_FEATURES || ['None']),
  };
  const sizeBase = { 'Very Short': 110, Short: 130, Diminutive: 90, Average: 160, Tall: 190, 'Very Tall': 220, Giant: 320 };
  appearance.weight = Math.round(((sizeBase[appearance.height] ?? 165) + rng.int(-25, 45)) / 5) * 5;
  const base = rng.pick(story.cities);
  const languages = [home.language && home.language !== 'English' && !/dialect|tribal/i.test(home.language) ? home.language : null, 'English'].filter(Boolean);

  if (arch?.construct) {
    const line = rng.pick(ROBOT_ORIGINS);
    return {
      identity: {
        codename, realName: `Model ${designation(nameRng)}`, gender: arch.automaton ? 'None' : g, age: rng.int(1, 30),
        occupation: arch.automaton ? 'Combat unit' : rng.pick(['Lab assistant', 'Security unit', 'Research android', 'Rescue unit', 'Prototype']),
        base, homeland: null, languages: arch.automaton ? [] : ['English', 'Binary'],
      },
      origin: { type: 'tech', label: 'Construct', text: `${codename} ${line}.` },
      goal,
      personality: arch.automaton ? { positive: ['relentless'], negative: ['literal-minded'], quirk: 'recites its directive when idle' } : personality,
      appearance: { ...appearance, eyes: rng.pick(['Glowing red optics', 'Blue optics', 'Visor', 'Camera lenses']), hair: 'None', skin: rng.pick(['Brushed steel', 'Matte black plating', 'Chrome', 'Synthetic skin']) },
      complications: complicationsFor(ch, flavor, theme, rng, motivation).filter((x) => x.type !== 'Secret Identity'),
      notes: 'Construct (DC Adventures ch. 7): no Stamina; immune to Fortitude effects; repaired rather than healed.',
    };
  }
  return {
    identity: {
      codename,
      realName: `${first} ${last}`,
      gender: g,
      age,
      occupation: occupationFor(age, flavor, arch, rng),
      base,
      homeland: home,
      languages: Array.from(new Set(languages)),
    },
    origin: { type: originType, label: origin.label, text: `${first} ${originLine}.${powerSource}` },
    goal,
    personality,
    appearance,
    complications: complicationsFor(ch, flavor, theme, rng, motivation),
    notes: '',
  };
}
