import { useEffect, useReducer, useState } from "react";

/* ---------- Vakiot ---------- */

// Kaikki kartat
const ALL_MAPS = [
  "Abyss",
  "Ascent",
  "Bind",
  "Breeze",
  "Corrode",
  "Fracture",
  "Haven",
  "Icebox",
  "Lotus",
  "Pearl",
  "Split",
  "Summit",
  "Sunset",
];

// Nykyinen kilpailupooli (patch: Bind ja Corrode sisään, Ascent ja Split pois)
const COMP_POOL = [
  "Abyss",
  "Bind",
  "Corrode",
  "Haven",
  "Lotus",
  "Summit",
  "Sunset",
];

// Tunnetut kartat ALL_MAPS-järjestyksessä, omat kartat perässä
const normalizePool = (list) => [
  ...ALL_MAPS.filter((m) => list.includes(m)),
  ...list.filter((m) => !ALL_MAPS.includes(m)),
];

const FORMATS = {
  BO1: [
    "A_ban",
    "B_ban",
    "A_ban",
    "B_ban",
    "A_ban",
    "B_ban",
    "decider",
    "A_side",
  ],
  BO3: [
    "A_ban",
    "B_ban",
    "A_pick",
    "B_side",
    "B_pick",
    "A_side",
    "A_ban",
    "B_ban",
    "decider",
    "A_side",
  ],
  // Tavallinen BO5 (sääntökirja 31)
  BO5: [
    "A_ban",
    "B_ban",
    "A_pick",
    "B_side",
    "B_pick",
    "A_side",
    "A_pick",
    "B_side",
    "B_pick",
    "A_side",
    "decider",
    "B_side",
  ],
  // Double Elimination Grand Final (sääntökirja 32): upper bracket -joukkue bannaa kaksi karttaa
  BO5_GF: [
    "UB_ban",
    "UB_ban",
    "A_pick",
    "B_side",
    "B_pick",
    "A_side",
    "A_pick",
    "B_side",
    "B_pick",
    "A_side",
    "decider",
    "B_side",
  ],
};

const FORMAT_LABELS = {
  BO1: "BO1",
  BO3: "BO3",
  BO5: "BO5",
  BO5_GF: "BO5 Grand Final",
};

// Kartat, jotka formaatti kuluttaa (ban + pick) + yksi decider
const requiredPool = (format) =>
  FORMATS[format].filter((a) => a.includes("ban") || a.includes("pick"))
    .length + 1;

/* ---------- URL-tilan koodaus (URL-turvallinen base64) ---------- */

