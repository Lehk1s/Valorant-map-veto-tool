# Valorant Map Veto Tool

A web-based tool for Valorant tournament map vetoes.
Supports BO1, BO3, and BO5 formats with coin toss, auto-decider, side picks, and full veto logs.

Perfect for tournament organizers, casters, and observers.

---

## Features

* BO1, BO3, and BO5 map selection formats
* Coin toss to decide veto order (or manual seed order)
* Auto-decider for last remaining map
* Side pick tracking
* Undo last action
* Full map list with individual map selection
* Preset map pools (competitive pool, all maps) and custom maps
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

1. Enter team names (optional, defaults to Team A and Team B).
   Team A vetoes first: the higher seed, or the team chosen by the coin toss.
2. Optionally flip the coin. The winner chooses to veto first or second.
   Use Swap A / B to change the order manually.
3. Select format (BO1, BO3, BO5 Grand Final).
4. Choose the map pool: use the competitive pool preset, select all maps, or pick maps one by one. The pool needs exactly 7 maps.
5. Click maps to ban or pick, follow prompts for side selections.
6. See the veto log and final series order update in real-time.
7. Use Undo to revert the last action, or Reset to start over.
8. Copy the link to share the current veto, or copy the results as text.

The map pool and team names can only be changed before the veto starts.

---

## Map Images

Map images are stored in public/maps/ as .webp files named after the map in lowercase (for example abyss.webp, ascent.webp). If an image is missing, the map is shown as a text-only card.

---

## Tech Stack

React, Vite, Tailwind CSS

---

## Future Roadmap

* Spectator / OBS overlay mode
* Live sync with roles (admin, team captains, spectators) for remote and LAN use
* Discord-formatted results export (text / PNG)
* Turn timer with auto-pick
* Support for other games