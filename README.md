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

1. Enter team names.
2. Select format (BO1, BO3, BO5 Grand Final).
3. Choose the map pool: use the competitive pool preset, select all maps, or pick maps one by one. The pool needs exactly 7 maps.
4. Click maps to ban or pick, follow prompts for side selections.
5. See the veto log and final series order update in real-time.
6. Use Undo to revert the last action, or Reset to start over.
7. Copy the link to share the current veto, or copy the results as text.

The map pool and team names can only be changed before the veto starts.

---

## Tech Stack

React, Vite, Tailwind CSS

---

## Future Roadmap

* Spectator / OBS overlay mode
* Discord-formatted results export (text / PNG)
* Turn timer with auto-pick
* Coin toss / seed logic
* Live sync for remote teams