/**
 * Neandertool - Game Logic
 *
 * Handles challenge mode, scoring, timer, and difficulty progression.
 */

// ── Leaderboard API (Cloudflare Worker, see /worker) ──────────────────────
const LEADERBOARD_URL = 'https://neandertool-leaderboard.javierpetrucci.workers.dev';
const LEADERBOARD_CACHE_KEY = 'neandertool.leaderboard';
const LEADERBOARD_TIMEOUT_MS = 8000;

const LeaderboardAPI = {
    async request(path, options = {}) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), LEADERBOARD_TIMEOUT_MS);
        try {
            return await fetch(`${LEADERBOARD_URL}${path}`, { ...options, signal: ctrl.signal });
        } finally {
            clearTimeout(timer);
        }
    },

    readCache() {
        try {
            const data = JSON.parse(localStorage.getItem(LEADERBOARD_CACHE_KEY));
            return Array.isArray(data) ? data : null;
        } catch {
            return null;
        }
    },

    writeCache(entries) {
        try {
            localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify(entries));
        } catch { /* storage unavailable */ }
    },

    /** @returns {Promise<{entries: Array, offline: boolean}>} */
    async list() {
        try {
            const res = await this.request('/scores');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data)) throw new Error('Unexpected response');
            data.forEach(e => { e.score = parseInt(e.score, 10) || 0; });
            this.writeCache(data);
            return { entries: data, offline: false };
        } catch (e) {
            console.error('Leaderboard fetch error:', e);
            return { entries: this.readCache() || [], offline: true };
        }
    },

    /** @returns {Promise<boolean>} true if the score was stored */
    async submit(name, score) {
        try {
            const res = await this.request('/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, score })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return true;
        } catch (e) {
            console.error('Leaderboard save error:', e);
            return false;
        }
    }
};

/**
 * Does the cascade's response stay out of the template's forbidden regions?
 * Optimal (equiripple) designs touch the limits exactly, so a tiny tolerance
 * absorbs floating-point error (e.g. -3.0000000000000036 dB at the passband edge).
 */
const CONSTRAINT_TOL_DB = 1e-6;

function meetsConstraints(cascade, constraints) {
    if (!constraints) return false;
    const { passband, stopband } = constraints;

    // Passband: above dbMin AND not above 0 dB
    const pbResponse = cascade.getFrequencyResponse(passband.freqMin, passband.freqMax, 50);
    if (pbResponse.some(p => p.magnitudeDb < passband.dbMin - CONSTRAINT_TOL_DB)) return false;
    if (pbResponse.some(p => p.magnitudeDb > CONSTRAINT_TOL_DB)) return false;

    // Stopband: below dbMax
    const sbResponse = cascade.getFrequencyResponse(stopband.freqMin, stopband.freqMax, 50);
    return !sbResponse.some(p => p.magnitudeDb > stopband.dbMax + CONSTRAINT_TOL_DB);
}

// ── 15 Hardcoded Zen Levels ────────────────────────────────────────────────
const ZEN_LEVELS = [
    { wp: 1, ratio: 3.0, Ap: 3, As: 20, minOrder: 1 },
    { wp: 2, ratio: 2.8, Ap: 3, As: 22, minOrder: 1 },
    { wp: 3, ratio: 2.5, Ap: 3, As: 24, minOrder: 2 },
    { wp: 1, ratio: 2.3, Ap: 3, As: 26, minOrder: 2 },
    { wp: 5, ratio: 2.1, Ap: 3, As: 28, minOrder: 3 },
    { wp: 2, ratio: 1.9, Ap: 3, As: 30, minOrder: 3 },
    { wp: 4, ratio: 1.8, Ap: 3, As: 31, minOrder: 4 },
    { wp: 3, ratio: 1.7, Ap: 3, As: 32, minOrder: 4 },
    { wp: 1, ratio: 1.65, Ap: 3, As: 33, minOrder: 5 },
    { wp: 5, ratio: 1.6, Ap: 3, As: 34, minOrder: 5 },
    { wp: 2, ratio: 1.55, Ap: 3, As: 35, minOrder: 6 },
    { wp: 4, ratio: 1.5, Ap: 3, As: 36, minOrder: 6 },
    { wp: 3, ratio: 1.45, Ap: 3, As: 38, minOrder: 7 },
    { wp: 1, ratio: 1.4, Ap: 3, As: 40, minOrder: 7 },
    { wp: 5, ratio: 1.35, Ap: 3, As: 42, minOrder: 8 },
];

class GameManager {
    constructor() {
        this.mode = 'sandbox';  // 'sandbox', 'challenge', or 'zen'
        this.score = 0;
        this.round = 1;
        this.timeRemaining = 60;
        this.timeElapsed = 0;   // Zen mode count-up timer
        this.timerInterval = null;
        this.countdownInterval = null;
        this.constraints = null;
        this.isGameOver = false;
        this.isPaused = false; // Used during popups
        this.usedBestSolution = false; // Penalty flag per round

        // Zen mode state
        this.zenLevelsPassed = new Array(ZEN_LEVELS.length).fill(false);
        this.zenBestTimes = new Array(ZEN_LEVELS.length).fill(null);
        this.zenCurrentPassed = false; // Has current level been passed?

        // Challenge difficulty settings (start at order 1, scale gradually)
        this.baseMinOrder = 1;
        this.orderIncreasePerRound = 0.5;
    }

