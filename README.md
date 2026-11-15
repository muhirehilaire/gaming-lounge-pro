# ArenaX Gaming Lounge — Multi-Location Booking & Management Platform (v2)

## Updates Included
- **Browser Tab Thumbnail (`public/favicon.svg`)**: Custom neon esports controller icon displayed in all browser tabs.
- **Interactive Location Buttons**: Clients can click any of the 8 branch buttons (`NYAMIRAMBO`, `NYAMATA`, `NYARUTARAMA`, `KIMIRONKO`, `REMERA`, `KICUKIRO`, `MUSANZE`, `KAYONZA`) directly on the landing page to pre-select their branch on the go before signing in.
- **Fixed Navigation & Form Buttons**: Replaced anchor `#` links with clean button handlers so form switching and submissions never get stuck on `localhost:3000/#`.

## How to Run
1. Stop any older Node server running in VS Code terminal (`Ctrl + C`).
2. Extract this folder, open it in VS Code, and run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000` (hard-refresh with `Ctrl + Shift + R` if your browser cached the earlier version).
