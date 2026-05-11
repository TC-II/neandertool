/**
 * Neandertool - UI Manager
 *
 * Handles canvas plotting with auto-scaling, stage controls, and parameter controls.
 * In Challenge Mode: sliders are hidden; parameters are adjusted via scroll wheel.
 */

class PlotManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // View settings - auto-scaled based on constraints (normalized)
        this.freqMin = 0.1;
        this.freqMax = 100;
        this.dbMin = -46;
        this.dbMax = 3.3;

        // HiDPI support
        this.setupCanvas();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Auto-scale view to fit constraints
     */
    autoScale(constraints) {
        if (!constraints) {
            this.freqMin = 0.1;
            this.freqMax = 10;
            this.dbMin = -46;
            this.dbMax = 3.3;
            return;
        }

        const pbMax = constraints.passband?.freqMax || 1.0;
        const sbMin = constraints.stopband?.freqMin || 2.0;

        this.freqMin = 0.1;
        this.freqMax = Math.max(10, sbMin * 2);

        this.dbMin = -46;
        this.dbMax = 3.3;
    }

    freqToX(freq) {
        const logMin = Math.log10(this.freqMin);
        const logMax = Math.log10(this.freqMax);
        const logFreq = Math.log10(freq);
        return ((logFreq - logMin) / (logMax - logMin)) * this.width;
    }

    xToFreq(x) {
        const logMin = Math.log10(this.freqMin);
        const logMax = Math.log10(this.freqMax);
        const logFreq = logMin + (x / this.width) * (logMax - logMin);
        return Math.pow(10, logFreq);
    }

    dbToY(db) {
        return this.height - ((db - this.dbMin) / (this.dbMax - this.dbMin)) * this.height;
    }

    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#1a3a4a';
        ctx.lineWidth = 1;

        const startDecade = Math.floor(Math.log10(this.freqMin));
        const endDecade = Math.ceil(Math.log10(this.freqMax));

        ctx.font = '10px monospace';
        ctx.fillStyle = '#4a7a8a';

        for (let dec = startDecade; dec <= endDecade; dec++) {
            for (let mult = 1; mult < 10; mult++) {
                const freq = mult * Math.pow(10, dec);
                if (freq < this.freqMin || freq > this.freqMax) continue;

                const x = this.freqToX(freq);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this.height);
                ctx.stroke();

                if (mult === 1 && Math.abs(freq - 0.1) > 0.001) {
                    ctx.fillText(this.formatFreq(freq), x + 2, this.height - 5);
                }
            }
        }

        for (let db = Math.ceil(this.dbMin / 10) * 10; db <= this.dbMax; db += 10) {
            const y = this.dbToY(db);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
            ctx.fillText(`${db} dB`, 5, y - 2);
        }

        // 0dB line (emphasized)
        ctx.strokeStyle = '#3a5a6a';
        ctx.lineWidth = 2;
        const y0 = this.dbToY(0);
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(this.width, y0);
        ctx.stroke();
    }

    formatFreq(freq) {
        return freq.toFixed(freq < 1 ? 1 : 0) + ' kHz';
    }

    drawResponse(response, color = '#00ffff', lineWidth = 2) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        let started = false;
        for (const point of response) {
            const x = this.freqToX(point.freq);
            const db = Math.min(this.dbMax, point.magnitudeDb);
            const y = this.dbToY(db);

            if (x < 0 || x > this.width) continue;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    drawConstraints(constraints) {
        const ctx = this.ctx;

        // Forbidden zone above 0dB
        ctx.fillStyle = 'rgba(255, 50, 50, 0.2)';
        ctx.fillRect(0, 0, this.width, this.dbToY(0));

        // 0dB limit line
        ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.dbToY(0));
        ctx.lineTo(this.width, this.dbToY(0));
        ctx.stroke();
        ctx.lineWidth = 1;

        // Passband constraint
        if (constraints.passband) {
            const { freqMin: pMin, freqMax: pMax, dbMin: pDbMin } = constraints.passband;
            ctx.fillStyle = 'rgba(0, 255, 100, 0.15)';
            ctx.fillRect(
                this.freqToX(pMin),
                this.dbToY(0),
                this.freqToX(pMax) - this.freqToX(pMin),
                this.dbToY(pDbMin) - this.dbToY(0)
            );

            ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.freqToX(pMin), this.dbToY(pDbMin));
            ctx.lineTo(this.freqToX(pMax), this.dbToY(pDbMin));
            ctx.stroke();
            ctx.setLineDash([]);

            // Label the passband end frequency
            ctx.fillStyle = '#00ff64';
            ctx.font = '10px monospace';
            ctx.fillText(pMax.toFixed(0) + ' kHz', this.freqToX(pMax) - 35, this.height - 15);
        }

        // Stopband constraint
        if (constraints.stopband) {
            const { freqMin: sMin, freqMax: sMax, dbMax: sDbMax } = constraints.stopband;
            ctx.fillStyle = 'rgba(255, 100, 100, 0.15)';
            ctx.fillRect(
                this.freqToX(sMin),
                this.dbToY(sDbMax),
                this.freqToX(sMax) - this.freqToX(sMin),
                this.dbToY(this.dbMin) - this.dbToY(sDbMax)
            );

            ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.freqToX(sMin), this.dbToY(sDbMax));
            ctx.lineTo(this.freqToX(sMax), this.dbToY(sDbMax));
            ctx.stroke();
            ctx.setLineDash([]);

            // Label the stopband start frequency
            ctx.fillStyle = '#ff9800';
            ctx.font = '10px monospace';
            ctx.fillText(sMin.toFixed(2) + ' kHz', this.freqToX(sMin) + 4, this.height - 15);
        }
    }

    clear() {
        this.ctx.fillStyle = '#000510';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    render(cascade, constraints = null, bestSolution = null, showBest = false, hoveredResponse = null) {
        this.autoScale(constraints);
        this.clear();
        this.drawGrid();

        if (constraints) {
            this.drawConstraints(constraints);
        }

        if (showBest && bestSolution) {
            this.drawResponse(bestSolution, '#7c4dff', 2);
        }

        const response = cascade.getFrequencyResponse(this.freqMin, this.freqMax);

        // Pick curve color based on whether constraints are satisfied
        let curveColor = '#00bcd4'; // default frost-cyan (sandbox, no constraints)
        if (constraints) {
            const meets = this._checkConstraints(cascade, constraints);
            curveColor = meets ? '#4caf50' : '#ff9800'; // success-green or warning-orange
        }

        this.drawResponse(response, curveColor, 2);

        // Draw hovered individual stage OVER the main cascade response if it exists
        if (hoveredResponse) {
            this.drawResponse(hoveredResponse, '#f44336', 2); // danger-red to pop out clearly against all backgrounds
        }
    }

    // Internal constraint check for curve coloring
    _checkConstraints(cascade, constraints) {
        const { passband, stopband } = constraints;
        const pbResponse = cascade.getFrequencyResponse(passband.freqMin, passband.freqMax, 50);
        if (pbResponse.some(p => p.magnitudeDb < passband.dbMin)) return false;
        if (pbResponse.some(p => p.magnitudeDb > 0)) return false;
        const sbResponse = cascade.getFrequencyResponse(stopband.freqMin, stopband.freqMax, 50);
        if (sbResponse.some(p => p.magnitudeDb > stopband.dbMax)) return false;
        return true;
    }
}

class PZMapManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // s-plane bounds
        this.maxS = 10;

        this.setupCanvas();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    autoScale(cascade, constraints) {
        // Enforce a strict horizontal bound of 3
        this.maxS = 3;
        if (constraints && constraints.ws) {
            this.maxS = Math.max(3, constraints.ws * 1.2);
        }
    }

    // Convert s-plane coordinate to canvas pixel
    sToX(re) {
        // We only care about LHP (re <= 0) and small RHP margin
        // re ranges from [-maxS, maxS/5]
        const range = this.maxS * 1.2;
        const normalized = (re + this.maxS) / range;
        return normalized * this.width;
    }

    sToY(im) {
        // im ranges from [+maxS, -maxS] -> Canvas Y grows downwards
        const range = this.maxS * 2;
        const normalized = (this.maxS - im) / range;
        return normalized * this.height;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    drawGrid() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#1a3a4a';
        ctx.lineWidth = 1;
        ctx.font = '10px monospace';
        ctx.fillStyle = '#4a7a8a';

        // Draw Axes
        const xOrigin = this.sToX(0);
        const yOrigin = this.sToY(0);

        ctx.beginPath();
        ctx.moveTo(0, yOrigin);
        ctx.lineTo(this.width, yOrigin);
        ctx.moveTo(xOrigin, 0);
        ctx.lineTo(xOrigin, this.height);
        ctx.stroke();

        ctx.fillText("0", xOrigin + 5, yOrigin - 5);
        ctx.fillText("Re(s)", this.width - 35, yOrigin - 5);
        ctx.fillText("Im(s)", xOrigin + 5, 12);

        // Draw semi-circles for w=1, w=3, w=5, w=10
        ctx.strokeStyle = 'rgba(74, 122, 138, 0.4)';
        ctx.setLineDash([4, 4]);

        const wRadii = [1, 3, 5, 10];
        for (const r of wRadii) {
            ctx.beginPath();
            // Canvas arc uses purely pixel dimensions so we map the radius from s-plane to pixels
            const rPxX = this.sToX(r) - xOrigin;
            ctx.arc(xOrigin, yOrigin, rPxX, Math.PI / 2, 3 * Math.PI / 2);
            ctx.stroke();

            // Label radius intersection on Re axis
            ctx.fillText(`-${r}`, this.sToX(-r), yOrigin - 5);
        }
        ctx.setLineDash([]);
    }

    drawPole(re, im, color, isBest = false) {
        const ctx = this.ctx;
        const x = this.sToX(re);
        const y = this.sToY(im);

        ctx.strokeStyle = color;
        ctx.lineWidth = isBest ? 3 : 2;
        ctx.beginPath();

        if (isBest) {
            // Draw a distinct + marker for best solution
            const size = 6;
            ctx.moveTo(x - size, y);
            ctx.lineTo(x + size, y);
            ctx.moveTo(x, y - size);
            ctx.lineTo(x, y + size);
        } else {
            // Draw a standard X marker for user poles
            const size = 5;
            ctx.moveTo(x - size, y - size);
            ctx.lineTo(x + size, y + size);
            ctx.moveTo(x - size, y + size);
            ctx.lineTo(x + size, y - size);
        }
        ctx.stroke();
    }

    render(cascade, constraints = null, hoveredStageId = null, showBest = false, bestSolutionStages = null) {
        this.autoScale(cascade, constraints);
        this.clear();
        this.drawGrid();

        if (!cascade || !cascade.stages) return;

        // Draw user poles first
        for (const stage of cascade.stages) {
            if (!stage.active) continue;
            if (typeof stage.getPoles !== 'function') continue;

            const isHovered = (hoveredStageId === stage.id);
            const color = isHovered ? '#f44336' : '#00bcd4';

            for (const p of stage.getPoles()) {
                this.drawPole(p.re, p.im, color);
            }
        }

        // Draw best solution poles LAST (on top) so they're always visible
        if (showBest && bestSolutionStages) {
            for (const stage of bestSolutionStages) {
                if (typeof stage.getPoles === 'function') {
                    for (const p of stage.getPoles()) {
                        this.drawPole(p.re, p.im, '#ff00ff', true);
                    }
                }
            }
        }
    }
}