    /**
     * Generate random filter constraints
     * Now operates in normalized frequency (ωp = 1)
     */
    generateConstraints() {
        const minOrder = Math.floor(this.baseMinOrder + (this.round - 1) * this.orderIncreasePerRound);

        // Passband frequency is a random multiple of 1kHz up to 10kHz
        const passbandFreq = Math.floor(Math.random() * 10) + 1;

        // Stopband starts 1.5 to 3.0 in normalized space
        const gap = 1.5 + Math.random() * 1.5;
        const stopbandFreq = passbandFreq * gap;

        // Passband ripple is strictly fixed to 3 dB max (Gp = -3dB)
        const passbandRipple = 3.0;

        // Stopband attenuation (25 to 35 dB)
        const stopbandAtten = 25 + Math.random() * 10;

        this.constraints = {
            passband: {
                freqMin: 0.1,  // Plot down to 0.1 instead of 10 Hz
                freqMax: passbandFreq,
                dbMin: -passbandRipple
            },
            stopband: {
                freqMin: stopbandFreq,
                freqMax: 100, // Safe high limit in normalized freq
                dbMax: -stopbandAtten
            },
            wp: passbandFreq, // 1.0
            ws: stopbandFreq, // > 1.0
            Ap: passbandRipple,
            As: stopbandAtten,
            minOrder
        };

        return this.constraints;
    }

    /**
     * Check if current filter meets constraints
     */
    checkConstraints(cascade) {
        return meetsConstraints(cascade, this.constraints);
    }

    /**
     * Start a new challenge round
     */
    startChallenge(subMode = 'hardcore') {
        this.mode = subMode === 'zen' ? 'zen' : 'challenge';
        this.subMode = subMode;
        this.round = 1;
        this.score = 0;
        this.timeRemaining = 60;
        this.timeElapsed = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.usedBestSolution = false;

        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        // Immediately update HUD so it doesn't show stale values from previous mode
        this.updateHUD();

        // Wait for explicit this.startRound() call from UI
    }

