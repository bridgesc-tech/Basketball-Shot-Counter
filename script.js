// Basketball Shot Counter Application
class BasketballShotCounter {
    constructor() {
        this.homePlayers = [];
        this.awayPlayers = [];
        this.currentTeam = 'home'; // 'home' or 'away'
        this.firebaseEnabled = false;
        this.gameId = this.getOrCreateGameId();
        this.gameName = this.loadGameName();
        
        // Current shot tracking state
        this.currentPlayerId = null;
        this.currentShotId = null; // For shot details modal
        this.selectedShotResult = null;
        this.selectedShotType = null;
        this.pendingShotPosition = null;
        this.currentPeriod = 1; // Default to period 1
        this.selectedPlayerFilter = null; // null = all players, otherwise player ID
        this.resultTypeFilters = {
            'made': true,
            'missed': true
        };
        
        // Shot types (no free throws)
        this.shotTypes = ['2pt', '3pt'];
        
        // Current view (court or players)
        this.currentView = 'court';
        
        // Wait for Firebase scripts to load, then initialize
        this.waitForFirebase(() => {
            this.initializeFirebase();
            this.loadPlayers().then(() => {
                this.initializeApp();
            }).catch(error => {
                console.error('Error loading players:', error);
                this.initializeApp();
            });
        });
    }
    
    // Getter for current team's players
    get players() {
        return this.currentTeam === 'home' ? this.homePlayers : this.awayPlayers;
    }
    
    // Setter for current team's players
    set players(value) {
        if (this.currentTeam === 'home') {
            this.homePlayers = value;
        } else {
            this.awayPlayers = value;
        }
    }

    waitForFirebase(callback, attempts = 0) {
        const maxAttempts = 20;
        if (typeof firebase !== 'undefined' || attempts >= maxAttempts) {
            callback();
        } else {
            setTimeout(() => {
                this.waitForFirebase(callback, attempts + 1);
            }, 100);
        }
    }

    // Get or create a unique 6-digit game ID for syncing
    getOrCreateGameId() {
        let gameId = localStorage.getItem('basketballShotCounterGameId');
        if (!gameId) {
            // Generate a 6-digit numeric code
            gameId = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('basketballShotCounterGameId', gameId);
        }
        return gameId;
    }

    loadGameName() {
        return localStorage.getItem('basketballShotCounterGameName') || '';
    }

