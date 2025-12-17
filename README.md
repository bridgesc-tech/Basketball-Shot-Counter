# Basketball Shot Counter

Track player shooting statistics during basketball games with an interactive court diagram.

## Features

- **Interactive Court View**: Click anywhere on the half-court diagram to record shots
- **Player Management**: Add players by number and track individual statistics
- **Shot Tracking**: Record made/missed shots as 2-point, 3-point, or free throws
- **Visual Shot Markers**: See all shots on the court with player numbers
- **Detailed Statistics**: View comprehensive stats for each player including:
  - Total shots, made, missed
  - Field goal percentage
  - Points scored
  - Breakdown by shot type (2pt, 3pt, free throws)
- **Multi-Device Sync**: Sync data across devices using Firebase (optional)
- **Game Management**: Save game names and share game codes

## Usage

1. **Add Players**: Enter player numbers and click "Add"
2. **Record Shots**: 
   - Switch to "Court View"
   - Click anywhere on the court where a shot was taken
   - Select the player number
   - Choose shot result (Made/Missed) and type (2pt/3pt/Free Throw)
   - Click "Record Shot"
3. **View Statistics**: 
   - Click "View Stats" on any player card for detailed stats
   - Click "View All Stats" to see all players at once
4. **Game Sync** (optional):
   - Click the sync button (🔗) in the bottom right
   - Share the 6-digit game code with other devices
   - Enter a game code to connect to the same game

## Running the App

**No server needed!** You can open the app directly:

1. **Easy way**: Double-click `open-app.bat` - it will open the app in your browser
2. **Direct way**: Double-click `index.html` to open it in your default browser
3. **Manual way**: Right-click `index.html` → Open With → Choose your browser

The app works completely offline and saves all data locally in your browser.

> Note: If you want Firebase sync across devices, you can optionally use `run-local-server.bat` to run a local server, but it's not required - the app works perfectly when opened directly as a file.

## Firebase Setup (Optional - Requires Local Server)

For multi-device sync, you'll need to run a local server (`run-local-server.bat`) because Firebase requires HTTP/HTTPS protocol:
1. Run `run-local-server.bat` to start a local server
2. Open `http://localhost:8000` in your browser
3. Create a Firebase project at https://firebase.google.com
4. Enable Firestore Database
5. Update `firebase-config.js` with your Firebase credentials
6. The app will automatically sync data across devices

> **Important**: Firebase sync only works when running on a server (HTTP/HTTPS). If you open the file directly, the app works perfectly but won't sync - all data is stored locally in your browser.

## Browser Compatibility

Works best on modern browsers (Chrome, Firefox, Safari, Edge). Optimized for mobile devices and tablets.

## Notes

- Shot markers on the court show:
  - Green circles = Made shots
  - Red circles = Missed shots
  - Gold border = 3-point shots
  - Player numbers are displayed on each marker
- All data is stored locally in browser storage
- Works offline without Firebase configuration