class UIManager {
    constructor(cascade, game) {
        this.cascade = cascade;
        this.game = game;

        this.plot = new PlotManager('frequency-response');
        this.pzmap = new PZMapManager('pzmap-canvas');
        this.stagesList = document.getElementById('stages-list');
        this.scrollSensitivity = 3.0; // Scroll sensitivity multiplier (adjustable by user)
        this.showBestSolution = false;

        this.showHoveredStage = false;
        this.currentlyHoveredStageId = null;

        // Popup elements
        this.overlay = document.getElementById('popup-overlay');
        this.victoryPopup = document.getElementById('victory-popup');
        this.gameoverPopup = document.getElementById('gameover-popup');

        this.setupEventListeners();
        this.setupSensitivityControl();
    }

    setupSensitivityControl() {
        const slider = document.getElementById('scroll-sensitivity');
        const display = document.getElementById('sensitivity-value');
        if (!slider) return;

        slider.addEventListener('input', () => {
            this.scrollSensitivity = parseFloat(slider.value);
            display.textContent = this.scrollSensitivity.toFixed(1) + '×';
        });
    }

    setupEventListeners() {
        // Global Gain Control
        const gainSlider = document.getElementById('global-gain-slider');
        const gainValue = document.getElementById('global-gain-value');
        if (gainSlider && gainValue) {
            gainSlider.addEventListener('input', () => {
                this.cascade.globalGainDb = parseFloat(gainSlider.value);
            });

            gainValue.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // deltaY > 0 = scroll down = decrease
                const direction = e.deltaY > 0 ? -1 : 1;
                const step = 0.1; // Gain step in dB

                let newValue = this.cascade.globalGainDb + direction * step;
                newValue = Math.max(-46, Math.min(3, newValue));
                this.cascade.globalGainDb = newValue;
                audio.playClick();
            }, { passive: false });
        }

        // Tolerance Control
        const tolValue = document.getElementById('slider-tolerance-value');
        if (tolValue) {
            tolValue.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const direction = e.deltaY > 0 ? -1 : 1;
                const step = 1; // 1% per tick

                let currentVal = parseInt(tolValue.textContent, 10);
                let newValue = Math.max(1, Math.min(100, currentVal + direction * step));

                tolValue.textContent = Math.round(newValue);
                audio.playClick();

                for (const stage of this.cascade.stages) {
                    if (stage.getParameters) {
                        for (const param of stage.getParameters()) {
                            param.autoRange();
                            if (param._slider) {
                                param._slider.min = param.min;
                                param._slider.max = param.max;
                            }
                        }
                    }
                }
            }, { passive: false });
        }

        // Animation Speed Control
        const speedValue = document.getElementById('slider-speed-value');
        if (speedValue) {
            speedValue.addEventListener('wheel', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const direction = e.deltaY > 0 ? -1 : 1;
                const step = 0.1; // 0.1 Hz per tick

                let currentVal = parseFloat(speedValue.textContent);
                let newValue = Math.max(0.1, Math.min(10.0, currentVal + direction * step));

                this.cascade.animationSpeed = newValue;
                speedValue.textContent = newValue.toFixed(1);
                audio.playClick();
            }, { passive: false });
        }

        const unlimitedTime = document.getElementById('unlimited-time');

        // Zen mode: Previous Level
        document.getElementById('btn-prev-level').addEventListener('click', () => {
            if (this.game.mode === 'zen') {
                this.game.prevLevel();
                this.cascade.clearStages();
                this.stagesList.innerHTML = '';
                this.showBestSolution = false;
                const bestBtn = document.getElementById('best-solution');
                if (bestBtn) { bestBtn.classList.remove('active'); bestBtn.textContent = '★ Best Solution'; }
                document.getElementById('btn-next-level').disabled = !this.game.zenLevelsPassed[this.game.round - 1];
                this.render();
                audio.playClick();
            }
        });

        // Zen mode: Next Level (only enabled after passing)
        document.getElementById('btn-next-level').addEventListener('click', () => {
            if (this.game.mode === 'zen') {
                this.game.nextLevel();
                this.cascade.clearStages();
                this.stagesList.innerHTML = '';
                this.showBestSolution = false;
                const bestBtn = document.getElementById('best-solution');
                if (bestBtn) { bestBtn.classList.remove('active'); bestBtn.textContent = '★ Best Solution'; }
                document.getElementById('btn-next-level').disabled = !this.game.zenLevelsPassed[this.game.round - 1];
                this.render();
                audio.playClick();
            }
        });

        document.getElementById('btn-end-game').addEventListener('click', () => {
            if (this.game.mode === 'challenge') {
                this.game.endGame();
                this.showGameOver();
                audio.playClick();
            }
        });

        const MAX_STAGES = 5;

        document.getElementById('add-pole').addEventListener('click', () => {
            if (this.cascade.stages.length >= MAX_STAGES) {
                alert(`Maximum limit of ${MAX_STAGES} stages reached.`);
                return;
            }
            const stage = this.cascade.addStage(new FirstOrderLowPass(1.0));
            this.renderStageCard(stage);
            audio.playClick();
        });

        document.getElementById('add-biquad').addEventListener('click', () => {
            if (this.cascade.stages.length >= MAX_STAGES) {
                alert(`Maximum limit of ${MAX_STAGES} stages reached.`);
                return;
            }
            const stage = this.cascade.addStage(new SecondOrderLowPass(1.0, 0.707));
            this.renderStageCard(stage);
            audio.playClick();
        });

        document.getElementById('play-all').addEventListener('click', () => {
            this.cascade.playAll();
            audio.playClick();
        });

        document.getElementById('pause-all').addEventListener('click', () => {
            this.cascade.pauseAll();
            audio.playClick();
        });

        document.getElementById('reset-all').addEventListener('click', () => {
            this.cascade.clearStages();
            this.stagesList.innerHTML = '';
            audio.playClick();
        });

        document.getElementById('best-solution').addEventListener('click', () => {
            this.showBestSolution = !this.showBestSolution;
            const btn = document.getElementById('best-solution');
            btn.classList.toggle('active', this.showBestSolution);
            btn.textContent = this.showBestSolution ? '★ Hide Best' : '★ Best Solution';
            // Mark that best solution was used this round (15% penalty in challenge)
            if (this.showBestSolution) {
                this.game.usedBestSolution = true;
            }
            audio.playClick();
        });

        const hoverToggleBtn = document.getElementById('hover-stage-toggle');
        if (hoverToggleBtn) {
            hoverToggleBtn.addEventListener('click', () => {
                this.showHoveredStage = !this.showHoveredStage;
                hoverToggleBtn.classList.toggle('active', this.showHoveredStage);
                hoverToggleBtn.textContent = this.showHoveredStage ? '🔍 Hide Hover' : '🔍 View Hovered Stage';
                audio.playClick();
                this.render(); // immediately re-draw in case we are actively hovering
            });
        }

        // Mode toggle
        document.getElementById('btn-sandbox').addEventListener('click', () => {
            this.setMode('sandbox');
            audio.playClick();
        });

        document.getElementById('btn-zen').addEventListener('click', () => {
            this.setMode('zen');
            audio.playClick();
        });

        document.getElementById('btn-challenge').addEventListener('click', () => {
            this.setMode('challenge');
            audio.playClick();
        });

        document.getElementById('btn-leaderboard').addEventListener('click', () => {
            this.setMode('leaderboard');
            audio.playClick();
        });
        // High Score Submission
        const submitHighScore = async () => {
            const nameInput = document.getElementById('high-score-name');
            let playerName = nameInput.value.trim().toUpperCase();
            if (!playerName) playerName = 'ANONYMOUS';

            // Disable input while saving
            nameInput.disabled = true;

            // Final score should be captured from game state
            await this.game.saveScore(playerName, this.game.score);
            nameInput.value = '';
            nameInput.disabled = false;

            // Hide score entry UI and show restart/best buttons
            document.getElementById('high-score-entry').classList.add('hidden');
            document.getElementById('gameover-buttons').classList.remove('hidden');

            audio.playClick();
        };

        document.getElementById('btn-submit-score').addEventListener('click', submitHighScore);
        document.getElementById('high-score-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitHighScore();
        });

        // Popup Buttons
        document.getElementById('btn-popup-best').addEventListener('click', () => {
            this.showBestSolution = true;
            this.overlay.classList.add('viewing-best');
            audio.playClick();

            // Build the best solution stages mathematically
            const best = this.game.getBestSolutionStages();
            if (best) {
                this.cascade.clearStages();
                this.stagesList.innerHTML = '';

                for (const s of best.stages) {
                    const added = this.cascade.addStage(s);
                    this.renderStageCard(added);
                }
                this.cascade.globalGainDb = best.globalGainDb;
                this.updateParameterDisplays();
            }
        });

        document.getElementById('btn-popup-restart').addEventListener('click', () => {
            document.getElementById('controls-area').classList.remove('interaction-locked');
            this.overlay.classList.remove('hidden', 'viewing-best');
            this.gameoverPopup.classList.add('hidden');

            const globalGainSlider = document.getElementById('global-gain-slider');
            if (globalGainSlider) globalGainSlider.disabled = false;

            this.cascade.clearStages();
            this.stagesList.innerHTML = '';

            // Show challenge start screen rather than jumping straight in, unless Zen
            const isZen = this.game.subMode === 'zen';
            this.game.startChallenge(isZen ? 'zen' : 'hardcore');

            // Reset Best Solution state for the new round
            this.showBestSolution = false;
            const bestSolutionBtn = document.getElementById('best-solution');
            if (bestSolutionBtn) {
                bestSolutionBtn.classList.remove('active');
                bestSolutionBtn.textContent = '★ Best Solution';
            }

            if (isZen) {
                this.game.startRound();
            } else {
                document.getElementById('challenge-start-popup').classList.remove('hidden');
            }
            audio.playClick();
        });

        // Zen Coal Popup Button
        const btnCloseCoal = document.getElementById('btn-close-zen-coal');
        if (btnCloseCoal) {
            btnCloseCoal.addEventListener('click', () => {
                document.getElementById('zen-coal-popup').classList.add('hidden');
                this.overlay.classList.add('hidden');
                audio.playClick();
            });
        }

        // Challenge Start Buttons
        const startChallengeBtn = document.getElementById('btn-start-challenge');
        if (startChallengeBtn) {
            startChallengeBtn.addEventListener('click', () => {
                document.getElementById('challenge-start-popup').classList.add('hidden');
                this.overlay.classList.add('hidden');

                // Hide Prev/Next buttons during normal Challenge
                const prevBtn = document.getElementById('btn-prev-level');
                if (prevBtn) prevBtn.style.display = 'none';
                const nextBtn = document.getElementById('btn-next-level');
                if (nextBtn) nextBtn.style.display = 'none';

                // Reset Best Solution state
                this.showBestSolution = false;
                const bestBtn = document.getElementById('best-solution');
                if (bestBtn) {
                    bestBtn.classList.remove('active');
                    bestBtn.textContent = '★ Best Solution';
                }

                this.game.startChallenge('hardcore');
                this.game.startRound();
                audio.playClick();
            });
        }

        // Secret code to skip level for Devs (Up, Up, Down, Down)
        let secretCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];
        let secretIndex = 0;
        document.addEventListener('keydown', (e) => {
            if (e.key === secretCode[secretIndex]) {
                secretIndex++;
                if (secretIndex === secretCode.length) {
                    secretIndex = 0;
                    console.log("Dev skip activated!");
                    if (this.game.mode === 'challenge' && this.game.subMode === 'hardcore') {
                        this.showVictory();
                    } else if (this.game.mode === 'zen') {
                        this.game.completeRound(this.cascade, () => { });
                        const nextBtn = document.getElementById('btn-next-level');
                        if (nextBtn && this.game.round < ZEN_LEVELS.length) nextBtn.disabled = false;
                        this.game.updateHUD();
                    }
                }
            } else {
                secretIndex = 0;
            }
        });

        // ── Save / Load Design ────────────────────────────────────────────────
        document.getElementById('btn-save-design').addEventListener('click', () => {
            const design = {
                version: 1,
                globalGainDb: this.cascade.globalGainDb,
                stages: this.cascade.stages.map(s => {
                    if (s.type === 'pole') {
                        return { type: 'pole', f0: s.f0.value };
                    } else {
                        return { type: 'biquad', f0: s.f0.value, Q: s.Q.value };
                    }
                })
            };

            const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'neandertool-design.json';
            a.click();
            URL.revokeObjectURL(url);
            audio.playClick();
        });

        document.getElementById('btn-load-design').addEventListener('click', () => {
            document.getElementById('file-upload-input').click();
        });

        document.getElementById('file-upload-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const design = JSON.parse(evt.target.result);

                    if (!design.stages || !Array.isArray(design.stages)) {
                        throw new Error('Invalid design file: missing stages array.');
                    }
                    if (design.stages.length > 5) {
                        throw new Error('Design has more than 5 stages.');
                    }

                    this.cascade.clearStages();
                    this.stagesList.innerHTML = '';

                    if (typeof design.globalGainDb === 'number') {
                        this.cascade.globalGainDb = design.globalGainDb;
                    }

                    for (const s of design.stages) {
                        let stage;
                        if (s.type === 'pole') {
                            stage = new FirstOrderLowPass(s.f0 ?? 1.0);
                        } else if (s.type === 'biquad') {
                            stage = new SecondOrderLowPass(s.f0 ?? 1.0, s.Q ?? 0.707);
                        } else {
                            continue;
                        }
                        const added = this.cascade.addStage(stage);
                        this.renderStageCard(added);
                    }

                    this.updateParameterDisplays();
                    document.getElementById('message-area').textContent = `Design loaded: ${file.name}`;
                    audio.playClick();
                } catch (err) {
                    document.getElementById('message-area').textContent = `Load failed: ${err.message}`;
                }

                e.target.value = '';
            };
            reader.readAsText(file);
        });

        // Handle window resize for canvases
        window.addEventListener('resize', () => {
            if (this.resizeTimeout) {
                clearTimeout(this.resizeTimeout);
            }
            this.resizeTimeout = setTimeout(() => {
                this.plot.setupCanvas();
                if (this.pzmap) this.pzmap.setupCanvas();
                this.render();
            }, 100);
        });
    }

    renderStageCard(stage) {
        const card = document.createElement('div');
        card.className = 'stage-card';
        card.id = `stage-${stage.id}`;

        const header = document.createElement('div');
        header.className = 'stage-header';
        header.innerHTML = `
            <span>${stage.type === 'pole' ? '1st Order Pole' : '2nd Order Biquad'}</span>
            <button class="remove-btn" data-id="${stage.id}">×</button>
        `;

        card.appendChild(header);

        // Parameter controls inline grouping
        const paramsContainer = document.createElement('div');
        paramsContainer.className = 'stage-params';

        for (const param of stage.getParameters()) {
            const isF0 = param === stage.f0;
            const paramControl = this.createParameterControl(param, stage, isF0);
            paramsContainer.appendChild(paramControl);
        }

        card.appendChild(paramsContainer);

        this.stagesList.appendChild(card);

        // Remove button handler
        card.querySelector('.remove-btn').addEventListener('click', (e) => {
            const id = parseInt(e.target.dataset.id);
            this.cascade.removeStage(id);
            if (this.currentlyHoveredStageId === id) this.currentlyHoveredStageId = null;
            card.remove();
            audio.playClick();
        });

        // Hover stage handler
        card.addEventListener('mouseenter', () => {
            this.currentlyHoveredStageId = stage.id;
            if (this.showHoveredStage) this.render();
        });

        card.addEventListener('mouseleave', () => {
            if (this.currentlyHoveredStageId === stage.id) {
                this.currentlyHoveredStageId = null;
                if (this.showHoveredStage) this.render();
            }
        });
    }

    formatParameterValue(val, isF0) {
        if (isF0) {
            // Drop to 1 decimal place if frequency is >= 10.0kHz to save space
            return val >= 10.0 ? val.toFixed(1) : val.toFixed(2);
        } else {
            // Q factor uses 3 decimal places, except when at max (10.0) where it uses 2
            return val >= 10.0 ? val.toFixed(2) : val.toFixed(3);
        }
    }

    createParameterControl(param, stage, isF0) {
        const container = document.createElement('div');
        container.className = 'param-control';

        const label = isF0 ? 'f₀' : 'Q';
        const unit = isF0 ? 'kHz' : '';
        const step = isF0 ? 0.05 : 0.05;

        container.innerHTML = `
            <div class="param-top-row">
                <label>${label}:
                    <span class="param-value" title="Scroll to adjust">${this.formatParameterValue(param.value, isF0)}</span>${unit ? `<span class="param-unit">${unit}</span>` : ''}
                </label>
                <input type="range" class="param-slider"
                       min="${param.min}" max="${param.max}"
                       value="${param.value}" step="${isF0 ? 0.01 : 0.01}">
                <button class="play-btn" title="Animate ±20%">${param.isAnimating ? '⏸' : '▶'}</button>
            </div>
        `;

        const slider = container.querySelector('.param-slider');
        const valueSpan = container.querySelector('.param-value');
        const playBtn = container.querySelector('.play-btn');

        // ------ Slider (visible in Sandbox mode) ------
        slider.addEventListener('input', () => {
            param.value = parseFloat(slider.value);
            valueSpan.textContent = this.formatParameterValue(param.value, isF0);
        });

        // ------ Scroll wheel (active on hover over the value span) ------
        valueSpan.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // deltaY > 0 = scroll down = decrease
            const direction = e.deltaY > 0 ? -1 : 1;
            const delta = direction * step * this.scrollSensitivity;

            // Allow infinite scrolling, just scale the bounds dynamically
            let nextVal = param.value + delta;
            if (!isF0) nextVal = Math.min(nextVal, 20.0);

            param.value = Math.max(0.01, nextVal); // Prevent ≤ 0
            param.autoRange();

            if (!isF0 && param.max > 20.0) {
                param.max = 20.0;
            }

            // Keep slider in sync
            slider.min = param.min;
            slider.max = param.max;
            slider.value = param.value;
            valueSpan.textContent = this.formatParameterValue(param.value, isF0);

            audio.playClick();
        }, { passive: false });

        playBtn.addEventListener('click', () => {
            if (param.isAnimating) {
                param.stopAnimation();
                playBtn.textContent = '▶';
            } else {
                param.startAnimation();
                playBtn.textContent = '⏸';
            }
            audio.playClick();
        });

        // Store reference for animation updates
        param._slider = slider;
        param._valueSpan = valueSpan;
        param._isF0 = isF0;

        return container;
    }

    updateParameterDisplays() {
        // Sync global gain UI
        const gainSlider = document.getElementById('global-gain-slider');
        const gainValue = document.getElementById('global-gain-value');
        if (gainSlider && gainValue) {
            gainSlider.value = this.cascade.globalGainDb;
            gainValue.textContent = this.cascade.globalGainDb.toFixed(1);
        }

        for (const stage of this.cascade.stages) {
            for (const param of stage.getParameters()) {
                if (param._slider && param._valueSpan) {
                    param._slider.value = param.value;
                    param._valueSpan.textContent = this.formatParameterValue(param.value, param._isF0);
                }
            }
        }
    }

    setMode(mode) {
        document.getElementById('controls-area').classList.remove('interaction-locked');

        // Reset toggles globally when changing window context
        this.showBestSolution = false;
        const bestBtn = document.getElementById('best-solution');
        if (bestBtn) {
            bestBtn.classList.remove('active');
            bestBtn.textContent = '★ Best Solution';
        }

        this.showHoveredStage = false;
        const hoverBtn = document.getElementById('hover-stage-toggle');
        if (hoverBtn) {
            hoverBtn.classList.remove('active');
            hoverBtn.textContent = '🔍 View Hovered Stage';
        }

        // Only clear the board if actually changing modes
        if (this.game.mode !== mode) {
            this.cascade.clearStages();
            this.stagesList.innerHTML = '';
        }

        // Halt interval ticking to stop sound leaks
        if (this.game.timerInterval) {
            clearInterval(this.game.timerInterval);
        }

        this.game.mode = mode;

        document.getElementById('btn-sandbox').classList.toggle('active', mode === 'sandbox');
        document.getElementById('btn-zen').classList.toggle('active', mode === 'zen');
        document.getElementById('btn-challenge').classList.toggle('active', mode === 'challenge');
        document.getElementById('btn-leaderboard').classList.toggle('active', mode === 'leaderboard');

        // Timer HUD visibility
        document.getElementById('challenge-hud').classList.toggle('hidden', mode === 'sandbox' || mode === 'leaderboard');

        // Toggle classes on game container for CSS-driven visibility
        const container = document.getElementById('game-container');
        // Treat both Zen and Challenge identically for CSS card geometry hiding (115px, hidden tools)
        container.classList.toggle('challenge-mode', mode === 'challenge' || mode === 'zen');
        container.classList.toggle('leaderboard-mode', mode === 'leaderboard');

        if (mode === 'challenge') {
            document.getElementById('btn-prev-level').style.display = 'none';
            document.getElementById('btn-next-level').style.display = 'none';
            document.getElementById('btn-end-game').style.display = '';
            document.getElementById('reset-all').style.display = '';
            this.game.startChallenge('hardcore');
            this.overlay.classList.remove('hidden');
            document.getElementById('challenge-start-popup').classList.remove('hidden');
            document.getElementById('message-area').textContent = 'Challenge started! Match the target response.';
        } else if (mode === 'zen') {
            document.getElementById('btn-prev-level').style.display = '';
            document.getElementById('btn-next-level').style.display = '';
            document.getElementById('btn-end-game').style.display = 'none';
            document.getElementById('reset-all').style.display = '';
            // Hide the overlay so it doesn't block interactions
            this.overlay.classList.add('hidden');
            document.getElementById('challenge-start-popup').classList.add('hidden');
            this.game.startChallenge('zen');
            this.game.startRound(); // Auto-start the level directly without asking

            // Unlock "Next" if the first level was already passed in this session
            document.getElementById('btn-next-level').disabled = !this.game.zenLevelsPassed[0];
            document.getElementById('message-area').textContent = 'Zen Mode: Build at your own pace.';
        } else if (mode === 'leaderboard') {
            this.game.constraints = null;
            document.getElementById('message-area').textContent = 'HALL OF FAME';
            this.renderLeaderboard();
        } else {
            this.game.constraints = null;
            document.getElementById('message-area').textContent = 'Sandbox Mode. Build freely.';
        }
    }

    render() {
        // If the game is paused for a popup, freeze rendering logic but keep drawing the graph
        if (this.game.isPaused) {
            const bestSol = this.showBestSolution
                ? this.game.getBestSolution(this.plot.freqMin, this.plot.freqMax)?.response
                : null;

            let hoveredResponse = null;
            if (this.showHoveredStage && this.currentlyHoveredStageId !== null) {
                const stage = this.cascade.stages.find(s => s.id === this.currentlyHoveredStageId);
                if (stage) hoveredResponse = stage.getFrequencyResponse(this.plot.freqMin, this.plot.freqMax);
            }

            // bestSolution stages for the PZMap
            let bestStages = null;
            if (this.showBestSolution) {
                const b = this.game.getBestSolutionStages();
                if (b) bestStages = b.stages;
            }

            this.plot.render(this.cascade, this.game.constraints, bestSol, this.showBestSolution, hoveredResponse);
            this.pzmap.render(this.cascade, this.game.constraints, this.currentlyHoveredStageId, this.showBestSolution, bestStages);
            return;
        }

        const bestSol = (this.game.mode === 'challenge' || this.game.mode === 'zen') && this.showBestSolution
            ? this.game.getBestSolution(this.plot.freqMin, this.plot.freqMax)?.response
            : null;

        let bestStages = null;
        if ((this.game.mode === 'challenge' || this.game.mode === 'zen') && this.showBestSolution) {
            const b = this.game.getBestSolutionStages();
            if (b) bestStages = b.stages;
        }

        let hoveredResponse = null;
        if (this.showHoveredStage && this.currentlyHoveredStageId !== null) {
            const stage = this.cascade.stages.find(s => s.id === this.currentlyHoveredStageId);
            if (stage) hoveredResponse = stage.getFrequencyResponse(this.plot.freqMin, this.plot.freqMax);
        }

        // First draw
        this.plot.render(this.cascade, this.game.constraints, bestSol, this.showBestSolution, hoveredResponse);
        this.pzmap.render(this.cascade, this.game.constraints, this.currentlyHoveredStageId, this.showBestSolution, bestStages);

        // Then evaluate challenge logic
        if ((this.game.mode === 'challenge' || this.game.mode === 'zen') && this.game.constraints && !this.game.isPaused) {
            if (this.game.isGameOver) {
                this.showGameOver();
            } else if (this.game.checkConstraints(this.cascade)) {
                if (this.game.subMode === 'hardcore') {
                    this.showVictory();
                } else if (this.game.subMode === 'zen' && !this.game.zenCurrentPassed) {
                    // Zen mode: play CLING sound, stop timer, mark level passed
                    this.game.completeRound(this.cascade, () => { });
                    audio.playRoundComplete();

                    // Enable Next Level button
                    const nextBtn = document.getElementById('btn-next-level');
                    if (this.game.round < ZEN_LEVELS.length) {
                        nextBtn.disabled = false;
                    }

                    // Check if all levels are complete → coal popup!
                    if (this.game.allZenLevelsComplete()) {
                        setTimeout(() => {
                            this.showZenCoalPopup();
                        }, 500);
                    }

                    this.game.updateHUD();
                }
            }
        }
    }

    showVictory() {
        document.getElementById('controls-area').classList.add('interaction-locked');
        this.game.completeRound(this.cascade, (score) => {
            this.overlay.classList.remove('hidden');
            this.victoryPopup.classList.remove('hidden');
            document.getElementById('victory-message').textContent = `Round Score: ${score}`;

            let count = 3;
            const countEl = document.getElementById('victory-countdown');
            countEl.textContent = count;

            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    countEl.textContent = count;
                    audio.playTick(1.0);
                } else {
                    clearInterval(interval);
                    document.getElementById('controls-area').classList.remove('interaction-locked');
                    this.overlay.classList.add('hidden');
                    this.victoryPopup.classList.add('hidden');
                    this.cascade.clearStages();
                    this.stagesList.innerHTML = '';

                    // Reset Best Solution state for the new round
                    this.showBestSolution = false;
                    const bestBtn = document.getElementById('best-solution');
                    if (bestBtn) {
                        bestBtn.classList.remove('active');
                        bestBtn.textContent = '★ Best Solution';
                    }

                    this.game.proceedToNextRound();
                }
            }, 1000);
        });
    }

    showGameOver() {
        document.getElementById('controls-area').classList.add('interaction-locked');
        this.game.gameOver(async (score, rounds) => {
            this.overlay.classList.remove('hidden');
            this.gameoverPopup.classList.remove('hidden');
            document.getElementById('gameover-message').textContent =
                `Final Score: ${score} | Rounds: ${rounds}`;

            const entryDiv = document.getElementById('high-score-entry');
            const btnsDiv = document.getElementById('gameover-buttons');
            const loadingDiv = document.getElementById('gameover-loading');

            // Show loading state while awaiting API
            entryDiv.classList.add('hidden');
            btnsDiv.classList.add('hidden');
            if (loadingDiv) loadingDiv.classList.remove('hidden');

            const isHigh = await this.game.isHighScore(score);

            if (loadingDiv) loadingDiv.classList.add('hidden');

            if (isHigh) {
                entryDiv.classList.remove('hidden');
                document.getElementById('high-score-name').focus();
            } else {
                btnsDiv.classList.remove('hidden');
            }
        });
    }

    showZenCoalPopup() {
        this.overlay.classList.remove('hidden');
        const popup = document.getElementById('zen-coal-popup');
        if (popup) {
            popup.classList.remove('hidden');
            // Hide other popups just in case
            this.gameoverPopup.classList.add('hidden');
            this.victoryPopup.classList.add('hidden');
            document.getElementById('challenge-start-popup').classList.add('hidden');
        }
    }

    async renderLeaderboard() {
        const tbody = document.getElementById('leaderboard-body');
        if (!tbody) return;

        // Show loading state while awaiting API
        tbody.innerHTML = `<tr><td colspan="4" style="color: var(--font-gray); text-align: center;">LOADING...</td></tr>`;

        const lb = await this.game.getLeaderboard();

        tbody.innerHTML = ''; // clear exiting rows

        if (lb.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="4" style="color: var(--font-gray);">NO RECORDS FOUND</td>`;
            tbody.appendChild(tr);
            return;
        }

        lb.forEach((entry, i) => {
            const tr = document.createElement('tr');
            // Safe rank formatting based on 1-index
            const rank = (i + 1).toString() + (i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th');

            tr.innerHTML = `
                <td>${rank}</td>
                <td>${entry.name}</td>
                <td>${entry.score.toLocaleString()}</td>
                <td>${entry.date}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    init() {
        console.log('UI Initialized');
    }
}