    saveGameName(name) {
        this.gameName = name;
        localStorage.setItem('basketballShotCounterGameName', name);
        if (this.firebaseEnabled) {
            db.collection('basketballShotCounterGames').doc(this.gameId).set({
                gameName: name,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        this.updateGameNameDisplay();
    }

    // Initialize Firebase connection
    initializeFirebase() {
        const checkFirebase = () => {
            if (typeof window !== 'undefined' && typeof db !== 'undefined' && db !== null) {
                this.firebaseEnabled = true;
                console.log('Firebase sync enabled for game:', this.gameId);
                
                // Listen for real-time updates from other devices
                db.collection('basketballShotCounterGames').doc(this.gameId)
                    .onSnapshot((docSnapshot) => {
                        if (docSnapshot.exists) {
                            const data = docSnapshot.data();
                            if (data.gameName) {
                                this.gameName = data.gameName;
                                localStorage.setItem('basketballShotCounterGameName', this.gameName);
                                this.updateGameNameDisplay();
                            }
                            // Support both old format (players) and new format (homePlayers/awayPlayers)
                            if (data.homePlayers && data.awayPlayers) {
                                this.homePlayers = data.homePlayers || [];
                                this.awayPlayers = data.awayPlayers || [];
                                this.saveToLocalStorage();
                                this.renderPlayers();
                                this.renderFoulsView();
                                this.renderPlayerFilter();
                                this.renderCourt();
                                console.log('Synced from cloud');
                            } else if (data.players) {
                                // Old format - migrate to home team
                                this.homePlayers = data.players || [];
                                this.awayPlayers = [];
                                this.saveToLocalStorage();
                                this.renderPlayers();
                                this.renderPlayerFilter();
                                this.renderCourt();
                                console.log('Synced from cloud');
                            }
                        }
                    }, (error) => {
                        console.error('Firebase sync error:', error);
                    });
                
                this.updateSyncStatus();
                return true;
            }
            return false;
        };
        
        if (!checkFirebase()) {
            setTimeout(() => {
                if (!checkFirebase()) {
                    console.log('Firebase not configured - running in local-only mode');
                    this.updateSyncStatus();
                }
            }, 500);
        }
    }

    async loadPlayers() {
        if (this.firebaseEnabled) {
            try {
                const docSnapshot = await db.collection('basketballShotCounterGames').doc(this.gameId).get();
                if (docSnapshot.exists) {
                    const data = docSnapshot.data();
                    // Support both old format (players) and new format (homePlayers/awayPlayers)
                    if (data.homePlayers && data.awayPlayers) {
                        this.homePlayers = data.homePlayers || [];
                        this.awayPlayers = data.awayPlayers || [];
                    } else if (data.players) {
                        // Old format - migrate to home team
                        this.homePlayers = data.players || [];
                        this.awayPlayers = [];
                    }
                    this.saveToLocalStorage();
                    if (data.gameName) {
                        this.gameName = data.gameName;
                        localStorage.setItem('basketballShotCounterGameName', this.gameName);
                        this.updateGameNameDisplay();
                    }
                    return this.players;
                }
            } catch (error) {
                console.error('Error loading from Firebase:', error);
            }
        }
        
        // Load both teams from localStorage
        const storedHome = localStorage.getItem('basketballShotCounterHomePlayers');
        this.homePlayers = storedHome ? JSON.parse(storedHome) : [];
        
        const storedAway = localStorage.getItem('basketballShotCounterAwayPlayers');
        this.awayPlayers = storedAway ? JSON.parse(storedAway) : [];
        
        // Also try to load from old format for backward compatibility
        const oldStored = localStorage.getItem('basketballShotCounterPlayers');
        if (oldStored && this.homePlayers.length === 0) {
            this.homePlayers = JSON.parse(oldStored);
            this.savePlayers();
        }
        
        return this.players;
    }

    savePlayers() {
        this.saveToLocalStorage();
        
        if (this.firebaseEnabled) {
            db.collection('basketballShotCounterGames').doc(this.gameId).set({
                homePlayers: this.homePlayers,
                awayPlayers: this.awayPlayers,
                gameName: this.gameName,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .then(() => {
                console.log('Synced to cloud');
            })
            .catch((error) => {
                console.error('Error syncing to Firebase:', error);
            });
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('basketballShotCounterHomePlayers', JSON.stringify(this.homePlayers));
        localStorage.setItem('basketballShotCounterAwayPlayers', JSON.stringify(this.awayPlayers));
    }
    
    switchTeam() {
        this.currentTeam = this.currentTeam === 'home' ? 'away' : 'home';
        this.updateTeamButton();
        // Reset filter when switching teams
        this.selectedPlayerFilter = null;
        // Refresh all views
        this.renderPlayers();
        this.renderFoulsView();
        this.renderPlayerFilter();
        this.renderCourt();
    }
    
    updateTeamButton() {
        const btn = document.getElementById('teamSwitchBtn');
        if (btn) {
            if (this.currentTeam === 'home') {
                btn.textContent = 'Home Team';
                btn.classList.remove('active-away');
            } else {
                btn.textContent = 'Away Team';
                btn.classList.add('active-away');
            }
        }
    }

    initializeApp() {
        // Initialize period 1 as active
        if (document.getElementById('period1Btn')) {
            document.getElementById('period1Btn').classList.add('active');
        }
        
        // Setup filters
        this.setupPlayerFilter();
        this.setupResultTypeFilter();
        
        // Initialize team button
        this.updateTeamButton();
        
        // Service worker registration is now handled by UpdateManager

        this.updateSyncStatus();
        this.updateGameNameDisplay();
        this.setupGameIdUI();

        // View toggle buttons
        document.getElementById('courtViewBtn').addEventListener('click', () => this.switchView('court'));
        document.getElementById('playersViewBtn').addEventListener('click', () => this.switchView('players'));
        document.getElementById('foulsViewBtn').addEventListener('click', () => this.switchView('fouls'));
        document.getElementById('statsViewBtn').addEventListener('click', () => this.switchView('stats'));
        
        // Period selection buttons
        document.getElementById('period1Btn').addEventListener('click', () => this.selectPeriod(1));
        document.getElementById('period2Btn').addEventListener('click', () => this.selectPeriod(2));
        document.getElementById('period3Btn').addEventListener('click', () => this.selectPeriod(3));
        document.getElementById('period4Btn').addEventListener('click', () => this.selectPeriod(4));
        
        // Team switch button
        document.getElementById('teamSwitchBtn').addEventListener('click', () => this.switchTeam());

        // Add player button
        document.getElementById('addPlayerBtn').addEventListener('click', () => this.addPlayer());
        document.getElementById('playerNumberInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPlayer();
        });
        document.getElementById('playerNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('playerNumberInput').focus();
            }
        });
        
        // Limit number input to 2 digits max
        document.getElementById('playerNumberInput').addEventListener('input', (e) => {
            const value = e.target.value;
            if (value.length > 2) {
                e.target.value = value.slice(0, 2);
            }
        });
        
        // Court controls
        document.getElementById('clearCourtBtn').addEventListener('click', () => this.clearAllShots());
        document.getElementById('viewStatsBtn').addEventListener('click', () => this.openAllStatsModal());
        document.getElementById('exportStatsBtn').addEventListener('click', () => this.exportStatsReport());

        // Modal close buttons
        document.getElementById('closeModal').addEventListener('click', () => this.closeShotModal());
        document.getElementById('closeStatsModal').addEventListener('click', () => this.closeStatsModal());
        document.getElementById('closeAllStatsModal').addEventListener('click', () => this.closeAllStatsModal());
        document.getElementById('closeShotDetailsModal').addEventListener('click', () => this.closeShotDetailsModal());
        
        // Delete shot button
        document.getElementById('deleteShotBtn').addEventListener('click', () => this.deleteCurrentShot());

        // Shot result buttons
        document.querySelectorAll('.shot-result-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectShotResult(e.target.dataset.result);
            });
        });

        // Shot type is now automatically detected - no buttons needed


        // Delete player button
        document.getElementById('deletePlayerBtn').addEventListener('click', () => this.deleteCurrentPlayer());

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            const shotModal = document.getElementById('shotModal');
            const statsModal = document.getElementById('statsModal');
            const allStatsModal = document.getElementById('allStatsModal');
            const gameModal = document.getElementById('gameModal');
            const shotDetailsModal = document.getElementById('shotDetailsModal');
            if (e.target === shotModal) {
                this.closeShotModal();
            }
            if (e.target === statsModal) {
                this.closeStatsModal();
            }
            if (e.target === allStatsModal) {
                this.closeAllStatsModal();
            }
            if (e.target === gameModal) {
                this.closeGameModal();
            }
            if (e.target === shotDetailsModal) {
                this.closeShotDetailsModal();
            }
        });

        // Game Sync Modal button
        document.getElementById('openGameModalBtn').addEventListener('click', () => {
            this.openGameModal();
        });
        document.getElementById('closeGameModal').addEventListener('click', () => {
            this.closeGameModal();
        });

        // Save game name button
        document.getElementById('saveGameNameBtn').addEventListener('click', () => {
            this.saveGameNameInput();
        });

        // Enter key in game name input
        document.getElementById('gameNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveGameNameInput();
            }
        });

        // Create new game button
        document.getElementById('createNewGameBtn').addEventListener('click', () => {
            this.createNewGame();
        });

        // Setup court interaction
        this.setupCourtInteraction();

        this.renderPlayers();
        this.renderPlayerFilter();
        this.renderCourt();
    }

    setupCourtInteraction() {
        const court = document.getElementById('basketballCourt');
        const courtWrapper = document.querySelector('.court-wrapper');
        
        // Handle clicks on the court
        court.addEventListener('click', (e) => {
            if (this.players.length === 0) {
                alert('Please add at least one player first!');
                return;
            }

            // Get click position relative to SVG element
            const rect = court.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;
            
            // Get SVG viewBox dimensions
            const viewBox = court.viewBox.baseVal;
            const svgWidth = viewBox.width || court.width.baseVal.value || 500;
            const svgHeight = viewBox.height || court.height.baseVal.value || 470;
            
            // Get actual rendered size
            const renderedWidth = rect.width;
            const renderedHeight = rect.height;
            
            // Calculate scale factors
            const scaleX = svgWidth / renderedWidth;
            const scaleY = svgHeight / renderedHeight;
            
            // Convert to SVG coordinates
            const svgX = clientX * scaleX;
            const svgY = clientY * scaleY;
            

            // Store position and show player selection
            this.pendingShotPosition = { x: svgX, y: svgY, clientX: clientX, clientY: clientY };
            this.showPlayerSelect(clientX, clientY);
        });

        // Handle touch events for mobile
        court.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.players.length === 0) {
                alert('Please add at least one player first!');
                return;
            }

            const rect = court.getBoundingClientRect();
            const touch = e.changedTouches[0];
            const clientX = touch.clientX - rect.left;
            const clientY = touch.clientY - rect.top;
            
            // Get SVG viewBox dimensions
            const viewBox = court.viewBox.baseVal;
            const svgWidth = viewBox.width || court.width.baseVal.value || 500;
            const svgHeight = viewBox.height || court.height.baseVal.value || 470;
            
            // Get actual rendered size
            const renderedWidth = rect.width;
            const renderedHeight = rect.height;
            
            // Calculate scale factors
            const scaleX = svgWidth / renderedWidth;
            const scaleY = svgHeight / renderedHeight;
            
            // Convert to SVG coordinates
            const svgX = clientX * scaleX;
            const svgY = clientY * scaleY;

            this.pendingShotPosition = { x: svgX, y: svgY, clientX: clientX, clientY: clientY };
            this.showPlayerSelect(clientX, clientY);
        });
    }

    showPlayerSelect(x, y) {
        const overlay = document.getElementById('playerSelectOverlay');
        const list = document.getElementById('playerSelectList');
        
        list.innerHTML = '';
        this.players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-select-item';
            item.textContent = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
            item.addEventListener('click', () => {
                this.selectPlayerForShot(player.id);
            });
            list.appendChild(item);
        });
        
        overlay.style.display = 'flex';
    }

    closePlayerSelect(clearPosition = false) {
        document.getElementById('playerSelectOverlay').style.display = 'none';
        // Only clear position if explicitly requested (e.g., Cancel button)
        if (clearPosition) {
            this.pendingShotPosition = null;
        }
    }

    selectPlayerForShot(playerId) {
        this.currentPlayerId = playerId;
        this.closePlayerSelect(); // Don't clear position - we need it for the modal
        this.openShotModal();
    }

    switchView(view) {
        this.currentView = view;
        const courtView = document.getElementById('courtView');
        const playersView = document.getElementById('playersView');
        const foulsView = document.getElementById('foulsView');
        const statsView = document.getElementById('statsView');
        const courtBtn = document.getElementById('courtViewBtn');
        const playersBtn = document.getElementById('playersViewBtn');
        const foulsBtn = document.getElementById('foulsViewBtn');
        const statsBtn = document.getElementById('statsViewBtn');

        // Hide all views and remove active from all buttons
        courtView.style.display = 'none';
        playersView.style.display = 'none';
        foulsView.style.display = 'none';
        statsView.style.display = 'none';
        courtBtn.classList.remove('active');
        playersBtn.classList.remove('active');
        foulsBtn.classList.remove('active');
        statsBtn.classList.remove('active');

        if (view === 'court') {
            courtView.style.display = 'block';
            courtBtn.classList.add('active');
            this.renderPlayerFilter();
            this.renderCourt();
        } else if (view === 'players') {
            playersView.style.display = 'block';
            playersBtn.classList.add('active');
        } else if (view === 'fouls') {
            foulsView.style.display = 'block';
            foulsBtn.classList.add('active');
            this.renderFoulsView();
        } else if (view === 'stats') {
            statsView.style.display = 'block';
            statsBtn.classList.add('active');
            this.renderStats();
        }
    }

    addPlayer() {
        const nameInput = document.getElementById('playerNameInput');
        const numberInput = document.getElementById('playerNumberInput');
        const name = nameInput.value.trim();
        const number = parseInt(numberInput.value.trim());
        
        if (number === null || number === undefined || number < 0 || number > 99) {
            alert('Please enter a valid player number (0-99)');
            return;
        }
        
        if (this.players.some(player => player.number === number)) {
            alert('Player #' + number + ' already exists');
            numberInput.value = '';
            return;
        }
        
        const newPlayer = {
            id: Date.now().toString(),
            name: name || '', // Name is optional
            number: number,
            shots: [],
            fouls: 0,
            createdAt: new Date().toISOString()
        };

        this.players.push(newPlayer);
        this.savePlayers();
        nameInput.value = '';
        numberInput.value = '';
        this.renderPlayers();
        this.renderPlayerFilter();
    }

    deletePlayer(playerId) {
        if (confirm('Are you sure you want to remove this player and all their shot data?')) {
            this.players = this.players.filter(player => player.id !== playerId);
            // Reset filter if deleted player was selected
            if (this.selectedPlayerFilter === playerId) {
                this.selectedPlayerFilter = null;
            }
            this.savePlayers();
            this.renderPlayers();
            this.renderPlayerFilter();
            this.renderCourt();
        }
    }

    deleteCurrentPlayer() {
        if (this.currentPlayerId) {
            this.deletePlayer(this.currentPlayerId);
            this.closeStatsModal();
        }
    }

    // Detect if shot is 2pt or 3pt based on position
    detectShotType(x, y) {
        // Three-point line is: M 50 0 C 100 270, 400 270, 450 0
        // This is a cubic bezier curve from baseline corners (50,0) and (450,0) 
        // curving downward with control points at (100,270) and (400,270)
        // P0=(50,0), P1=(100,270), P2=(400,270), P3=(450,0)
        
        // If shot is outside the three-point line boundaries horizontally, it's definitely 3pt
        if (x < 50 || x > 450) {
            return '3pt';
        }
        
        // Key area (free-throw lane) is always 2pt (x: 200-300, y: 0-120)
        if (x >= 200 && x <= 300 && y <= 120) {
            return '2pt';
        }
        
        // Calculate the y-coordinate of the three-point arc at this x position
        // Using cubic bezier formula: B(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
        
        // For x: x(t) = 50*(1-t)^3 + 3*100*(1-t)^2*t + 3*400*(1-t)*t^2 + 450*t^3
        //        x(t) = 50*(1-t)^3 + 300*(1-t)^2*t + 1200*(1-t)*t^2 + 450*t^3
        // For y: y(t) = 0*(1-t)^3 + 3*270*(1-t)^2*t + 3*270*(1-t)*t^2 + 0*t^3
        //        y(t) = 810*(1-t)^2*t + 810*(1-t)*t^2 = 810*t*(1-t)
        
        // Find t that gives us the x coordinate using binary search for better accuracy
        let tLow = 0;
        let tHigh = 1;
        let t = 0.5;
        
        // Binary search to find t that gives us the correct x
        for (let i = 0; i < 20; i++) {
            const t1 = 1 - t;
            const xAtT = 50 * t1 * t1 * t1 + 
                        300 * t1 * t1 * t + 
                        1200 * t1 * t * t + 
                        450 * t * t * t;
            
            if (Math.abs(xAtT - x) < 0.01) break; // Close enough
            
            if (xAtT < x) {
                tLow = t;
            } else {
                tHigh = t;
            }
            t = (tLow + tHigh) / 2;
        }
        
        // Calculate y at this t value using the full bezier formula
        const t1 = 1 - t;
        const arcY = 810 * t1 * t1 * t + 810 * t1 * t * t;
        
        // Coordinate system: y=0 is baseline (top), y increases downward
        // The three-point arc curves downward from the baseline
        // Points INSIDE the arc (closer to baseline, smaller y values) = 2-point shots
        // Points OUTSIDE the arc (past the arc line, larger y values) = 3-point shots
        
        // If the shot's y position is ABOVE the arc (lesser y = closer to baseline),
        // it's INSIDE the arc = 2pt
        // If the shot's y position is BELOW the arc (greater y = further from baseline),
        // it's OUTSIDE the arc = 3pt
        if (y < arcY) {
            return '2pt'; // Inside the arc (above the line, closer to baseline)
        } else {
            return '3pt'; // Outside the arc (below the line, past the arc)
        }
    }

    openShotModal() {
        if (!this.pendingShotPosition) {
            return;
        }

        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;

        this.selectedShotResult = null;
        
        // Automatically detect shot type based on position
        this.selectedShotType = this.detectShotType(this.pendingShotPosition.x, this.pendingShotPosition.y);
        
        const playerDisplayName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
        document.getElementById('modalPlayerNumber').textContent = playerDisplayName;
        document.getElementById('shotModal').style.display = 'block';
        
        // Display detected shot type
        const shotTypeDisplay = document.getElementById('detectedShotType');
        if (shotTypeDisplay) {
            shotTypeDisplay.textContent = this.selectedShotType === '3pt' ? '3-Point Shot' : '2-Point Shot';
            shotTypeDisplay.style.color = this.selectedShotType === '3pt' ? '#FF6B35' : 'var(--text-primary)';
        }
        
        // Reset UI
        document.querySelectorAll('.shot-result-btn').forEach(btn => btn.classList.remove('active'));
        // recordShotBtn was removed - shots now auto-submit
        this.updateSummary();
    }

    openStatsModal(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        this.currentPlayerId = playerId;
        const playerDisplayName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
        document.getElementById('statsModalPlayerNumber').textContent = playerDisplayName;
        document.getElementById('statsModal').style.display = 'block';
        this.renderDetailedStats(player);
    }

    selectShotResult(result) {
        this.selectedShotResult = result;
        document.querySelectorAll('.shot-result-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.result === result) {
                btn.classList.add('active');
            }
        });
        // Auto-submit when result is selected
        this.recordShot();
    }

    // Shot type is now automatically detected based on position - no manual selection needed

    updateSummary() {
        // Summary display - no longer need to show/hide record button

        // Update summary stats
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (player) {
            const stats = this.calculateStats(player);
            document.getElementById('summaryStats').innerHTML = `
                <div class="stat-item">
                    <span class="stat-label">Total Shots:</span>
                    <span class="stat-value">${stats.totalShots}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Made:</span>
                    <span class="stat-value">${stats.made}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Missed:</span>
                    <span class="stat-value">${stats.missed}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">FG%:</span>
                    <span class="stat-value">${stats.totalShots > 0 ? ((stats.made / stats.totalShots) * 100).toFixed(1) : '0'}%</span>
                </div>
            `;
        }
    }

    recordShot() {
        if (!this.selectedShotResult || !this.selectedShotType || !this.pendingShotPosition) {
            return;
        }

        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) {
            return;
        }

        // Save only the SVG coordinates (x, y), not clientX/clientY
        const shot = {
            id: Date.now().toString(),
            result: this.selectedShotResult,
            type: this.selectedShotType,
            position: {
                x: this.pendingShotPosition.x,
                y: this.pendingShotPosition.y
            },
            period: this.currentPeriod,
            timestamp: new Date().toISOString()
        };

        player.shots.push(shot);
        this.savePlayers();
        this.renderPlayers();
        this.renderCourt();
        this.closeShotModal();
    }

    selectPeriod(period) {
        this.currentPeriod = period;
        // Update button styles
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(`period${period}Btn`).classList.add('active');
        // Re-render court to show only shots from this period
        this.renderCourt();
    }

    setupPlayerFilter() {
        // "All Players" button
        document.getElementById('filterAllBtn').addEventListener('click', () => {
            this.selectedPlayerFilter = null;
            document.querySelectorAll('.player-filter-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('filterAllBtn').classList.add('active');
            this.renderCourt();
        });
    }

    setupResultTypeFilter() {
        // Setup checkbox listeners
        document.querySelectorAll('.result-filter-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const resultType = checkbox.dataset.resultType;
                this.resultTypeFilters[resultType] = checkbox.checked;
                this.renderCourt();
            });
        });
    }

    renderPlayerFilter() {
        const filterBar = document.getElementById('playerFilterBar');
        if (!filterBar) return;
        
        // Remove existing player filter buttons (except "All Players")
        const allBtn = document.getElementById('filterAllBtn');
        filterBar.innerHTML = '';
        filterBar.appendChild(allBtn);
        
        // Add player filter buttons
        this.players.sort((a, b) => a.number - b.number).forEach(player => {
            const btn = document.createElement('button');
            btn.className = 'player-filter-btn';
            btn.setAttribute('data-player-id', player.id);
            btn.textContent = `#${player.number}`;
            btn.addEventListener('click', () => {
                this.selectedPlayerFilter = player.id;
                document.querySelectorAll('.player-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderCourt();
            });
            
            // Set active if this player is selected
            if (this.selectedPlayerFilter === player.id) {
                btn.classList.add('active');
                allBtn.classList.remove('active');
            }
            
            filterBar.appendChild(btn);
        });
        
        // Update "All Players" button active state
        if (this.selectedPlayerFilter === null) {
            allBtn.classList.add('active');
        }
    }

    openStatsModal(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        this.currentPlayerId = playerId;
        const playerDisplayName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
        document.getElementById('statsModalPlayerNumber').textContent = playerDisplayName;
        document.getElementById('statsModal').style.display = 'block';
        this.renderDetailedStats(player);
    }

    calculateStats(player) {
        const shots = player.shots || [];
        const totalShots = shots.length;
        const made = shots.filter(s => s.result === 'made').length;
        const missed = shots.filter(s => s.result === 'missed').length;
        
        // Count by shot type
        const shotTypeCounts = {};
        this.shotTypes.forEach(type => {
            const typeShots = shots.filter(s => s.type === type);
            shotTypeCounts[type] = {
                total: typeShots.length,
                made: typeShots.filter(s => s.result === 'made').length,
                missed: typeShots.filter(s => s.result === 'missed').length
            };
        });

        // Calculate points
        const points = shots.reduce((sum, shot) => {
            if (shot.result === 'made') {
                if (shot.type === '3pt') return sum + 3;
                if (shot.type === '2pt') return sum + 2;
            }
            return sum;
        }, 0);

        return {
            totalShots,
            made,
            missed,
            shotTypeCounts,
            points,
            fgPercentage: totalShots > 0 ? (made / totalShots) * 100 : 0
        };
    }

    renderPlayers() {
        const container = document.getElementById('playersList');
        const emptyState = document.getElementById('emptyState');

        if (this.players.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = '';

        this.players.sort((a, b) => a.number - b.number).forEach(player => {
            const stats = this.calculateStats(player);
            const card = document.createElement('div');
            card.className = 'player-card';
            
            const playerDisplayName = player.name ? `${player.name}` : `Player #${player.number}`;
            card.innerHTML = `
                <div class="player-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <div class="player-name" style="font-size: 18px; font-weight: 600; color: var(--text-primary);">${playerDisplayName}</div>
                        <div class="player-number" style="font-size: 14px; color: var(--text-secondary);">#${player.number}</div>
                    </div>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.deletePlayer('${player.id}')" aria-label="Delete player" style="background: transparent; border: none; color: var(--danger-color); font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">×</button>
                </div>
                <div class="player-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                    <div class="stat-item" style="text-align: center;">
                        <div class="stat-label" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Total Shots</div>
                        <div class="stat-value" style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${stats.totalShots}</div>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <div class="stat-label" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Made</div>
                        <div class="stat-value" style="font-size: 16px; font-weight: 700; color: var(--success-color);">${stats.made}</div>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <div class="stat-label" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">FG%</div>
                        <div class="stat-value" style="font-size: 16px; font-weight: 700; color: var(--success-color);">${stats.fgPercentage.toFixed(1)}%</div>
                    </div>
                    <div class="stat-item" style="text-align: center;">
                        <div class="stat-label" style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Points</div>
                        <div class="stat-value" style="font-size: 16px; font-weight: 700; color: var(--primary-color);">${stats.points}</div>
                    </div>
                </div>
            `;
            
            // Add click handler to entire card
            card.addEventListener('click', () => {
                this.openStatsModal(player.id);
            });

            container.appendChild(card);
        });
    }

    renderFoulsView() {
        const container = document.getElementById('foulsList');
        const emptyState = document.getElementById('foulsEmptyState');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.players.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        this.players.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.style.padding = '15px';
            
            const playerDisplayName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
            const foulCount = player.fouls || 0;
            
            card.innerHTML = `
                <div class="player-header" style="margin-bottom: 10px;">
                    <h3 style="font-size: 16px; margin: 0;">${playerDisplayName}</h3>
                </div>
                <div style="text-align: center; padding: 10px 0;">
                    <div style="font-size: 32px; font-weight: bold; color: var(--primary-color); margin-bottom: 5px;">
                        ${foulCount}
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                        ${foulCount === 1 ? 'Foul' : 'Fouls'}
                    </div>
                    <button class="btn btn-primary" onclick="app.addFoul('${player.id}')" style="width: 100%; padding: 8px; font-size: 13px;">
                        Add Foul
                    </button>
                </div>
            `;
            
            container.appendChild(card);
        });
    }

    addFoul(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;
        
        if (!player.fouls) {
            player.fouls = 0;
        }
        
        player.fouls++;
        this.savePlayers();
        this.renderFoulsView();
    }

    renderCourt() {
        const court = document.getElementById('basketballCourt');
        if (!court) {
            console.log('Court SVG not found');
            return;
        }
        
        // Remove existing shot markers (but keep the SVG structure)
        const existingMarkers = court.querySelectorAll('.shot-marker-svg');
        existingMarkers.forEach(marker => marker.remove());

        let totalShots = 0;
        
        // Filter players if a specific player is selected
        const playersToShow = this.selectedPlayerFilter 
            ? this.players.filter(p => p.id === this.selectedPlayerFilter)
            : this.players;
        
        // Add shot markers for filtered players
        playersToShow.forEach(player => {
            player.shots.forEach(shot => {
                // Only render shots from the current period
                // If shot doesn't have period property (old data), default to period 1
                const shotPeriod = shot.period !== undefined ? shot.period : 1;
                if (shotPeriod !== this.currentPeriod) {
                    return;
                }
                
                // Filter by result type
                if (!this.resultTypeFilters[shot.result]) {
                    return;
                }
                
                totalShots++;
                if (shot.position && shot.position.x !== undefined && shot.position.y !== undefined) {
                    // Use SVG coordinates (from shot.position.x and shot.position.y)
                    const x = parseFloat(shot.position.x);
                    const y = parseFloat(shot.position.y);
                    
                    // Validate coordinates are within viewBox
                    if (x < 0 || x > 500 || y < 0 || y > 470) {
                        console.warn('Coordinates out of bounds:', x, y);
                    }
                    
                    // Create circle marker - green for made, red for missed
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    circle.setAttribute('cx', x);
                    circle.setAttribute('cy', y);
                    circle.setAttribute('r', '5'); // Even smaller size
                    circle.setAttribute('fill', shot.result === 'made' ? '#27ae60' : '#e74c3c'); // Green for made, red for missed
                    circle.setAttribute('stroke', 'white');
                    circle.setAttribute('stroke-width', '1');
                    circle.setAttribute('class', 'shot-marker-svg');
                    circle.style.cursor = 'pointer';
                    
                    // Store player and shot IDs for click handling
                    circle.setAttribute('data-player-id', player.id);
                    circle.setAttribute('data-shot-id', shot.id);
                    circle.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent triggering court click
                        this.openShotDetailsModal(player.id, shot.id);
                    });
                    
                    // Add player number text in white
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', x);
                    text.setAttribute('y', y);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('dominant-baseline', 'middle');
                    text.setAttribute('fill', 'white');
                    text.setAttribute('font-size', '6');
                    text.setAttribute('font-weight', 'bold');
                    text.setAttribute('class', 'shot-marker-svg');
                    text.textContent = player.number.toString();
                    
                    // Make text clickable too
                    text.setAttribute('data-player-id', player.id);
                    text.setAttribute('data-shot-id', shot.id);
                    text.style.pointerEvents = 'all';
                    text.style.cursor = 'pointer';
                    text.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.openShotDetailsModal(player.id, shot.id);
                    });
                    
                    // Append circle first, then text on top
                    court.appendChild(circle);
                    court.appendChild(text);
                }
            });
        });
    }

    clearAllShots() {
        if (confirm('Clear all shots from the court for all players? This cannot be undone.')) {
            this.players.forEach(player => {
                player.shots = [];
            });
            this.savePlayers();
            this.renderCourt();
            this.renderPlayers();
        }
    }

    calculateDetailedPlayerStats(player) {
        if (!player.shots || player.shots.length === 0) {
            return {
                total: 0,
                made: 0,
                missed: 0,
                points: 0,
                fgPercentage: 0,
                byPeriod: {},
                byShotType: {},
                byResult: {}
            };
        }

        const stats = {
            total: player.shots.length,
            made: 0,
            missed: 0,
            points: 0,
            fgPercentage: 0,
            byPeriod: {},
            byShotType: {},
            byResult: {}
        };

        player.shots.forEach(shot => {
            const period = shot.period !== undefined ? shot.period : 1;
            
            // By period
            if (!stats.byPeriod[period]) {
                stats.byPeriod[period] = { total: 0, made: 0, missed: 0, points: 0 };
            }
            stats.byPeriod[period].total++;
            
            // By shot type
            if (!stats.byShotType[shot.type]) {
                stats.byShotType[shot.type] = { total: 0, made: 0, missed: 0, points: 0 };
            }
            stats.byShotType[shot.type].total++;
            
            // By result
            if (!stats.byResult[shot.result]) {
                stats.byResult[shot.result] = 0;
            }
            stats.byResult[shot.result]++;
            
            // Count made/missed and points
            if (shot.result === 'made') {
                stats.made++;
                stats.byPeriod[period].made++;
                stats.byShotType[shot.type].made++;
                const points = shot.type === '3pt' ? 3 : 2;
                stats.points += points;
                stats.byPeriod[period].points += points;
                stats.byShotType[shot.type].points += points;
            } else {
                stats.missed++;
                stats.byPeriod[period].missed++;
                stats.byShotType[shot.type].missed++;
            }
        });

        stats.fgPercentage = stats.total > 0 ? Math.round((stats.made / stats.total) * 100) : 0;

        // Calculate FG% for periods and shot types
        Object.keys(stats.byPeriod).forEach(period => {
            const periodStats = stats.byPeriod[period];
            periodStats.fgPercentage = periodStats.total > 0 ? Math.round((periodStats.made / periodStats.total) * 100) : 0;
        });

        Object.keys(stats.byShotType).forEach(type => {
            const typeStats = stats.byShotType[type];
            typeStats.fgPercentage = typeStats.total > 0 ? Math.round((typeStats.made / typeStats.total) * 100) : 0;
        });

        return stats;
    }

    renderDetailedStats(player) {
        const detailedStats = this.calculateDetailedPlayerStats(player);
        const statsDisplay = document.getElementById('statsDisplay');
        
        if (detailedStats.total === 0) {
            statsDisplay.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 12px; font-size: 13px;">No shots recorded yet.</p>';
            return;
        }

        const typeLabels = {
            '2pt': '2-Point',
            '3pt': '3-Point'
        };

        const resultLabels = {
            'made': 'Made',
            'missed': 'Missed'
        };

        let html = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;">
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Total</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${detailedStats.total}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">FG%</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${detailedStats.fgPercentage}%</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Made</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${detailedStats.made}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Points</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--primary-color);">${detailedStats.points}</div>
                </div>
            </div>
        `;

        // Stats by Period
        const periods = Object.keys(detailedStats.byPeriod).sort((a, b) => parseInt(a) - parseInt(b));
        if (periods.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Period</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            periods.forEach(period => {
                const periodStats = detailedStats.byPeriod[period];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">Period ${period}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${periodStats.total} M:${periodStats.made} X:${periodStats.missed}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${periodStats.fgPercentage}%</div>
                        <div style="font-size: 10px; color: var(--primary-color); font-weight: 600;">${periodStats.points}pts</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Stats by Shot Type
        const shotTypes = Object.keys(detailedStats.byShotType).sort();
        if (shotTypes.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Shot Type</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            shotTypes.forEach(type => {
                const typeStats = detailedStats.byShotType[type];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">${typeLabels[type] || type}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${typeStats.total} M:${typeStats.made} X:${typeStats.missed}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${typeStats.fgPercentage}%</div>
                        <div style="font-size: 10px; color: var(--primary-color); font-weight: 600;">${typeStats.points}pts</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Top Results
        const results = Object.entries(detailedStats.byResult)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
        if (results.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">Top Results</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">';
            results.forEach(([result, count]) => {
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 6px; background: var(--bg-color); border-radius: 4px; font-size: 11px;">
                        <span>${resultLabels[result] || result}</span>
                        <span style="font-weight: 600;">${count}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        statsDisplay.innerHTML = html;
    }

    calculateTeamStats() {
        const teamStats = {
            total: 0,
            made: 0,
            missed: 0,
            points: 0,
            fgPercentage: 0,
            byPeriod: {},
            byShotType: {},
            byResult: {},
            byPlayer: {}
        };

        this.players.forEach(player => {
            if (!player.shots || player.shots.length === 0) return;

            const playerStats = this.calculateStats(player);
            teamStats.total += playerStats.totalShots;
            teamStats.made += playerStats.made;
            teamStats.missed += playerStats.missed;
            teamStats.points += playerStats.points;

            // By player
            teamStats.byPlayer[player.id] = {
                name: player.name || '',
                number: player.number,
                total: playerStats.totalShots,
                made: playerStats.made,
                missed: playerStats.missed,
                points: playerStats.points,
                fgPercentage: playerStats.fgPercentage
            };

            // Aggregate by period
            player.shots.forEach(shot => {
                const period = shot.period !== undefined ? shot.period : 1;
                if (!teamStats.byPeriod[period]) {
                    teamStats.byPeriod[period] = { total: 0, made: 0, missed: 0, points: 0 };
                }
                teamStats.byPeriod[period].total++;
                if (shot.result === 'made') {
                    teamStats.byPeriod[period].made++;
                    teamStats.byPeriod[period].points += shot.type === '3pt' ? 3 : 2;
                } else {
                    teamStats.byPeriod[period].missed++;
                }
            });

            // Aggregate by shot type
            Object.keys(playerStats.shotTypeCounts).forEach(type => {
                if (!teamStats.byShotType[type]) {
                    teamStats.byShotType[type] = { total: 0, made: 0, missed: 0, points: 0 };
                }
                const typeStats = playerStats.shotTypeCounts[type];
                teamStats.byShotType[type].total += typeStats.total;
                teamStats.byShotType[type].made += typeStats.made;
                teamStats.byShotType[type].missed += typeStats.missed;
                teamStats.byShotType[type].points += typeStats.made * (type === '3pt' ? 3 : 2);
            });

            // Aggregate by result
            player.shots.forEach(shot => {
                if (!teamStats.byResult[shot.result]) {
                    teamStats.byResult[shot.result] = 0;
                }
                teamStats.byResult[shot.result]++;
            });
        });

        teamStats.fgPercentage = teamStats.total > 0 ? Math.round((teamStats.made / teamStats.total) * 100) : 0;

        // Calculate FG% for periods and shot types
        Object.keys(teamStats.byPeriod).forEach(period => {
            const periodStats = teamStats.byPeriod[period];
            periodStats.fgPercentage = periodStats.total > 0 ? Math.round((periodStats.made / periodStats.total) * 100) : 0;
        });

        Object.keys(teamStats.byShotType).forEach(type => {
            const typeStats = teamStats.byShotType[type];
            typeStats.fgPercentage = typeStats.total > 0 ? Math.round((typeStats.made / typeStats.total) * 100) : 0;
        });

        return teamStats;
    }

    renderStats() {
        const container = document.getElementById('statsContainer');
        const teamStats = this.calculateTeamStats();

        const shotTypeLabels = {
            '2pt': '2-Point',
            '3pt': '3-Point'
        };

        const resultLabels = {
            'made': 'Made',
            'missed': 'Missed'
        };

        let html = `
            <h2 style="font-size: 22px; margin-bottom: 12px;">Team Statistics</h2>
            
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px;">
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Total Shots</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">${teamStats.total}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">FG%</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${teamStats.fgPercentage}%</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Made</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--success-color);">${teamStats.made}</div>
                </div>
                <div style="padding: 8px; background: var(--bg-color); border-radius: 6px; text-align: center;">
                    <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Points</div>
                    <div style="font-size: 18px; font-weight: 700; color: var(--primary-color);">${teamStats.points}</div>
                </div>
            </div>
        `;

        // Stats by Period
        const periods = Object.keys(teamStats.byPeriod).sort((a, b) => parseInt(a) - parseInt(b));
        if (periods.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Period</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            periods.forEach(period => {
                const periodStats = teamStats.byPeriod[period];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">Period ${period}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${periodStats.total} M:${periodStats.made} X:${periodStats.missed}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${periodStats.fgPercentage}%</div>
                        <div style="font-size: 10px; color: var(--primary-color); font-weight: 600;">${periodStats.points}pts</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Stats by Shot Type
        const shotTypes = Object.keys(teamStats.byShotType).sort();
        if (shotTypes.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">By Shot Type</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin-bottom: 12px;">';
            shotTypes.forEach(type => {
                const typeStats = teamStats.byShotType[type];
                html += `
                    <div style="padding: 6px; background: var(--bg-color); border-radius: 4px;">
                        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">${shotTypeLabels[type] || type}</div>
                        <div style="font-size: 10px; color: var(--text-secondary); line-height: 1.3;">T:${typeStats.total} M:${typeStats.made} X:${typeStats.missed}</div>
                        <div style="font-size: 11px; color: var(--success-color); font-weight: 600;">${typeStats.fgPercentage}%</div>
                        <div style="font-size: 10px; color: var(--primary-color); font-weight: 600;">${typeStats.points}pts</div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Top Results
        const results = Object.entries(teamStats.byResult)
            .sort((a, b) => b[1] - a[1]);
        if (results.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">Results</h3>';
            html += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin-bottom: 12px;">';
            results.forEach(([result, count]) => {
                html += `
                    <div style="display: flex; justify-content: space-between; padding: 6px; background: var(--bg-color); border-radius: 4px; font-size: 11px;">
                        <span>${resultLabels[result] || result}</span>
                        <span style="font-weight: 600;">${count}</span>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Player Statistics Table
        const players = Object.values(teamStats.byPlayer).sort((a, b) => a.number - b.number);
        if (players.length > 0) {
            html += '<h3 style="margin-top: 12px; margin-bottom: 6px; font-size: 14px; color: var(--text-primary);">Player Statistics</h3>';
            html += '<div style="overflow-x: auto;">';
            html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
            html += '<thead><tr style="background: var(--bg-color);">';
            html += '<th style="padding: 6px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border-color);">Player</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Shots</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Made</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Missed</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">FG%</th>';
            html += '<th style="padding: 6px; text-align: center; font-weight: 600; border-bottom: 2px solid var(--border-color);">Points</th>';
            html += '</tr></thead><tbody>';
            
            players.forEach(player => {
                html += `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 6px;">#${player.number}${player.name ? ' - ' + player.name : ''}</td>
                        <td style="padding: 6px; text-align: center;">${player.total}</td>
                        <td style="padding: 6px; text-align: center; color: var(--success-color);">${player.made}</td>
                        <td style="padding: 6px; text-align: center; color: var(--danger-color);">${player.missed}</td>
                        <td style="padding: 6px; text-align: center; color: var(--success-color); font-weight: 600;">${player.fgPercentage.toFixed(1)}%</td>
                        <td style="padding: 6px; text-align: center; color: var(--primary-color); font-weight: 600;">${player.points}</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
        }

        container.innerHTML = html;
    }

    openAllStatsModal() {
        const allStatsDisplay = document.getElementById('allStatsDisplay');
        let html = '';

        if (this.players.length === 0) {
            html = '<p style="text-align: center; color: var(--text-secondary);">No players added yet.</p>';
        } else {
            this.players.forEach(player => {
                const stats = this.calculateStats(player);
                html += `
                    <div class="all-stats-player-card">
                        <h3>${player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`}</h3>
                        <div class="all-stats-grid">
                            <div class="stat-row">
                                <span class="stat-label">Total:</span>
                                <span class="stat-value">${stats.totalShots}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Made:</span>
                                <span class="stat-value">${stats.made}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Missed:</span>
                                <span class="stat-value">${stats.missed}</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">FG%:</span>
                                <span class="stat-value">${stats.fgPercentage.toFixed(1)}%</span>
                            </div>
                            <div class="stat-row">
                                <span class="stat-label">Points:</span>
                                <span class="stat-value">${stats.points}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        allStatsDisplay.innerHTML = html;
        document.getElementById('allStatsModal').style.display = 'block';
    }

    closeShotModal() {
        document.getElementById('shotModal').style.display = 'none';
        this.currentPlayerId = null;
        this.selectedShotResult = null;
        this.selectedShotType = null;
        this.pendingShotPosition = null;
    }

    openShotDetailsModal(playerId, shotId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;
        
        const shot = player.shots.find(s => s.id === shotId);
        if (!shot) return;
        
        this.currentPlayerId = playerId;
        this.currentShotId = shotId;
        
        const playerDisplayName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
        document.getElementById('shotDetailsPlayerNumber').textContent = playerDisplayName;
        
        const shotTypeLabel = shot.type === '3pt' ? '3-Point' : '2-Point';
        const resultLabel = shot.result === 'made' ? 'Made' : 'Missed';
        const resultColor = shot.result === 'made' ? '#27ae60' : '#e74c3c';
        const resultEmoji = shot.result === 'made' ? '✅' : '❌';
        
        const shotDate = new Date(shot.timestamp);
        const dateStr = shotDate.toLocaleString();
        
        document.getElementById('shotDetailsInfo').innerHTML = `
            <div style="background: var(--bg-color); border-radius: 12px; padding: 20px; margin-bottom: 15px;">
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: var(--text-secondary);">Shot Type:</span>
                        <span style="font-size: 18px; font-weight: bold; color: var(--text-primary);">${shotTypeLabel}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: var(--text-secondary);">Result:</span>
                        <span style="font-size: 18px; font-weight: bold; color: ${resultColor};">
                            ${resultEmoji} ${resultLabel}
                        </span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: var(--text-secondary);">Recorded:</span>
                        <span style="font-size: 14px; color: var(--text-secondary);">${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('shotDetailsModal').style.display = 'block';
    }

    closeShotDetailsModal() {
        document.getElementById('shotDetailsModal').style.display = 'none';
        this.currentPlayerId = null;
        this.currentShotId = null;
    }

    deleteCurrentShot() {
        if (!this.currentPlayerId || !this.currentShotId) return;
        
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;
        
        if (confirm('Delete this shot? This cannot be undone.')) {
            player.shots = player.shots.filter(s => s.id !== this.currentShotId);
            this.savePlayers();
            this.renderPlayers();
            this.renderCourt();
            this.closeShotDetailsModal();
        }
    }

    closeStatsModal() {
        document.getElementById('statsModal').style.display = 'none';
        this.currentPlayerId = null;
    }

    closeAllStatsModal() {
        document.getElementById('allStatsModal').style.display = 'none';
    }

    exportStatsReport() {
        const gameName = this.gameName || 'Untitled Game';
        const now = new Date();
        const date = now.toLocaleDateString();
        const time = now.toLocaleTimeString();
        
        // Create filename-safe date string
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        let report = `BASKETBALL SHOT COUNTER REPORT\n`;
        report += `================================\n\n`;
        report += `Game: ${gameName}\n`;
        report += `Date: ${date} ${time}\n\n`;
        
        // Home Team Stats
        report += `HOME TEAM STATISTICS\n`;
        report += `====================\n\n`;
        if (this.homePlayers.length === 0) {
            report += `No players added.\n\n`;
        } else {
            this.homePlayers.forEach((player, index) => {
                const stats = this.calculateStats(player);
                const playerName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
                
                report += `${index + 1}. ${playerName}\n`;
                report += `   Total Shots: ${stats.totalShots}\n`;
                report += `   Made: ${stats.made}\n`;
                report += `   Missed: ${stats.missed}\n`;
                report += `   Field Goal %: ${stats.fgPercentage.toFixed(1)}%\n`;
                report += `   Points: ${stats.points}\n`;
                
                // Add shot type breakdown
                if (stats.shotTypeCounts['2pt']) {
                    const twoPt = stats.shotTypeCounts['2pt'];
                    report += `   2-Point Shots: ${twoPt.total} (${twoPt.made} made, ${twoPt.missed} missed)\n`;
                }
                if (stats.shotTypeCounts['3pt']) {
                    const threePt = stats.shotTypeCounts['3pt'];
                    report += `   3-Point Shots: ${threePt.total} (${threePt.made} made, ${threePt.missed} missed)\n`;
                }
                
                report += `   Fouls: ${player.fouls || 0}\n`;
                report += `\n`;
            });
        }
        
        report += `\n`;
        
        // Away Team Stats
        report += `AWAY TEAM STATISTICS\n`;
        report += `====================\n\n`;
        if (this.awayPlayers.length === 0) {
            report += `No players added.\n\n`;
        } else {
            this.awayPlayers.forEach((player, index) => {
                const stats = this.calculateStats(player);
                const playerName = player.name ? `${player.name} (#${player.number})` : `Player #${player.number}`;
                
                report += `${index + 1}. ${playerName}\n`;
                report += `   Total Shots: ${stats.totalShots}\n`;
                report += `   Made: ${stats.made}\n`;
                report += `   Missed: ${stats.missed}\n`;
                report += `   Field Goal %: ${stats.fgPercentage.toFixed(1)}%\n`;
                report += `   Points: ${stats.points}\n`;
                
                // Add shot type breakdown
                if (stats.shotTypeCounts['2pt']) {
                    const twoPt = stats.shotTypeCounts['2pt'];
                    report += `   2-Point Shots: ${twoPt.total} (${twoPt.made} made, ${twoPt.missed} missed)\n`;
                }
                if (stats.shotTypeCounts['3pt']) {
                    const threePt = stats.shotTypeCounts['3pt'];
                    report += `   3-Point Shots: ${threePt.total} (${threePt.made} made, ${threePt.missed} missed)\n`;
                }
                
                report += `   Fouls: ${player.fouls || 0}\n`;
                report += `\n`;
            });
        }
        
        // Create a blob and download
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeGameName = gameName.replace(/[^a-z0-9]/gi, '_');
        a.download = `Basketball_Stats_${safeGameName}_${dateStr}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    updateSyncStatus() {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
            if (this.firebaseEnabled) {
                statusEl.innerHTML = '🟢 Syncing across devices';
                statusEl.style.color = '#90EE90';
                statusEl.style.fontWeight = '600';
            } else {
                statusEl.innerHTML = '⚪ Local mode (Firebase not configured)';
                statusEl.style.color = 'rgba(255, 255, 255, 0.8)';
                statusEl.style.fontWeight = '500';
            }
        }
    }

    updateGameNameDisplay() {
        const gameNameDisplay = document.getElementById('gameNameDisplay');
        
        if (gameNameDisplay) {
            if (this.gameName) {
                gameNameDisplay.textContent = this.gameName;
                gameNameDisplay.style.display = 'block';
            } else {
                gameNameDisplay.textContent = '';
                gameNameDisplay.style.display = 'none';
            }
        }
    }

    saveGameNameInput() {
        const input = document.getElementById('gameNameInput');
        const name = input.value.trim();
        if (name) {
            this.saveGameName(name);
            input.value = name;
            const saveBtn = document.getElementById('saveGameNameBtn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✓ Saved!';
            setTimeout(() => {
                saveBtn.textContent = originalText;
            }, 2000);
        }
    }

    createNewGame() {
        if (confirm('Create a new game? This will generate a new Game Code and clear all current players and data. Continue?')) {
            // Generate new 6-digit game ID
            this.gameId = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('basketballShotCounterGameId', this.gameId);
            
            // Clear players
            this.players = [];
            this.savePlayers();
            
            // Clear game name
            this.gameName = '';
            localStorage.removeItem('basketballShotCounterGameName');
            this.updateGameNameDisplay();
            
            // Clear game name input
            const gameNameInput = document.getElementById('gameNameInput');
            if (gameNameInput) {
                gameNameInput.value = '';
            }
            
            // Update game ID display
            const gameIdDisplay = document.getElementById('gameIdDisplay');
            if (gameIdDisplay) {
                gameIdDisplay.value = this.gameId;
            }
            
            // Clear game ID input
            const gameIdInput = document.getElementById('gameIdInput');
            if (gameIdInput) {
                gameIdInput.value = '';
            }
            
            // Reinitialize Firebase connection if enabled
            if (this.firebaseEnabled) {
                location.reload();
            } else {
                this.renderPlayers();
                this.renderCourt();
                alert('New game created! Game Code: ' + this.gameId);
            }
        }
    }

    openGameModal() {
        const gameIdDisplay = document.getElementById('gameIdDisplay');
        const gameNameInput = document.getElementById('gameNameInput');
        if (gameIdDisplay) {
            gameIdDisplay.value = this.gameId;
        }
        if (gameNameInput) {
            gameNameInput.value = this.gameName || '';
        }
        document.getElementById('gameModal').style.display = 'block';
    }

    closeGameModal() {
        document.getElementById('gameModal').style.display = 'none';
    }

    setupGameIdUI() {
        const copyBtn = document.getElementById('copyGameIdBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const gameIdInput = document.getElementById('gameIdDisplay');
                gameIdInput.select();
                gameIdInput.setSelectionRange(0, 99999);
                try {
                    document.execCommand('copy');
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.background = '#52C41A';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy';
                        copyBtn.style.background = '';
                    }, 2000);
                } catch (err) {
                    navigator.clipboard.writeText(this.gameId).then(() => {
                        copyBtn.textContent = 'Copied!';
                        copyBtn.style.background = '#52C41A';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                            copyBtn.style.background = '';
                        }, 2000);
                    });
                }
            });
        }

        const setBtn = document.getElementById('setGameIdBtn');
        const gameIdInput = document.getElementById('gameIdInput');
        if (setBtn && gameIdInput) {
            setBtn.addEventListener('click', () => {
                const newGameId = gameIdInput.value.trim().replace(/\D/g, ''); // Only digits
                if (newGameId && newGameId.length === 6) {
                    if (confirm('This will connect to a different game. All local data will sync with the new game. Continue?')) {
                        localStorage.setItem('basketballShotCounterGameId', newGameId);
                        this.gameId = newGameId;
                        const gameIdDisplay = document.getElementById('gameIdDisplay');
                        if (gameIdDisplay) {
                            gameIdDisplay.value = newGameId;
                        }
                        gameIdInput.value = '';
                        
                        // Load game name from new game
                        if (this.firebaseEnabled) {
                            location.reload();
                        } else {
                            alert('Game ID updated. Refresh the page to connect.');
                        }
                    }
                } else {
                    alert('Please enter a valid 6-digit Game Code');
                }
            });
            
            // Only allow digits
            gameIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').substring(0, 6);
            });
            
            gameIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    setBtn.click();
                }
            });
        }
    }
}

// Initialize the app
let app;
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new BasketballShotCounter();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = '<h1>Error Loading App</h1><p>Please refresh the page. If the problem persists, clear your browser cache.</p>';
        }
    }
});

// Suppress harmless browser extension errors in console
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return false;
    }
}, true);

// Update Manager Class
class UpdateManager {
    constructor() {
        this.registration = null;
        this.updateAvailable = false;
        this.checkingForUpdate = false;
        this.setupUI();
    }
    
    setupUI() {
        // Setup update banner buttons (use event delegation since elements are created dynamically)
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'updateNowBtn') {
                this.applyUpdate();
            } else if (e.target.id === 'updateLaterBtn') {
                this.hideUpdateBanner();
            }
        });
        
        // Setup settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        // Setup check for updates button in settings
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => this.checkForUpdate());
        }
        
        // Setup close settings modal
        const closeSettingsModal = document.getElementById('closeSettingsModal');
        const settingsModal = document.getElementById('settingsModal');
        if (closeSettingsModal && settingsModal) {
            closeSettingsModal.addEventListener('click', () => this.closeSettings());
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    this.closeSettings();
                }
            });
        }
    }
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            console.log('Service Workers not supported or file protocol');
            return;
        }
        
        try {
            this.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
            console.log('Service Worker registered:', this.registration);
            
            // Check for updates immediately
            await this.checkForUpdate();
            
            // Listen for service worker updates
            this.registration.addEventListener('updatefound', () => {
                console.log('Service Worker update found');
                this.handleUpdateFound();
            });
            
            // Check for updates periodically (every 5 minutes)
            setInterval(() => this.checkForUpdate(), 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    
    async checkForUpdate() {
        if (this.checkingForUpdate || !this.registration) return;
        
        this.checkingForUpdate = true;
        const checkBtn = document.getElementById('checkUpdateBtn');
        const updateBtnText = document.getElementById('updateBtnText');
        const updateStatusText = document.getElementById('updateStatusText');
        
        if (checkBtn) {
            checkBtn.disabled = true;
        }
        if (updateBtnText) {
            updateBtnText.textContent = '⏳ Checking...';
        }
        if (updateStatusText) {
            updateStatusText.textContent = '';
        }
        
        try {
            // Force update check
            await this.registration.update();
            
            // Check if there's a waiting service worker
            if (this.registration.waiting) {
                this.updateAvailable = true;
                this.showUpdateBanner();
                if (updateStatusText) {
                    updateStatusText.textContent = 'Update available! See banner at top.';
                    updateStatusText.style.color = 'var(--primary-color)';
                }
            } else {
                // Check if there's an installing service worker
                if (this.registration.installing) {
                    this.handleUpdateFound();
                } else {
                    console.log('No updates available');
                    if (updateBtnText) {
                        updateBtnText.textContent = '✅ Up to date';
                    }
                    if (updateStatusText) {
                        updateStatusText.textContent = 'You have the latest version.';
                        updateStatusText.style.color = 'var(--text-secondary)';
                    }
                    setTimeout(() => {
                        if (updateBtnText) {
                            updateBtnText.textContent = '🔄 Check for Updates';
                        }
                        if (checkBtn) {
                            checkBtn.disabled = false;
                        }
                        if (updateStatusText) {
                            updateStatusText.textContent = '';
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (updateBtnText) {
                updateBtnText.textContent = '❌ Error';
            }
            if (updateStatusText) {
                updateStatusText.textContent = 'Failed to check for updates.';
                updateStatusText.style.color = 'var(--primary-color)';
            }
            setTimeout(() => {
                if (updateBtnText) {
                    updateBtnText.textContent = '🔄 Check for Updates';
                }
                if (checkBtn) {
                    checkBtn.disabled = false;
                }
                if (updateStatusText) {
                    updateStatusText.textContent = '';
                }
            }, 2000);
        } finally {
            this.checkingForUpdate = false;
        }
    }
    
    handleUpdateFound() {
        const installingWorker = this.registration.installing;
        if (!installingWorker) return;
        
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                    // New service worker is waiting
                    this.updateAvailable = true;
                    this.showUpdateBanner();
                } else {
                    // First time install
                    console.log('Service Worker installed for the first time');
                }
            }
        });
    }
    
    showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.remove('hidden');
        }
        const updateBtnText = document.getElementById('updateBtnText');
        if (updateBtnText) {
            updateBtnText.textContent = '🔄 Update Available';
        }
        const checkBtn = document.getElementById('checkUpdateBtn');
        if (checkBtn) {
            checkBtn.disabled = false;
        }
    }
    
    hideUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }
    
    async applyUpdate() {
        try {
            // Clear all caches first to ensure fresh files are loaded
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
            
            // Unregister all service workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map(registration => {
                    console.log('Unregistering service worker');
                    return registration.unregister();
                })
            );
            
            // If there's a waiting worker, tell it to skip waiting
            if (this.registration && this.registration.waiting) {
                this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Force reload with cache bypass (use timestamp to bust cache)
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        } catch (error) {
            console.error('Error applying update:', error);
            // Fallback: reload with cache bypass
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }
    }
    
    async loadVersion() {
        const versionText = document.getElementById('versionText');
        if (!versionText) return;
        
        try {
            // Get version from cache name (most reliable method)
            const cacheNames = await caches.keys();
            const currentCache = cacheNames.find(name => name.startsWith('basketball-shot-counter-'));
            if (currentCache) {
                const version = currentCache.replace('basketball-shot-counter-', '');
                versionText.textContent = `App Version: ${version}`;
            } else {
                // Try to get from service worker if available
                if (this.registration && this.registration.active) {
                    // Fetch the service worker script and extract version
                    try {
                        const swResponse = await fetch('./service-worker.js?t=' + Date.now());
                        const swText = await swResponse.text();
                        const versionMatch = swText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
                        if (versionMatch) {
                            versionText.textContent = `App Version: ${versionMatch[1]}`;
                        } else {
                            versionText.textContent = 'App Version: Unknown';
                        }
                    } catch (e) {
                        versionText.textContent = 'App Version: Not installed';
                    }
                } else {
                    versionText.textContent = 'App Version: Not installed';
                }
            }
        } catch (error) {
            console.error('Error loading version:', error);
            versionText.textContent = 'App Version: Error';
        }
    }
    
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'block';
            // Load version when opening settings
            this.loadVersion();
        }
    }
    
    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// Initialize Update Manager
let updateManager = null;
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        updateManager = new UpdateManager();
        window.updateManager = updateManager; // Make it globally accessible
        updateManager.registerServiceWorker();
    });
}
