# Valorant Map Veto Tool

A web-based tool for Valorant tournament map vetoes.
Supports BO1, BO3, BO5, and BO5 Grand Final formats with coin toss, turn timer, auto-decider, side picks, and full veto logs.

Perfect for tournament organizers, casters, and observers.

---

## Features

* BO1, BO3, BO5, and BO5 Grand Final map selection formats, following the VCT veto procedures
* Coin toss to decide Team A (toss assigns Team A, or winner chooses veto order)
* Upper bracket selection for Grand Finals
* Optional 60-second turn timer with randomized auto-pick when time runs out
* Auto-decider for last remaining map
* Side pick tracking
* Undo last action
* Full map list with individual map selection
* Preset map pools (current competitive pool, all maps) and custom maps
* Map pool validation per format (exactly 7 maps)
* Map images on cards, with banned and picked maps shown visually
* Veto log and final series order display
* Shareable URL (full veto state in link)
* Copy link and copy results buttons

---

## Installation

1. Clone the repository:
   git clone https://github.com/Lehk1s/Valorant-map-veto-tool.git
   cd Valorant-map-veto-tool

2. Install dependencies:
   npm install

3. Run the development server:
   npm run dev

Open your browser at http://localhost:5173 (or the URL shown in the terminal).

---

## Usage

1. Select the format (BO1, BO3, BO5, or BO5 Grand Final) and, if you want it, turn on the 60-second turn timer.
2. Enter team names (optional, defaults to Team A and Team B).
   Team A vetoes first: the higher seed, or the team decided by the coin toss.
3. Decide Team A and Team B:
   * Coin toss: choose the method, then flip the coin. The toss either assigns Team A directly or the winner chooses to veto first or second.
   * Seeding: skip the toss and use Swap A / B if the better seed should be Team A.
   * Grand Final: the upper bracket team bans two maps and chooses whether it is Team A or Team B. Enter it in the matching field and select it as the upper bracket team. The coin toss is hidden in this format.
4. Check the map pool (collapsible section): use the competitive pool preset, select all maps, or pick maps one by one. The pool needs exactly 7 maps.
5. If the timer is on, press Start veto. Otherwise just click a map.
6. Click maps to ban or pick, and follow the prompts for side selections.
   With the timer on, each ban or pick has 60 seconds. If time runs out, a random map is chosen. Side picks are not timed.
7. See the veto log and final series order update in real-time.
8. Use Undo to revert the last action, or Reset to start over.
9. Copy the link to share the current veto, or copy the results as text.

The map pool, team names, coin toss, and timer setting can only be changed before the veto starts.

### Current competitive pool

Abyss, Bind, Corrode, Haven, Lotus, Summit, Sunset

---

## Map Images

Map images are stored in public/maps/ as .webp files named after the map in lowercase (for example abyss.webp, bind.webp). If an image is missing, the map is shown as a text-only card.

---

## Tech Stack

React, Vite, Tailwind CSS

---

## Future Roadmap

* Spectator / OBS overlay mode
* Live sync with roles (admin, team captains, spectators) for remote and LAN use
* Admin tools for late or no-show teams (randomize choices)
* Rules presets for different tournaments
* Discord-formatted results export (text / PNG)
* Support for other games