    startRound() {
        this.usedBestSolution = false; // Reset per round
        this.zenCurrentPassed = false;
        this.isPaused = false; // Ensure timer runs (was set true by completeRound)

        if (this.subMode === 'zen') {
            // Load hardcoded zen level
            this.loadZenLevel(this.round);
            this.timeElapsed = 0;

            // Start count-UP timer
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (this.isPaused) return;
                this.timeElapsed++;
                this.updateHUD();
            }, 1000);
        } else {
            // Hardcore mode
            this.timeRemaining = 60;
            this.generateConstraints();

            // Start countdown timer
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (this.isPaused) return;
                this.timeRemaining--;

                const urgency = Math.max(0, Math.min(1, 1 - this.timeRemaining / 60));
                audio.playTick(urgency);

                if (this.timeRemaining <= 0) {
                    clearInterval(this.timerInterval);
                    this.isGameOver = true;
                }

                this.updateHUD();
            }, 1000);
        }

        this.updateHUD();
    }

    /**
     * Load constraints from the hardcoded ZEN_LEVELS array
     */
    loadZenLevel(levelNum) {
        const idx = Math.min(levelNum - 1, ZEN_LEVELS.length - 1);
        const lv = ZEN_LEVELS[idx];
        const stopbandFreq = lv.wp * lv.ratio;

        this.constraints = {
            passband: { freqMin: 0.1, freqMax: lv.wp, dbMin: -lv.Ap },
            stopband: { freqMin: stopbandFreq, freqMax: 100, dbMax: -lv.As },
            wp: lv.wp,
            ws: stopbandFreq,
            Ap: lv.Ap,
            As: lv.As,
            minOrder: lv.minOrder
        };
    }

    /**
     * Navigate to next zen level (only if current is passed)
     */
    nextLevel() {
        if (this.subMode !== 'zen') return;
        if (!this.zenCurrentPassed && !this.zenLevelsPassed[this.round - 1]) return;
        if (this.round >= ZEN_LEVELS.length) return;
        this.round++;
        this.startRound();
    }

    /**
     * Navigate to previous zen level
     */
    prevLevel() {
        if (this.subMode !== 'zen') return;
        if (this.round <= 1) return;
        this.round--;
        this.startRound();
    }

    /**
     * Check if all zen levels have been completed
     */
    allZenLevelsComplete() {
        // Just checking if the last level is passed is enough, 
        // since players must pass preceding levels to reach it.
        // This also allows dev skips to trigger the finale correctly.
        return this.zenLevelsPassed[ZEN_LEVELS.length - 1];
    }

    endGame() {
        clearInterval(this.timerInterval);
        this.isGameOver = true;
        this.isPaused = true;
    }

    /**
     * Called when player successfully meets constraints
     */
    completeRound(cascade, uiCallback) {
        clearInterval(this.timerInterval);
        this.isPaused = true;

        let roundScore = 0;

        if (this.subMode === 'zen') {
            // Mark level as passed
            this.zenCurrentPassed = true;
            this.zenLevelsPassed[this.round - 1] = true;

            // Track best time
            const prevBest = this.zenBestTimes[this.round - 1];
            if (prevBest === null || this.timeElapsed < prevBest) {
                this.zenBestTimes[this.round - 1] = this.timeElapsed;
            }
        } else {
            // Hardcore scoring
            const timeBonus = this.timeRemaining * 10;
            const stageCount = cascade.stages.length;
            const optimalOrder = this.constraints.minOrder;
            const stagePenalty = Math.max(0, (stageCount - optimalOrder) * 50);

            roundScore = Math.max(0, 1000 + timeBonus - stagePenalty);

            // Penalty for using best solution
            if (this.usedBestSolution) {
                roundScore = Math.floor(roundScore * 0.15);
            }

            this.score += roundScore;
        }

        audio.playRoundComplete();

        // Trigger the UI callback (no auto-advance in zen mode)
        if (uiCallback) {
            uiCallback(roundScore);
        } else if (this.subMode !== 'zen') {
            this.proceedToNextRound();
        }

        return roundScore;
    }

    proceedToNextRound() {
        this.round++;
        this.isPaused = false;
        this.startRound();
    }

    gameOver(uiCallback) {
        clearInterval(this.timerInterval);
        this.isGameOver = true;
        this.isPaused = true;

        audio.playFail();

        if (uiCallback) {
            uiCallback(this.score, this.round - 1);
        }
    }

    updateHUD() {
        const timerEl = document.getElementById('timer');
        const scoreLabel = document.getElementById('score-label');

        if (this.subMode === 'zen') {
            // Count-up timer display (MM:SS)
            const mins = Math.floor(this.timeElapsed / 60);
            const secs = this.timeElapsed % 60;
            timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
            timerEl.classList.remove('timer-yellow', 'timer-red');
            timerEl.classList.add('timer-green');

            // Label and best personal time
            if (scoreLabel) scoreLabel.textContent = 'Best';
            const bestTime = this.zenBestTimes[this.round - 1];
            if (bestTime !== null) {
                const bm = Math.floor(bestTime / 60);
                const bs = bestTime % 60;
                document.getElementById('score').textContent = `${bm}:${String(bs).padStart(2, '0')}`;
            } else {
                document.getElementById('score').textContent = '--:--';
            }
            document.getElementById('round').textContent = `${this.round}/${ZEN_LEVELS.length}`;
        } else {
            if (scoreLabel) scoreLabel.textContent = 'Score';
            timerEl.textContent = this.timeRemaining;

            // Update timer color based on urgency
            timerEl.classList.remove('timer-green', 'timer-yellow', 'timer-red');
            if (this.timeRemaining > 30) {
                timerEl.classList.add('timer-green');
            } else if (this.timeRemaining > 15) {
                timerEl.classList.add('timer-yellow');
            } else {
                timerEl.classList.add('timer-red');
            }

            document.getElementById('score').textContent = this.score;
            document.getElementById('round').textContent = this.round;
        }
    }

    /**
     * Get optimal Chebyshev solution for current constraints
     */
    getBestSolution(freqMin, freqMax) {
        if (!this.constraints) return null;

        return ChebyshevSolver.getFrequencyResponse(
            this.constraints.wp,
            this.constraints.ws,
            this.constraints.Ap,
            this.constraints.As,
            freqMin,
            freqMax
        );
    }

    /**
     * Get the exact instantiated stages and global gain for the best solution
     */
    getBestSolutionStages() {
        if (!this.constraints) return null;

        return ChebyshevSolver.getBestSolutionStages(
            this.constraints.wp,
            this.constraints.ws,
            this.constraints.Ap,
            this.constraints.As
        );
    }

    /**
     * Retrieve top 10 scores. Falls back to the last cached list when offline.
     * @returns {Promise<{entries: Array, offline: boolean}>}
     */
    async getLeaderboard() {
        return LeaderboardAPI.list();
    }

    /**
     * Save a score (date is assigned by the server)
     * @returns {Promise<boolean>} true if stored
     */
    async saveScore(name, score) {
        return LeaderboardAPI.submit(name, score);
    }

    /**
     * Check if a score qualifies for the global top 10 asynchronously
     */
    async isHighScore(score) {
        if (score <= 0) return false;
        const { entries, offline } = await this.getLeaderboard();
        // Can't submit while the server is unreachable
        if (offline) return false;
        if (entries.length < 10) return true;
        // If it's strictly greater than the lowest score in the top 10
        return score > entries[entries.length - 1].score;
    }
}
