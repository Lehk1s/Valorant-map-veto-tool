# Valorant Map Veto Tool

A web-based tool for Valorant tournament map vetoes.
Supports BO1, BO3, and BO5 formats with auto-decider, side picks, and full veto logs.

Perfect for tournament organizers, casters, and observers.

---

## Features

* BO1, BO3, and BO5 map selection formats
* Auto-decider for last remaining map
* Side pick tracking
* Undo last action
* Custom map pool
* Veto log and final series order display

---

## Installation

1. Clone the repository:
   git clone [https://github.com/Lehk1s/Valorant-map-veto-tool.git](https://github.com/Lehk1s/Valorant-map-veto-tool.git)
   cd Valorant-map-veto-tool

2. Install dependencies:
   npm install

3. Run the development server:
   npm run dev

Open your browser at [http://localhost:5173](http://localhost:5173) (or the URL shown in the terminal).

---

## Usage

1. Enter team names.
2. Select format (BO1, BO3, BO5 Grand Final).
3. Click maps to ban or pick, follow prompts for side selections.
4. See the veto log and final series order update in real-time.
5. Add custom maps if needed.
6. Use Undo to revert last action.

---

## Future Roadmap

* Shareable URL state for live streaming and collaboration
* Spectator / OBS overlay mode
* Export veto log (text / PNG)
* Coin toss / seed logic
* Preset map pools
* Live sync for remote teams