const encodeState = (state) => {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const decodeState = (str) => {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/").replace(/ /g, "+");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

/* ---------- Apufunktiot ---------- */

const kindOf = (action) => {
  if (!action) return "done";
  if (action.includes("ban")) return "ban";
  if (action.includes("pick")) return "pick";
  if (action.includes("side")) return "side";
  return "decider";
};

const KIND_LABELS = {
  ban: "Ban",
  pick: "Pick",
  side: "Pick side",
  decider: "Decider",
  done: "Done",
};

// Tyhjä kenttä -> oletusnimi "Team A" / "Team B"
const displayName = (s, slot) =>
  (slot === "A" ? s.teamA : s.teamB).trim() || `Team ${slot}`;

const getActor = (action, s) => {
  if (!action) return null;
  if (action.startsWith("UB")) return displayName(s, s.upperBracket);
  if (action.startsWith("A")) return displayName(s, "A");
  if (action.startsWith("B")) return displayName(s, "B");
  return null;
};

// Kumman paikan (A/B) vuoro on
const getSlot = (action, s) => {
  if (!action) return null;
  if (action.startsWith("UB")) return s.upperBracket;
  if (action.startsWith("A")) return "A";
  if (action.startsWith("B")) return "B";
  return null;
};

// Vaihtaa joukkueiden paikat (A vetoaa ensin). Upper bracket seuraa joukkuetta.
const swapTeams = (s) => ({
  ...s,
  teamA: s.teamB,
  teamB: s.teamA,
  upperBracket: s.upperBracket === "A" ? "B" : "A",
  absent: { A: s.absent.B, B: s.absent.A },
});

const snapshot = (s) => ({
  remaining: s.remaining,
  picked: s.picked,
  log: s.log,
  step: s.step,
});

// Lokimerkintä: teksti + aikaleima (ms). timed = oikea pelaajan vuoro, jolle näytetään kesto.
const entry = (text, at, timed = false) => ({ text, at, timed });

// Jos seuraava vaihe on decider ja jäljellä on yksi kartta, ratkaistaan se
// samassa tilasiirtymässä -> undo palauttaa kerralla oikeaan kohtaan.
const settle = (s, now) => {
  const action = FORMATS[s.format][s.step];
  if (action === "decider" && s.remaining.length === 1) {
    const map = s.remaining[0];
    return {
      ...s,
      remaining: [],
      picked: [...s.picked, { map, side: null, sideBy: null }],
      log: [...s.log, entry(`Decider map: ${map} (left over)`, now)],
      step: s.step + 1,
    };
  }
  return s;
};

// Ajastin: sääntökirja 45 -> ban/pick 60 sekuntia, sen jälkeen satunnainen valinta.
// Puolenvalinnat eivät ole ajastettuja (säännöt eivät mainitse niitä).
const TURN_SECONDS = 60;
const TIMED_KINDS = ["ban", "pick"];

// Asettaa seuraavan vuoron deadlinen (null, jos ajastin pois tai vuoro ei ole ajastettu).
// "now" annetaan actionissa, jotta reducer pysyy puhtaana.
const withDeadline = (s, now) => {
  if (!s.timerEnabled) return { ...s, deadline: null };
  const kind = kindOf(FORMATS[s.format][s.step]);
  return {
    ...s,
    deadline: TIMED_KINDS.includes(kind) ? now + TURN_SECONDS * 1000 : null,
  };
};

// Kartan ban/pick (myös ajastimen satunnaisvalinta, auto = true)
const applyMap = (s, map, now, note = "") => {
  const action = FORMATS[s.format][s.step];
  const kind = kindOf(action);
  const verb = kind === "ban" ? "banned" : "picked";

  return withDeadline(
    settle({
      ...s,
      history: [...s.history, snapshot(s)],
      remaining: s.remaining.filter((m) => m !== map),
      picked:
        kind === "pick"
          ? [...s.picked, { map, side: null, sideBy: null }]
          : s.picked,
      log: [...s.log, entry(`${getActor(action, s)} ${verb} ${map}${note}`, now, true)],
      step: s.step + 1,
    }, now),
    now
  );
};

// Puolen valinta (myös satunnainen, note kertoo syyn)
const applySide = (s, side, now, note = "") => {
  const action = FORMATS[s.format][s.step];
  const last = s.picked[s.picked.length - 1];
  const actor = getActor(action, s);

  return withDeadline(
    settle({
      ...s,
      history: [...s.history, snapshot(s)],
      picked: [...s.picked.slice(0, -1), { ...last, side, sideBy: actor }],
      log: [
        ...s.log,
        entry(`${actor} picked ${side} side on ${last.map}${note}`, now, true),
      ],
      step: s.step + 1,
    }, now),
    now
  );
};

// Kellonaika (24 h) ja päivämäärä aikaleimasta
const formatTime = (at) =>
  at ? new Date(at).toLocaleTimeString("en-GB", { hour12: false }) : "";
const formatDate = (at) => (at ? new Date(at).toLocaleDateString("en-CA") : "");

const formatClock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/* ---------- Reducer ---------- */

const initialState = () => ({
  teamA: "", // tyhjä -> näytetään oletusnimi "Team A" (placeholder)
  teamB: "",
  upperBracket: "A", // "A" tai "B"
  // "assign": heitto arpoo, kumpi on Team A (VCT) | "choose": voittaja valitsee vetojärjestyksen
  tossMode: "assign",
  toss: null, // { winnerSlot, winnerName, choice: null | "first" | "second", swapped, auto? }
  timerEnabled: false,
  deadline: null, // aikaleima (ms), jolloin nykyinen vuoro päättyy
  startedAt: null, // ajastimella käynnistetyn vedon alkuaika (ms)
  absent: { A: false, B: false }, // poissa oleva joukkue: admin arpoo sen valinnat
  format: "BO1",
  maps: COMP_POOL,
  remaining: COMP_POOL,
  picked: [],
  log: [],
  step: 0,
  history: [],
});

const freshVeto = (s) => ({
  ...s,
  remaining: s.maps,
  picked: [],
  log: [],
  step: 0,
  history: [],
  deadline: null,
  startedAt: null,
});

function reducer(s, a) {
  const action = FORMATS[s.format][s.step];
  const kind = kindOf(action);

  switch (a.type) {
    case "SET_FIELD":
      return { ...s, [a.key]: a.value };

    case "SET_FORMAT": {
      if (s.step !== 0 || s.deadline !== null) return s; // vedon alettua vain Reset avaa lukon
      // Grand Finalissa upper bracket -joukkue valitsee A/B, joten heitto perutaan
      const base =
        a.format === "BO5_GF" && s.toss
          ? { ...(s.toss.swapped ? swapTeams(s) : s), toss: null }
          : s;
      return freshVeto({ ...base, format: a.format });
    }

    case "SWAP_TEAMS":
      if (s.step !== 0 || s.toss) return s;
      return swapTeams(s);

    // Satunnainen voittaja annetaan actionissa, jotta reducer pysyy puhtaana
    case "COIN_TOSS": {
      if (s.step !== 0 || s.toss) return s;
      const winnerName = displayName(s, a.winner);

      // VCT-tila: heitto arpoo suoraan, kumpi joukkue on Team A
      if (s.tossMode === "assign") {
        const swap = a.winner === "B";
        const base = swap ? swapTeams(s) : s;
        return {
          ...base,
          toss: {
            winnerSlot: a.winner,
            winnerName,
            choice: "first",
            swapped: swap,
            auto: true,
          },
        };
      }

      // Challengermode-tila: voittaja valitsee vetojärjestyksen
      return {
        ...s,
        toss: {
          winnerSlot: a.winner,
          winnerName,
          choice: null,
          swapped: false,
        },
      };
    }

    // Heiton voittaja valitsee, vetoaako ensin (= Team A) vai toisena (= Team B)
    case "TOSS_CHOICE": {
      if (!s.toss || s.toss.choice || s.step !== 0) return s;
      const wantsFirst = a.choice === "first";
      const winnerIsA = s.toss.winnerSlot === "A";
      const needSwap = winnerIsA !== wantsFirst;
      const base = needSwap ? swapTeams(s) : s;
      return { ...base, toss: { ...s.toss, choice: a.choice, swapped: needSwap } };
    }

    case "TOSS_RESET": {
      if (!s.toss || s.step !== 0) return s;
      const base = s.toss.swapped ? swapTeams(s) : s;
      return { ...base, toss: null };
    }

    // Ajastin käynnistetään erikseen, jotta ensimmäisen vuoron kello ei lähde itsestään
    case "START_TIMER": {
      if (!s.timerEnabled || s.deadline !== null || s.step !== 0) return s;
      if (s.maps.length !== requiredPool(s.format)) return s;
      if (s.toss && !s.toss.choice) return s;
      return withDeadline({ ...s, startedAt: a.now }, a.now);
    }

    case "VETO_MAP": {
      if (s.toss && !s.toss.choice) return s; // heitto kesken
      if (s.timerEnabled && s.deadline === null) return s; // ajastin ei käynnissä
      if (kind !== "ban" && kind !== "pick") return s;
      if (s.maps.length !== requiredPool(s.format)) return s;
      if (!s.remaining.includes(a.map)) return s;
      return applyMap(s, a.map, a.now);
    }

    // Aika loppui: satunnainen kartta jäljellä olevista (random annetaan actionissa)
    case "AUTO_PICK": {
      if (!s.timerEnabled || s.deadline === null || a.now < s.deadline) return s;
      if (kind !== "ban" && kind !== "pick") return s;
      if (s.remaining.length === 0) return s;
      const i = Math.min(
        s.remaining.length - 1,
        Math.floor(a.random * s.remaining.length)
      );
      return applyMap(s, s.remaining[i], a.now, " (random, time ran out)");
    }

    case "PICK_SIDE": {
      if (kind !== "side") return s;
      if (!s.picked[s.picked.length - 1]) return s;
      return applySide(s, a.side, a.now);
    }

    /* ---- Admin-työkalut (sääntö 57) ---- */

    // Vain toinen joukkue voi olla poissa; kun kumpikaan ei saavu, käytetään BOTH_ABSENT-työkalua
    case "SET_ABSENT": {
      const other = a.slot === "A" ? "B" : "A";
      if (a.value && s.absent[other]) return s;
      // vedon alettua (ensimmäinen vuoro tai Start veto) ei voi enää merkitä poissaolevaksi
      if (a.value && (s.step > 0 || s.startedAt !== null)) return s;
      return { ...s, absent: { ...s.absent, [a.slot]: a.value } };
    }

    // Tuomarit arpovat vuoron: satunnainen kartta tai puoli (random annetaan actionissa)
    case "RANDOM_TURN": {
      if (s.toss && !s.toss.choice) return s;
      if (s.maps.length !== requiredPool(s.format)) return s;
      const note = " (randomized by officials)";

      if (kind === "ban" || kind === "pick") {
        if (s.remaining.length === 0) return s;
        const i = Math.min(
          s.remaining.length - 1,
          Math.floor(a.random * s.remaining.length)
        );
        return applyMap(s, s.remaining[i], a.now, note);
      }
      if (kind === "side") {
        if (!s.picked[s.picked.length - 1]) return s;
        return applySide(s, a.random < 0.5 ? "Attack" : "Defense", a.now, note);
      }
      return s;
    }

    // Kumpikaan joukkue ei saapunut: poolin 3 (BO5: 5) ensimmäistä karttaa aakkosjärjestyksessä,
    // puolet arvotaan. a.sides: lista "A" | "B" (kumpi aloittaa Attackilla)
    case "BOTH_ABSENT": {
      const count =
        s.format === "BO3" ? 3 : s.format === "BO5" || s.format === "BO5_GF" ? 5 : 0;
      if (count === 0 || s.step !== 0) return s;
      if (s.toss && !s.toss.choice) return s;
      if (s.maps.length !== requiredPool(s.format)) return s;

      const chosen = [...s.maps].sort((x, y) => x.localeCompare(y)).slice(0, count);
      const picked = chosen.map((map, i) => ({
        map,
        side: "Attack",
        sideBy: displayName(s, a.sides[i] === "B" ? "B" : "A"),
      }));

      return {
        ...s,
        history: [...s.history, snapshot(s)],
        picked,
        remaining: [], // pelaamattomat kartat näkyvät bannattuina (himmeinä)
        log: [
          entry(
            `Both teams absent: first ${count} maps in alphabetical order, sides randomized`,
            a.now
          ),
          ...picked.map((p, i) =>
            entry(
              `Map ${i + 1}: ${p.map} – ${p.sideBy} starts on Attack (random)`,
              a.now
            )
          ),
        ],
        step: FORMATS[s.format].length,
        deadline: null,
        absent: { A: false, B: false },
      };
    }

    case "UNDO": {
      if (s.history.length === 0) return s;
      const prev = s.history[s.history.length - 1];
      const restored = { ...s, ...prev, history: s.history.slice(0, -1) };
      // Alkuun palatessa ajastin pysähtyy; muuten palautetun vuoron kello alkaa alusta
      return restored.step === 0
        ? { ...restored, deadline: null, startedAt: null }
        : withDeadline(restored, a.now);
    }

    case "RESET":
      return freshVeto(s);

    // Poolia voi muokata vain ennen vedon alkua
    case "TOGGLE_MAP": {
      if (s.step !== 0) return s;
      const maps = s.maps.includes(a.map)
        ? s.maps.filter((m) => m !== a.map)
        : normalizePool([...s.maps, a.map]);
      return { ...s, maps, remaining: maps };
    }

    case "SET_POOL": {
      if (s.step !== 0) return s;
      return { ...s, maps: a.maps, remaining: a.maps };
    }

    case "ADD_MAP": {
      if (s.step !== 0) return s;
      const typed = a.name.trim();
      if (!typed) return s;
      // Jos nimi vastaa tunnettua karttaa, käytetään sen oikeaa kirjoitusasua
      const name =
        ALL_MAPS.find((m) => m.toLowerCase() === typed.toLowerCase()) ?? typed;
      if (s.maps.some((m) => m.toLowerCase() === name.toLowerCase())) return s;
      const maps = normalizePool([...s.maps, name]);
      return { ...s, maps, remaining: maps };
    }

    default:
      return s;
  }
}

// Lukee tilan URL:sta (vanhat linkit, joissa upperBracket oli joukkueen nimi, toimivat edelleen)
function init() {
  const base = initialState();
  try {
    const encoded = new URLSearchParams(window.location.search).get("state");
    if (!encoded) return base;

    const d = decodeState(encoded);
    // Vanhoissa linkeissä (ilman v-kenttää) "BO5" tarkoitti Grand Finalia
    const format = d.format === "BO5" && d.v !== 2 ? "BO5_GF" : d.format;
    const valid =
      FORMATS[format] &&
      Array.isArray(d.maps) &&
      Array.isArray(d.remaining) &&
      Array.isArray(d.picked) &&
      Array.isArray(d.log) &&
      Number.isInteger(d.step);
    if (!valid) return base;

    const upperBracket =
      d.upperBracket === "A" || d.upperBracket === "B"
        ? d.upperBracket
        : d.upperBracket === d.teamB
          ? "B"
          : "A";

    return {
      ...base,
      teamA: typeof d.teamA === "string" ? d.teamA : base.teamA,
      teamB: typeof d.teamB === "string" ? d.teamB : base.teamB,
      upperBracket,
      toss:
        d.toss && typeof d.toss.winnerName === "string"
          ? {
              winnerSlot: d.toss.winnerSlot === "B" ? "B" : "A",
              winnerName: d.toss.winnerName,
              choice:
                d.toss.choice === "first" || d.toss.choice === "second"
                  ? d.toss.choice
                  : null,
              swapped: !!d.toss.swapped,
              auto: !!d.toss.auto,
            }
          : null,
      format,
      tossMode: d.tossMode === "choose" ? "choose" : "assign",
      absent: {
        A: d.absent?.A === true,
        B: d.absent?.B === true && d.absent?.A !== true,
      },
      timerEnabled: d.timerEnabled === true,
      deadline: Number.isFinite(d.deadline) ? d.deadline : null,
      maps: d.maps,
      remaining: d.remaining,
      picked: d.picked,
      log: d.log.map((l) =>
        typeof l === "string"
          ? entry(l, null)
          : entry(String(l?.text ?? ""), Number.isFinite(l?.at) ? l.at : null, !!l?.timed)
      ),
      startedAt: Number.isFinite(d.startedAt) ? d.startedAt : null,
      step: d.step,
    };
  } catch {
    console.error("Invalid URL state");
    return base;
  }
}

/* ---------- Tyylit ---------- */

const btn =
  "rounded border border-[#3a4a5a] bg-[#1b2733] px-3 py-2 text-sm font-medium text-[#ece8e1] transition hover:border-[#ff4655] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#3a4a5a]";
const input =
  "rounded border border-[#3a4a5a] bg-[#1b2733] px-3 py-2 text-[#ece8e1] outline-none focus:border-[#ff4655] disabled:opacity-50";

/* ---------- Karttakortti ---------- */

// Kuvat: public/maps/<kartan nimi pienillä kirjaimilla>.webp (esim. public/maps/abyss.webp)
const IMAGE_EXT = "webp";
const mapImage = (map) =>
  `${import.meta.env.BASE_URL}maps/${map.toLowerCase()}.${IMAGE_EXT}`;

function MapCard({ map, status, clickable, onClick }) {
  // Jos kuvaa ei löydy (esim. oma kartta), näytetään pelkkä tekstikortti
  const [imgOk, setImgOk] = useState(true);
  const picked = status.type === "picked";
  const banned = status.type === "banned";

  const border = picked
    ? "border-[#ff4655]"
    : banned
      ? "border-[#2a3642]"
      : clickable
        ? "border-[#3a4a5a] hover:border-[#ff4655]"
        : "border-[#3a4a5a]";

  return (
    <button
      disabled={!clickable}
      onClick={onClick}
      className={`group relative aspect-video w-full overflow-hidden rounded-lg border-2 bg-[#1b2733] transition disabled:cursor-default ${border}`}
    >
      {imgOk && (
        <img
          src={mapImage(map)}
          alt=""
          loading="lazy"
          onError={() => setImgOk(false)}
          className={`absolute inset-0 h-full w-full object-cover transition ${
            banned ? "opacity-40 grayscale" : ""
          }`}
        />
      )}

      {/* Tummennus, jotta teksti pysyy luettavana kuvan päällä */}
      <div
        className={`absolute inset-0 transition ${
          imgOk ? "bg-black/45" : ""
        } ${clickable ? "group-hover:bg-black/25" : ""}`}
      />

      {/* Kartan nimi keskellä kuvan päällä */}
      <span
        className={`relative flex h-full items-center justify-center px-2 text-lg font-bold tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
          banned ? "text-[#9fb0c0] line-through" : "text-white"
        }`}
      >
        {map}
      </span>

      {picked && (
        <span className="absolute left-2 top-2 rounded bg-[#ff4655] px-2 py-0.5 text-xs font-semibold text-white">
          Map {status.order}
        </span>
      )}
      {banned && (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-[#9fb0c0]">
          Banned
        </span>
      )}
    </button>
  );
}

/* ---------- Komponentti ---------- */

export default function ValorantVetoTool() {
  const [state, dispatch] = useReducer(reducer, null, init);
  const [newMap, setNewMap] = useState("");
  const [copied, setCopied] = useState("");

  const {
    teamA,
    teamB,
    upperBracket,
    toss,
    tossMode,
    timerEnabled,
    deadline,
    startedAt,
    absent,
    format,
    maps,
    remaining,
    picked,
    log,
    step,
    history,
  } = state;

  const nameA = displayName(state, "A");
  const nameB = displayName(state, "B");
  const tossPending = !!toss && !toss.choice;
  const namesLocked = step > 0 || !!toss;

  const action = FORMATS[format][step];
  const kind = kindOf(action);
  const actor = getActor(action, state);
  const actorSlot = getSlot(action, state);
  const needed = requiredPool(format);
  const poolValid = maps.length === needed;
  const started = step > 0;
  const lastPicked = picked[picked.length - 1];

  // Ajastin: jos käytössä, karttoja voi klikata vasta kun kello on käynnistetty
  const timerReady = !timerEnabled || deadline !== null;
  const canStartTimer =
    timerEnabled && step === 0 && deadline === null && poolValid && !tossPending;

  const [now, setNow] = useState(() => Date.now());
  const secondsLeft =
    deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));

  // Tämän hetkinen admin-oikeus. Yksi paikka, jota voi myöhemmin ohjata palvelimelta
  // (huoneen admin-token) tai salasanalla. Nyt työkalut näkyvät kaikille.
  const isAdmin = true;

  // Poissa olevan joukkueen vuorot arvotaan automaattisesti pienellä viiveellä
  const actorAbsent = !!actorSlot && absent[actorSlot];
  useEffect(() => {
    if (!actorAbsent || tossPending || !poolValid) return;
    const id = setTimeout(() => {
      dispatch({ type: "RANDOM_TURN", now: Date.now(), random: Math.random() });
    }, 700);
    return () => clearTimeout(id);
  }, [actorAbsent, step, tossPending, poolValid]);

  // Päivittää näytön 4 kertaa sekunnissa; kun aika loppuu, arvotaan kartta.
  // Reducer tarkistaa itse, onko deadline todella ylittynyt, joten tuplakutsu on harmiton.
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) {
        dispatch({ type: "AUTO_PICK", now: t, random: Math.random() });
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  // Tila URL:iin (history jätetään pois, jotta linkki pysyy lyhyenä)
  useEffect(() => {
    const { history: _history, ...persist } = state;
    window.history.replaceState(null, "", `?state=${encodeState({ ...persist, v: 2 })}`);
  }, [state]);

  const statusOf = (map) => {
    const idx = picked.findIndex((p) => p.map === map);
    if (idx >= 0) return { type: "picked", order: idx + 1 };
    if (remaining.includes(map)) return { type: "available" };
    return { type: "banned" };
  };

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      console.error("Clipboard not available");
    }
  };

  const resultsText =
    `${nameA} vs ${nameB} (${format})\n` +
    picked
      .map(
        (p, i) =>
          `Map ${i + 1}: ${p.map}${p.side ? ` (Side: ${p.side} by ${p.sideBy})` : ""}`
      )
      .join("\n");

  // Vuoron kesto: aika edellisestä merkinnästä (ensimmäiselle ajastimen käynnistyksestä)
  const durations = log.map((e, i) => {
    const prev = i === 0 ? startedAt : log[i - 1].at;
    return e.timed && e.at && prev ? Math.max(0, Math.round((e.at - prev) / 1000)) : null;
  });

  // Kirjallinen vetotallenne (VCT Kickoff 43)
  const vetoLogText = [
    `Map veto: ${nameA} vs ${nameB} (${FORMAT_LABELS[format]})`,
    ...(log[0]?.at ? [`Date: ${formatDate(log[0].at)}`] : []),
    `Team A: ${nameA}, Team B: ${nameB}`,
    ...(toss?.choice
      ? [
          `Coin toss: ${toss.winnerName} won the toss${
            toss.auto ? "" : ` and chose to veto ${toss.choice}`
          }`,
        ]
      : []),
    ...(timerEnabled ? [`Turn timer: ${TURN_SECONDS} s per ban or pick`] : []),
    `Map pool: ${maps.join(", ")}`,
    "",
    ...log.map((e, i) => {
      const time = formatTime(e.at);
      return `${time ? `[${time}] ` : ""}${e.text}${
        durations[i] !== null ? ` (+${durations[i]} s)` : ""
      }`;
    }),
    ...(picked.length > 0
      ? [
          "",
          "Final series order:",
          ...picked.map(
            (p, i) =>
              `Map ${i + 1}: ${p.map}${p.side ? ` (Side: ${p.side} by ${p.sideBy})` : ""}`
          ),
        ]
      : []),
  ].join("\n");

  const submitMap = () => {
    dispatch({ type: "ADD_MAP", name: newMap });
    setNewMap("");
  };

  return (
    <div className="min-h-screen bg-[#0f1923] text-[#ece8e1]">
      <div className="mx-auto max-w-4xl space-y-5 p-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Valorant tournament veto tool
        </h1>

        {/* Asetukset */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Series format"
            value={format}
            disabled={started || deadline !== null}
            onChange={(e) => dispatch({ type: "SET_FORMAT", format: e.target.value })}
            className={input}
          >
            {Object.keys(FORMATS).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABELS[f]}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={timerEnabled}
              disabled={started || deadline !== null}
              onChange={(e) =>
                dispatch({
                  type: "SET_FIELD",
                  key: "timerEnabled",
                  value: e.target.checked,
                })
              }
              className="h-4 w-4 accent-[#ff4655]"
            />
            {TURN_SECONDS} s turn timer
          </label>
        </div>

        {/* Joukkueet */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            aria-label="Team A name"
            placeholder="Team A"
            value={teamA}
            disabled={namesLocked}
            onChange={(e) =>
              dispatch({ type: "SET_FIELD", key: "teamA", value: e.target.value })
            }
            className={input}
          />
          <input
            aria-label="Team B name"
            placeholder="Team B"
            value={teamB}
            disabled={namesLocked}
            onChange={(e) =>
              dispatch({ type: "SET_FIELD", key: "teamB", value: e.target.value })
            }
            className={input}
          />
        </div>
        {format !== "BO5_GF" && (
          <p className="-mt-3 text-sm text-[#6b7a88]">
            Team A vetoes first: the higher seed, or the team chosen by the
            coin toss.
          </p>
        )}

        {format === "BO5_GF" && (
          <div className="space-y-2">
            <select
              aria-label="Upper bracket team"
              value={upperBracket}
              disabled={started}
              onChange={(e) =>
                dispatch({ type: "SET_FIELD", key: "upperBracket", value: e.target.value })
              }
              className={input}
            >
              <option value="A">{nameA} (Team A) is upper bracket</option>
              <option value="B">{nameB} (Team B) is upper bracket</option>
            </select>
            <p className="text-sm text-[#6b7a88]">
              In the Grand Final the upper bracket team bans two maps and
              chooses whether it is Team A or Team B. Enter it in the matching
              field, then select it here.
            </p>
          </div>
        )}

        {/* Kolikonheitto */}
        {format !== "BO5_GF" && (!started || toss?.choice) && (
          <div className="space-y-2 rounded border border-[#3a4a5a] bg-[#1b2733] p-3">
            <div className="font-semibold">Coin toss</div>

            {!toss && !started && (
              <>
                <div className="space-y-1">
                  <select
                    aria-label="Coin toss mode"
                    value={tossMode}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_FIELD",
                        key: "tossMode",
                        value: e.target.value,
                      })
                    }
                    className={input}
                  >
                    <option value="assign">Toss assigns Team A</option>
                    <option value="choose">Winner chooses order</option>
                  </select>
                  <p className="text-sm text-[#6b7a88]">
                    {tossMode === "assign"
                      ? "The toss decides which team is Team A (VCT rules)."
                      : "The toss winner chooses whether to veto first or second."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      dispatch({
                        type: "COIN_TOSS",
                        winner: Math.random() < 0.5 ? "A" : "B",
                      })
                    }
                    className={btn}
                  >
                    Flip coin
                  </button>
                  <button
                    onClick={() => dispatch({ type: "SWAP_TEAMS" })}
                    className={btn}
                  >
                    Swap A / B
                  </button>
                </div>

                <p className="text-sm text-[#6b7a88]">
                  Optional. Without a toss, {nameA} (Team A) vetoes first. Swap
                  A / B changes the order manually, for example by seeding.
                </p>
              </>
            )}

            {tossPending && (
              <div className="space-y-2">
                <p>
                  <span className="font-semibold text-[#ff4655]">
                    {toss.winnerName}
                  </span>{" "}
                  won the coin toss. Choose the veto order:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => dispatch({ type: "TOSS_CHOICE", choice: "first" })}
                    className={btn}
                  >
                    Veto first
                  </button>
                  <button
                    onClick={() => dispatch({ type: "TOSS_CHOICE", choice: "second" })}
                    className={btn}
                  >
                    Veto second
                  </button>
                </div>
              </div>
            )}

            {toss?.choice && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">
                  <span className="font-semibold text-[#ff4655]">
                    {toss.winnerName}
                  </span>{" "}
                  {toss.auto
                    ? "won the coin toss and is Team A."
                    : `won the toss and vetoes ${toss.choice}. ${nameA} is Team A.`}
                </p>
                <button
                  onClick={() => dispatch({ type: "TOSS_RESET" })}
                  disabled={started}
                  className={btn}
                >
                  Redo toss
                </button>
              </div>
            )}
          </div>
        )}

        {/* Oma karttapooli */}
        <details className="rounded border border-[#2a3642] p-3">
          <summary className="cursor-pointer font-semibold">
            Map pool{" "}
            <span className="font-normal text-[#9fb0c0]">
              ({maps.length} selected, {format} needs {needed})
            </span>
          </summary>
          <div className="mt-3 space-y-2">

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => dispatch({ type: "SET_POOL", maps: COMP_POOL })}
              disabled={started}
              className={btn}
            >
              Competitive pool
            </button>
            <button
              onClick={() => dispatch({ type: "SET_POOL", maps: ALL_MAPS })}
              disabled={started}
              className={btn}
            >
              Select all
            </button>
            <button
              onClick={() => dispatch({ type: "SET_POOL", maps: [] })}
              disabled={started}
              className={btn}
            >
              Clear
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {[...ALL_MAPS, ...maps.filter((m) => !ALL_MAPS.includes(m))].map(
              (m) => {
                const on = maps.includes(m);
                return (
                  <button
                    key={m}
                    aria-pressed={on}
                    disabled={started}
                    onClick={() => dispatch({ type: "TOGGLE_MAP", map: m })}
                    className={`rounded border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      on
                        ? "border-[#ff4655] bg-[#ff4655]/15"
                        : "border-[#3a4a5a] text-[#9fb0c0] hover:border-[#ff4655]"
                    }`}
                  >
                    {m}
                  </button>
                );
              }
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={newMap}
              disabled={started}
              placeholder="Add custom map"
              onChange={(e) => setNewMap(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitMap()}
              className={input}
            />
            <button onClick={submitMap} disabled={started} className={btn}>
              Add map
            </button>
          </div>

          {started && (
            <p className="text-sm text-[#6b7a88]">
              The format, team names and map pool can be changed after Reset.
            </p>
          )}
        </div>
        </details>

        {/* Pooli ei täsmää formaattiin */}
        {!poolValid && (
          <div
            role="alert"
            className="rounded border border-[#ff4655] bg-[#ff4655]/10 p-3 text-sm"
          >
            {format} needs a map pool of exactly {needed} maps. The pool has{" "}
            {maps.length}; {maps.length < needed ? "add" : "remove"}{" "}
            {Math.abs(needed - maps.length)} to start the veto (see Map pool).
          </div>
        )}

        {/* Vuoro */}
        <div className="space-y-2 rounded border border-[#3a4a5a] bg-[#1b2733] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
            <div>
              {kind === "done" ? (
                "Veto complete"
              ) : (
                <>
                  Current: <span className="text-[#ff4655]">{actor}</span> –{" "}
                  {KIND_LABELS[kind]}
                  {kind === "side" && lastPicked && ` on ${lastPicked.map}`}
                  {actorAbsent && (
                    <span className="ml-2 text-sm font-normal text-[#9fb0c0]">
                      (absent, randomized)
                    </span>
                  )}
                </>
              )}
            </div>
            {secondsLeft !== null && (
              <div
                className={`text-xl tabular-nums ${
                  secondsLeft <= 10 ? "text-[#ff4655]" : ""
                }`}
                aria-label="Time left for this turn"
              >
                {formatClock(secondsLeft)}
              </div>
            )}
          </div>

          {canStartTimer && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => dispatch({ type: "START_TIMER", now: Date.now() })}
                className="rounded bg-[#ff4655] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e03a48]"
              >
                Start veto
              </button>
              <p className="text-sm font-normal text-[#9fb0c0]">
                Each ban or pick has {TURN_SECONDS} seconds. If time runs out, a
                random map is chosen.
              </p>
            </div>
          )}
        </div>

        {/* Puolen valinta */}
        {kind === "side" && (
          <div className="flex gap-2">
            <button
              onClick={() => dispatch({ type: "PICK_SIDE", side: "Attack", now: Date.now() })}
              className={btn}
            >
              Attack
            </button>
            <button
              onClick={() => dispatch({ type: "PICK_SIDE", side: "Defense", now: Date.now() })}
              className={btn}
            >
              Defense
            </button>
          </div>
        )}

        {/* Karttapooli: bannatut himmeinä, valitut korostettuina */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {maps.map((map) => {
            const status = statusOf(map);
            const clickable =
              status.type === "available" &&
              poolValid &&
              !tossPending &&
              timerReady &&
              (kind === "ban" || kind === "pick");

            return (
              <MapCard
                key={map}
                map={map}
                status={status}
                clickable={clickable}
                onClick={() => dispatch({ type: "VETO_MAP", map, now: Date.now() })}
              />
            );
          })}
        </div>

        {/* Tulokset */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 font-semibold">Final series order</h2>
            {picked.length === 0 && (
              <p className="text-sm text-[#6b7a88]">No maps picked yet.</p>
            )}
            {picked.map((p, i) => (
              <div key={i}>
                Map {i + 1}: {p.map}{" "}
                {p.side && (
                  <span className="text-[#9fb0c0]">
                    (Side: {p.side} by {p.sideBy})
                  </span>
                )}
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-1 font-semibold">Veto log</h2>
            {log.length === 0 && (
              <p className="text-sm text-[#6b7a88]">Nothing has happened yet.</p>
            )}
            {log.map((e, i) => (
              <div key={i}>
                {e.at && (
                  <span className="mr-2 tabular-nums text-[#6b7a88]">
                    {formatTime(e.at)}
                  </span>
                )}
                {e.text}
                {durations[i] !== null && (
                  <span className="ml-2 text-sm text-[#6b7a88]">+{durations[i]} s</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Toiminnot */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => dispatch({ type: "RESET" })}
            className="rounded bg-[#ff4655] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#e03a48]"
          >
            Reset
          </button>
          <button
            onClick={() => dispatch({ type: "UNDO", now: Date.now() })}
            disabled={history.length === 0}
            className={btn}
          >
            Undo
          </button>
          <button
            onClick={() => copyText(window.location.href, "link")}
            className={btn}
          >
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
          <button
            onClick={() => copyText(resultsText, "results")}
            disabled={picked.length === 0}
            className={btn}
          >
            {copied === "results" ? "Results copied" : "Copy results"}
          </button>
          <button
            onClick={() => copyText(vetoLogText, "log")}
            disabled={log.length === 0}
            className={btn}
          >
            {copied === "log" ? "Veto log copied" : "Copy veto log"}
          </button>
        </div>


        {/* Admin-työkalut */}
        {isAdmin && (
          <details className="rounded border border-[#2a3642] p-3">
            <summary className="cursor-pointer font-semibold">Admin tools</summary>

            <div className="mt-3 space-y-5">
              <div className="space-y-2">
                <h3 className="font-semibold">Late or absent team</h3>
                <p className="text-sm text-[#6b7a88]">
                  If a team has not arrived within 10 minutes of the veto time,
                  officials randomize its choices (VCT Kickoff rule 57). If both
                  teams are absent, use the alphabetical series below instead.
                  A team can only be marked absent before the veto starts (before
                  Start veto when the timer is on). With the timer on, a turn that
                  runs out of time is randomized automatically; side picks are not
                  timed, so use Randomize current turn for those.
                </p>

                {["A", "B"].map((slot) => {
                  const otherAbsent = absent[slot === "A" ? "B" : "A"];
                  const vetoStarted = started || startedAt !== null;
                  const locked = otherAbsent || (vetoStarted && !absent[slot]);
                  return (
                  <label
                    key={slot}
                    className={`flex items-center gap-2 text-sm ${
                      locked ? "opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={absent[slot]}
                      disabled={locked}
                      onChange={(e) =>
                        dispatch({ type: "SET_ABSENT", slot, value: e.target.checked })
                      }
                      className="h-4 w-4 accent-[#ff4655]"
                    />
                    {slot === "A" ? nameA : nameB} (Team {slot}) is absent: randomize
                    its choices
                  </label>
                  );
                })}

                {(!timerEnabled || kind === "side") && (
                  <button
                    onClick={() =>
                      dispatch({
                        type: "RANDOM_TURN",
                        now: Date.now(),
                        random: Math.random(),
                      })
                    }
                    disabled={kind === "done" || tossPending || !poolValid}
                    className={btn}
                  >
                    Randomize current turn
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Both teams absent</h3>
                <p className="text-sm text-[#6b7a88]">
                  The first three maps of the pool (five in BO5) are played in
                  alphabetical order and the sides are randomized. This rule
                  covers BO3 and BO5 only, and it can be used before the veto
                  starts.
                </p>
                <button
                  onClick={() =>
                    dispatch({
                      type: "BOTH_ABSENT",
                      now: Date.now(),
                      sides: Array.from({ length: 5 }, () =>
                        Math.random() < 0.5 ? "A" : "B"
                      ),
                    })
                  }
                  disabled={
                    step !== 0 ||
                    tossPending ||
                    !poolValid ||
                    !["BO3", "BO5", "BO5_GF"].includes(format)
                  }
                  className={btn}
                >
                  Set alphabetical series
                </button>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}