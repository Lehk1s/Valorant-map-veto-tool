import { useState, useEffect } from "react";

const DEFAULT_MAPS = [
  "Abyss",
  "Breeze",
  "Bind",
  "Corrode",
  "Haven",
  "Pearl",
  "Split",
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
  BO5: [
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

export default function ValorantVetoTool() {
  const [teamA, setTeamA] = useState("Team A");
  const [teamB, setTeamB] = useState("Team B");
  const [upperBracket, setUpperBracket] = useState("Team A");
  const [maps, setMaps] = useState(DEFAULT_MAPS);
  const [remaining, setRemaining] = useState(DEFAULT_MAPS);
  const [picked, setPicked] = useState([]);
  const [log, setLog] = useState([]);
  const [format, setFormat] = useState("BO1");
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState([]);

  const currentAction = FORMATS[format][step];

  const actor = () => {
    if (!currentAction) return null;
    if (currentAction.startsWith("A")) return teamA;
    if (currentAction.startsWith("B")) return teamB;
    if (currentAction === "UB_ban") return upperBracket;
    return null;
  };

  const actionLabel = () => {
    if (!currentAction) return "Done";
    if (currentAction.includes("ban")) return "Ban";
    if (currentAction.includes("pick")) return "Pick";
    if (currentAction.includes("side")) return "Pick Side";
    if (currentAction === "decider") return "Decider";
  };

  const actionVerb = () => {
    if (!currentAction) return "";
    if (currentAction.includes("ban")) return "banned";
    if (currentAction.includes("pick")) return "picked";
    if (currentAction.includes("side")) return "picked side";
    if (currentAction === "decider") return "decider";
  };

  const saveHistory = () => {
    setHistory([...history, { remaining, picked, log, step }]);
  };

  const handleMapClick = (map) => {
    if (!currentAction || currentAction.includes("side") || currentAction === "decider") return;

    saveHistory();

    let newRemaining = remaining.filter((m) => m !== map);
    let newPicked = [...picked];

    if (currentAction.includes("pick")) {
      newPicked.push({ map, side: null, sideBy: null });
    }

    let entry = `${actor()} ${actionVerb()} ${map}`;

    setRemaining(newRemaining);
    setPicked(newPicked);
    setLog([...log, entry]);
    setStep(step + 1);
  };

  const handleSidePick = (side) => {
    saveHistory();

    let newPicked = [...picked];
    const lastMap = newPicked[newPicked.length - 1].map;

    newPicked[newPicked.length - 1] = {
      ...newPicked[newPicked.length - 1],
      side,
      sideBy: actor(),
    };

    let entry = `${actor()} picked ${side} side on ${lastMap}`;

    setPicked(newPicked);
    setLog([...log, entry]);
    setStep(step + 1);
  };

  // AUTO DECIDER
  useEffect(() => {
    if (currentAction === "decider" && remaining.length === 1) {
      const map = remaining[0];

      saveHistory();

      setPicked([...picked, { map, side: null, sideBy: null }]);
      setRemaining([]);
      setLog([...log, `Decider map: ${map} (left over)`]);
      setStep(step + 1);
    }
  }, [currentAction, remaining]);

  const undo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setRemaining(last.remaining);
    setPicked(last.picked);
    setLog(last.log);
    setStep(last.step);
    setHistory(history.slice(0, -1));
  };

  const reset = () => {
    setRemaining(maps);
    setPicked([]);
    setLog([]);
    setStep(0);
    setHistory([]);
  };

  const addMap = (name) => {
    if (!maps.includes(name) && name.trim() !== "") {
      const newPool = [...maps, name];
      setMaps(newPool);
      setRemaining(newPool);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Valorant Tournament Veto Tool</h1>

      <div className="grid grid-cols-2 gap-2">
        <input value={teamA} onChange={(e) => setTeamA(e.target.value)} className="border p-2 rounded" />
        <input value={teamB} onChange={(e) => setTeamB(e.target.value)} className="border p-2 rounded" />
      </div>

      <div className="flex gap-2">
        <select value={format} onChange={(e) => reset() || setFormat(e.target.value)} className="border p-2 rounded">
          <option value="BO1">BO1</option>
          <option value="BO3">BO3</option>
          <option value="BO5">BO5 Grand Final</option>
        </select>

        {format === "BO5" && (
          <select value={upperBracket} onChange={(e) => setUpperBracket(e.target.value)} className="border p-2 rounded">
            <option>{teamA}</option>
            <option>{teamB}</option>
          </select>
        )}

        <button onClick={undo} className="border px-3 rounded">Undo</button>
      </div>

      <div className="font-semibold">
        Current: {actor() || "Complete"} - {actionLabel()}
      </div>

      {currentAction?.includes("side") && (
        <div className="flex gap-2">
          <button onClick={() => handleSidePick("Attack")} className="border p-2 rounded">Attack</button>
          <button onClick={() => handleSidePick("Defense")} className="border p-2 rounded">Defense</button>
        </div>
      )}

      {!currentAction?.includes("side") && currentAction !== "decider" && (
        <div className="grid grid-cols-3 gap-2">
          {remaining.map((map) => (
            <button key={map} onClick={() => handleMapClick(map)} className="border p-2 rounded">
              {map}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="font-semibold">Final Series Order</h2>
          {picked.map((p, i) => (
            <div key={i}>
              Map {i + 1}: {p.map} {p.side && `(Side: ${p.side} by ${p.sideBy})`}
            </div>
          ))}
        </div>

        <div>
          <h2 className="font-semibold">Veto Log</h2>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>

      <button onClick={reset} className="bg-black text-white px-4 py-2 rounded">Reset</button>

      <div className="pt-4">
        <h2 className="font-semibold">Custom Map Pool</h2>
        <input
          placeholder="Add map name"
          className="border p-2 rounded"
          onKeyDown={(e) => e.key === "Enter" && addMap(e.target.value)}
        />
      </div>
    </div>
  );
}
