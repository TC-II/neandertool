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

        // Sparks where the curve violates the template
        this.sparks = [];
        this.sparkClock = performance.now();

        // HiDPI support
        this.setupCanvas();
    }

    /** Is a response point inside a forbidden region of the template? */
    _isForbidden(p, constraints) {
        const EPS = 1e-6;
        if (p.magnitudeDb > EPS) return true;
        const { passband: pb, stopband: sb } = constraints;
        if (pb && p.freq >= pb.freqMin && p.freq <= pb.freqMax && p.magnitudeDb < pb.dbMin) return true;
        if (sb && p.freq >= sb.freqMin && p.magnitudeDb > sb.dbMax) return true;
        return false;
    }

    _emitSpark(x, y, burst = false) {
        if (this.sparks.length > 200) return;
        const angle = Math.random() * Math.PI * 2;
        const speed = (burst ? 50 : 25) + Math.random() * (burst ? 90 : 35);
        this.sparks.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            maxLife: 0.12 + Math.random() * 0.2,
            hot: Math.random() < 0.5 // white-hot vs amber
        });
    }

    /**
     * Spawn mini sparks, sporadically: occasional small bursts where the curve
     * crosses into a forbidden region (the "touch" points) and a rare
     * crackle along the violating stretches.
     */
    emitSparks(response, constraints, dt) {
        const pts = [];
        for (const p of response) {
            const x = this.freqToX(p.freq);
            if (x < 0 || x > this.width) continue;
            pts.push({ x, y: this.dbToY(Math.min(this.dbMax, p.magnitudeDb)), bad: this._isForbidden(p, constraints) });
        }

        const burstRate = 2.5; // bursts per second per crossing point
        const crackleRate = 3; // single sparks per second along violating parts
        const chance = (rate) => Math.random() < rate * dt;

        const bad = [];
        for (let i = 0; i < pts.length; i++) {
            if (pts[i].bad) bad.push(pts[i]);
            if (i > 0 && pts[i].bad !== pts[i - 1].bad && chance(burstRate)) {
                const x = (pts[i].x + pts[i - 1].x) / 2;
                const y = (pts[i].y + pts[i - 1].y) / 2;
                for (let k = 2 + Math.floor(Math.random() * 4); k > 0; k--) this._emitSpark(x, y, true);
            }
        }
        if (bad.length && chance(crackleRate)) {
            const p = bad[Math.floor(Math.random() * bad.length)];
            this._emitSpark(p.x, p.y, false);
        }
    }

    /** Mini sparks: thin 1px streaks along their motion, fading fast */
    drawSparks(dt) {
        const ctx = this.ctx;
        const GRAVITY = 160;
        const STREAK = 0.025; // seconds of motion shown as the streak length
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        this.sparks = this.sparks.filter(s => {
            s.life += dt;
            if (s.life >= s.maxLife) return false;
            s.vy += GRAVITY * dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            const fade = 1 - s.life / s.maxLife;
            ctx.globalAlpha = fade;
            ctx.strokeStyle = s.hot ? '#fffbe6' : '#ffc14d';
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(s.x - s.vx * STREAK, s.y - s.vy * STREAK);
            ctx.stroke();
            return true;
        });
        ctx.restore();
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

    drawResponse(response, color = '#00ffff', lineWidth = 2, dash = []) {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(dash);
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
        ctx.setLineDash([]);
    }

    /**
     * Draw the filter template: the forbidden regions the curve must NOT enter.
     * All regions share the same red fill and solid red border.
     */
    drawConstraints(constraints) {
        const ctx = this.ctx;
        const W = this.width;
        const H = this.height;
        const y0 = this.dbToY(0);
        const clampX = (f) => Math.max(0, Math.min(W, this.freqToX(f)));

        const regions = [];

        // Above 0 dB (whole band), merged with the stopband region above -As
        if (constraints.stopband) {
            const xS = clampX(constraints.stopband.freqMin);
            const yS = this.dbToY(constraints.stopband.dbMax);
            regions.push([[0, 0], [W, 0], [W, yS], [xS, yS], [xS, y0], [0, y0]]);
        } else {
            regions.push([[0, 0], [W, 0], [W, y0], [0, y0]]);
        }

        // Passband: below -Ap
        if (constraints.passband) {
            const xP0 = clampX(constraints.passband.freqMin);
            const xP1 = clampX(constraints.passband.freqMax);
            const yP = this.dbToY(constraints.passband.dbMin);
            regions.push([[xP0, yP], [xP1, yP], [xP1, H], [xP0, H]]);
        }

        // An edge lying on the plot border is not a template limit: don't outline it
        const onBorder = (a, b) =>
            (a[0] <= 0 && b[0] <= 0) || (a[0] >= W && b[0] >= W) ||
            (a[1] <= 0 && b[1] <= 0) || (a[1] >= H && b[1] >= H);

        for (const poly of regions) {
            ctx.beginPath();
            ctx.moveTo(poly[0][0], poly[0][1]);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
            ctx.closePath();

            ctx.fillStyle = 'rgba(200, 90, 90, 0.1)';
            ctx.fill();

            // Thin -45° hatching clipped to the region
            ctx.save();
            ctx.clip();
            ctx.strokeStyle = 'rgba(200, 95, 95, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const spacing = 10;
            for (let c = -H; c < W; c += spacing) {
                ctx.moveTo(c, 0);
                ctx.lineTo(c + H, H);
            }
            ctx.stroke();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i];
                const b = poly[(i + 1) % poly.length];
                if (onBorder(a, b)) continue;
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
            }
            ctx.stroke();
        }
        ctx.lineWidth = 1;

        // Edge frequency labels
        ctx.fillStyle = '#d27d7d';
        ctx.font = '10px monospace';
        if (constraints.passband) {
            const pMax = constraints.passband.freqMax;
            ctx.fillText(pMax.toFixed(0) + ' kHz', this.freqToX(pMax) - 35, H - 15);
        }
        if (constraints.stopband) {
            const sMin = constraints.stopband.freqMin;
            ctx.fillText(sMin.toFixed(2) + ' kHz', this.freqToX(sMin) + 4, H - 15);
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

        const now = performance.now();
        const dt = Math.min(0.1, (now - this.sparkClock) / 1000);
        this.sparkClock = now;

        // No stages → nothing designed yet, don't draw the flat unity-gain line
        if (cascade.stages.length === 0) {
            this.sparks = [];
            return;
        }

        // Hovered individual stage: discreet gray dashed, under the main curve
        if (hoveredResponse) {
            this.drawResponse(hoveredResponse, 'rgba(170, 170, 170, 0.7)', 1.5, [6, 5]);
        }

        const response = cascade.getFrequencyResponse(this.freqMin, this.freqMax);

        // Pick curve color based on whether constraints are satisfied
        let curveColor = '#ffffff'; // default white
        if (constraints && this._checkConstraints(cascade, constraints)) {
            curveColor = '#4caf50'; // success-green
        }
        if (this.curveColorOverride) curveColor = this.curveColorOverride;

        this.drawResponse(response, curveColor, 2);

        if (constraints) this.emitSparks(response, constraints, dt);
        this.drawSparks(dt);
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

    xToRe(x) {
        return (x / this.width) * this.maxS * 1.2 - this.maxS;
    }

    yToIm(y) {
        return this.maxS - (y / this.height) * this.maxS * 2;
    }

    /**
     * Find the user pole under a canvas point (within a pixel hitbox).
     * Returns { stage, pole, index } or null.
     */
    pickPole(cascade, x, y, hitRadius = 10) {
        let best = null;
        let bestDist = hitRadius;
        for (const stage of cascade.stages) {
            if (!stage.active || typeof stage.getPoles !== 'function') continue;
            stage.getPoles().forEach((pole, index) => {
                const d = Math.hypot(this.sToX(pole.re) - x, this.sToY(pole.im) - y);
                if (d <= bestDist) {
                    bestDist = d;
                    best = { stage, pole, index };
                }
            });
        }
        return best;
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
        this.scrollSensitivity = 1.0; // Scroll sensitivity multiplier (adjustable by user)
        this.showBestSolution = false;

        this.showHoveredStage = true;
        this.currentlyHoveredStageId = null;
        this.hoveredCardStageId = null; // stage whose card is under the mouse

        this.intro = new IntroDemo();
        this.introActive = false;

        // Popup elements
        this.overlay = document.getElementById('popup-overlay');
        this.victoryPopup = document.getElementById('victory-popup');
        this.gameoverPopup = document.getElementById('gameover-popup');

        this.setupEventListeners();
        this.setupSensitivityControl();
        this.setupPoleDrag();
        this.setupCurveDrag();
    }

    /**
     * Grab the magnitude curve and drag it: vertical motion shifts the global
     * gain, horizontal motion scales every stage's f0 by the same ratio.
     */
    setupCurveDrag() {
        const plot = this.plot;
        const canvas = plot.canvas;
        const HIT_PX = 8;
        let drag = null;

        const toCanvas = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) / rect.width * plot.width,
                y: (e.clientY - rect.top) / rect.height * plot.height
            };
        };

        const isLocked = () =>
            this.zenLocked ||
            this.game.isPaused ||
            this.game.mode === 'leaderboard' ||
            document.getElementById('controls-area').classList.contains('interaction-locked');

        // Curve hit test: closest sampled point of the cascade response near the cursor
        const hitsCurve = (x, y) => {
            if (this.cascade.stages.length === 0) return false;
            for (let dx = -HIT_PX; dx <= HIT_PX; dx += 2) {
                const f = plot.xToFreq(x + dx);
                const db = Math.min(plot.dbMax, this.cascade.getMagnitudeDb(f));
                if (Math.hypot(dx, plot.dbToY(db) - y) <= HIT_PX) return true;
            }
            return false;
        };

        const setParam = (param, value) => {
            param.stopAnimation();
            param.value = value;
            param.autoRange();
            if (param._slider) {
                param._slider.min = param.min;
                param._slider.max = param.max;
            }
        };

        canvas.addEventListener('mousedown', (e) => {
            if (isLocked()) return;
            const { x, y } = toCanvas(e);
            if (!hitsCurve(x, y)) return;
            e.preventDefault();
            drag = {
                x0: x,
                y0: y,
                gain0: this.cascade.globalGainDb,
                f0s: this.cascade.stages.map(s => ({ param: s.f0, value: s.f0.value }))
            };
            canvas.classList.add('curve-drag');
        });

        window.addEventListener('mousemove', (e) => {
            const { x, y } = toCanvas(e);
            if (drag) {
                if (isLocked()) { drag = null; canvas.classList.remove('curve-drag'); return; }

                // Vertical → gain (dB per pixel from the plot scale)
                const dbPerPx = (plot.dbMax - plot.dbMin) / plot.height;
                const gain = drag.gain0 - (y - drag.y0) * dbPerPx;
                this.cascade.globalGainDb = Math.max(-46, Math.min(3, gain));

                // Horizontal → scale all f0 by the log-frequency ratio
                const ratio = plot.xToFreq(x) / plot.xToFreq(drag.x0);
                for (const { param, value } of drag.f0s) {
                    setParam(param, Math.max(0.01, value * ratio));
                }
                return;
            }
            if (e.target !== canvas) return;
            canvas.classList.toggle('curve-hover', !isLocked() && hitsCurve(x, y));
        });

        window.addEventListener('mouseup', () => {
            if (!drag) return;
            drag = null;
            canvas.classList.remove('curve-drag');
            audio.playClick();
        });

        canvas.addEventListener('mouseleave', () => canvas.classList.remove('curve-hover'));
    }

    /**
     * Drag poles on the PZ map. The conjugate follows automatically (the stage
     * is re-parametrised from the dragged pole), and poles are kept strictly in
     * the left half-plane (never on jω nor unstable).
     */
    setupPoleDrag() {
        const canvas = this.pzmap.canvas;
        const MAX_Q = 20.0;     // same cap as the Q scroll control
        const MIN_F0 = 0.01;
        const AXIS_SNAP_PX = 6; // snap to the real axis within this distance
        let drag = null;

        const toCanvas = (e) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) / rect.width * this.pzmap.width,
                y: (e.clientY - rect.top) / rect.height * this.pzmap.height
            };
        };

        const isLocked = () =>
            this.zenLocked ||
            this.game.isPaused ||
            document.getElementById('controls-area').classList.contains('interaction-locked');

        const setParam = (param, value) => {
            param.stopAnimation();
            param.value = value;
            param.autoRange();
            if (param._slider) {
                param._slider.min = param.min;
                param._slider.max = param.max;
            }
        };

        const applyDrag = (x, y) => {
            const { stage } = drag;
            let re = this.pzmap.xToRe(x);
            let im = Math.abs(this.pzmap.yToIm(y));
            if (Math.abs(y - this.pzmap.sToY(0)) <= AXIS_SNAP_PX) im = 0;

            // Stay strictly inside the left half-plane
            re = Math.min(re, -MIN_F0);

            if (stage.type === 'pole') {
                setParam(stage.f0, -re);
                return;
            }

            let f0, Q;
            if (im === 0 && drag.otherRealPole !== null) {
                // Two distinct real poles: move this one, keep the other fixed
                const p1 = -re, p2 = drag.otherRealPole;
                f0 = Math.sqrt(p1 * p2);
                Q = f0 / (p1 + p2);
            } else {
                // Complex pair (or double real pole when on the axis)
                f0 = Math.hypot(re, im);
                Q = f0 / (2 * -re);
            }

            if (Q > MAX_Q) Q = MAX_Q; // keeps the pair away from the jω axis
            setParam(stage.f0, Math.max(MIN_F0, f0));
            setParam(stage.Q, Q);
        };

        canvas.addEventListener('mousedown', (e) => {
            if (isLocked()) return;
            const { x, y } = toCanvas(e);
            const hit = this.pzmap.pickPole(this.cascade, x, y);
            if (!hit) return;
            e.preventDefault();

            // For a biquad with two distinct real poles, remember the one not grabbed
            let otherRealPole = null;
            if (hit.stage.type === 'biquad') {
                const poles = hit.stage.getPoles();
                if (poles[0].im === 0 && poles[0].re !== poles[1].re) {
                    otherRealPole = -poles[1 - hit.index].re;
                }
            }

            drag = { stage: hit.stage, otherRealPole };
            this.currentlyHoveredStageId = hit.stage.id;
            canvas.classList.add('pole-drag');
        });

        window.addEventListener('mousemove', (e) => {
            const { x, y } = toCanvas(e);
            if (drag) {
                if (isLocked()) { drag = null; canvas.classList.remove('pole-drag'); return; }
                applyDrag(x, y);
                return;
            }
            if (e.target !== canvas) return;
            const hit = isLocked() ? null : this.pzmap.pickPole(this.cascade, x, y);
            canvas.classList.toggle('pole-hover', !!hit);
            this.currentlyHoveredStageId = hit ? hit.stage.id : this.hoveredCardStageId;
        });

        window.addEventListener('mouseup', () => {
            if (!drag) return;
            drag = null;
            canvas.classList.remove('pole-drag');
            this.currentlyHoveredStageId = this.hoveredCardStageId;
            audio.playClick();
        });

        canvas.addEventListener('mouseleave', () => {
            canvas.classList.remove('pole-hover');
            if (!drag) this.currentlyHoveredStageId = this.hoveredCardStageId;
        });
    }

    setupSensitivityControl() {
        const slider = document.getElementById('scroll-sensitivity');
        const display = document.getElementById('sensitivity-value');
        if (!slider) return;

        const apply = () => {
            this.scrollSensitivity = parseFloat(slider.value);
            display.textContent = this.scrollSensitivity.toFixed(1) + '×';
        };
        slider.addEventListener('input', apply);

        // Scroll anywhere over the sensitivity box to adjust it
        document.getElementById('sensitivity-control').addEventListener('wheel', (e) => {
            e.preventDefault();
            const direction = e.deltaY > 0 ? -1 : 1;
            const step = parseFloat(slider.step);
            const next = Math.max(parseFloat(slider.min),
                Math.min(parseFloat(slider.max), parseFloat(slider.value) + direction * step));
            slider.value = next.toFixed(1);
            apply();
            audio.playClick();
        }, { passive: false });
    }

    setupEventListeners() {
        // Global Gain Control
        const gainSlider = document.getElementById('global-gain-slider');
        const gainValue = document.getElementById('global-gain-value');
        if (gainSlider && gainValue) {
            gainSlider.addEventListener('input', () => {
                this.cascade.globalGainDb = parseFloat(gainSlider.value);
            });

            // Scroll anywhere over the gain box (except the sandbox-only row)
            document.getElementById('global-gain-card').addEventListener('wheel', (e) => {
                if (e.target.closest('#sandbox-row')) return;
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

        // Zen mode: Previous / Next Level
        const changeZenLevel = (step) => {
            if (this.game.mode !== 'zen') return;
            if (step < 0) this.game.prevLevel(); else this.game.nextLevel();
            this.cascade.clearStages();
            this.stagesList.innerHTML = '';
            this.showBestSolution = false;
            const bestBtn = document.getElementById('best-solution');
            if (bestBtn) { bestBtn.classList.remove('active'); bestBtn.textContent = '★ Best Solution'; }
            this.setZenLocked(false);
            document.getElementById('message-area').textContent = `Zen Mode: Level ${this.game.round}.`;
            this.render();
            audio.playClick();
        };
        document.getElementById('btn-prev-level').addEventListener('click', () => changeZenLevel(-1));
        document.getElementById('btn-next-level').addEventListener('click', () => changeZenLevel(1));

        // Zen mode: Keep Exploring (unlock controls after passing; advance whenever)
        document.getElementById('btn-keep-exploring').addEventListener('click', () => {
            if (this.introActive) {
                this.endIntro();
                audio.playClick();
                return;
            }
            if (this.game.mode !== 'zen') return;
            this.setZenLocked(false);
            document.getElementById('message-area').textContent = 'Keep exploring. Press NEXT when ready.';
            audio.playClick();
        });

        // Hamburger mode menu
        const menuBtn = document.getElementById('btn-menu');
        const menu = document.getElementById('mode-selector');
        const setMenuOpen = (open) => {
            menu.classList.toggle('hidden', !open);
            menuBtn.setAttribute('aria-expanded', String(open));
        };
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setMenuOpen(menu.classList.contains('hidden'));
            audio.playClick();
        });
        menu.addEventListener('click', () => setMenuOpen(false));
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && e.target !== menuBtn) setMenuOpen(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setMenuOpen(false);
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

            this.loadBestSolution();
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
                    if (this.game.isPaused) return;
                    console.log("Dev skip activated!");
                    if (this.game.mode === 'challenge' && this.game.subMode === 'hardcore') {
                        this.loadBestSolution();
                        this.showVictory();
                    } else if (this.game.mode === 'zen') {
                        this.loadBestSolution();
                        this.game.completeRound(this.cascade, () => { });
                        this.setZenLocked(true);
                        this.celebrate();
                        this.game.updateHUD();
                    }
                }
            } else {
                secretIndex = 0;
            }
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
            <span>${stage.type === 'pole' ? '1st Order' : '2nd Order'}</span>
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
            if (this.hoveredCardStageId === id) this.hoveredCardStageId = null;
            card.remove();
            audio.playClick();
        });

        // Hover stage handler
        card.addEventListener('mouseenter', () => {
            this.hoveredCardStageId = stage.id;
            this.currentlyHoveredStageId = stage.id;
        });

        card.addEventListener('mouseleave', () => {
            if (this.hoveredCardStageId === stage.id) this.hoveredCardStageId = null;
            if (this.currentlyHoveredStageId === stage.id) this.currentlyHoveredStageId = null;
        });
    }

    /** Replace the current design with the optimal Chebyshev solution */
    loadBestSolution() {
        const best = this.game.getBestSolutionStages();
        if (!best) return;
        this.cascade.clearStages();
        this.stagesList.innerHTML = '';
        for (const s of best.stages) {
            this.renderStageCard(this.cascade.addStage(s));
        }
        this.cascade.globalGainDb = best.globalGainDb;
        this.updateParameterDisplays();
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

        // ------ Slider ------
        slider.addEventListener('input', () => {
            param.value = parseFloat(slider.value);
            valueSpan.textContent = this.formatParameterValue(param.value, isF0);
        });

        // On release, re-center the slider range around the new value so the
        // user can keep sliding past the previous ± tolerance window
        slider.addEventListener('change', () => {
            if (param.isAnimating) return;
            param.autoRange();
            if (!isF0 && param.max > 20.0) param.max = 20.0;
            slider.min = param.min;
            slider.max = param.max;
            slider.value = param.value;
        });

        // ------ Scroll wheel (anywhere over the parameter: value, label or slider) ------
        container.addEventListener('wheel', (e) => {
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

    /**
     * Zen mode: lock/unlock the design controls after passing a level and
     * refresh the Prev / Keep Exploring / Next buttons accordingly.
     */
    setZenLocked(locked) {
        this.zenLocked = locked;
        document.getElementById('controls-layout').classList.toggle('interaction-locked', locked);
        this.updateZenNav();
    }

    updateZenNav() {
        const passed = this.game.zenLevelsPassed[this.game.round - 1];
        const hasNext = this.game.round < ZEN_LEVELS.length;
        const nextBtn = document.getElementById('btn-next-level');
        nextBtn.disabled = !(passed && hasNext);
        nextBtn.classList.toggle('ready', passed && hasNext);
        nextBtn.classList.toggle('pulse', passed && hasNext && this.zenLocked);
        document.getElementById('btn-prev-level').disabled = this.game.round <= 1;
        document.getElementById('btn-keep-exploring').disabled = !this.zenLocked;
    }

    // ── Intro (attract mode) ─────────────────────────────────────────────

    /**
     * Start the intro demo: a template solved on its own by two 2nd-order
     * stages, looping until the player presses BEGIN.
     */
    startIntro() {
        this.introActive = true;

        // Freeze the Zen round underneath
        if (this.game.timerInterval) clearInterval(this.game.timerInterval);
        this.game.isPaused = true;
        this.game.constraints = IntroDemo.getConstraints();

        this.cascade.clearStages();
        this.stagesList.innerHTML = '';
        const stages = [
            this.cascade.addStage(new SecondOrderLowPass(1.0, 0.707)),
            this.cascade.addStage(new SecondOrderLowPass(1.0, 0.707))
        ];
        stages.forEach(s => this.renderStageCard(s));

        this.zenLocked = false;
        document.getElementById('controls-layout').classList.add('interaction-locked');
        const beginBtn = document.getElementById('btn-keep-exploring');
        beginBtn.textContent = '▶ BEGIN';
        beginBtn.classList.add('begin');
        beginBtn.disabled = false;
        document.getElementById('btn-prev-level').disabled = true;
        document.getElementById('btn-next-level').disabled = true;
        document.getElementById('message-area').textContent = 'Keep the curve out of the red zones. Press BEGIN to play!';

        this.intro.start(this.cascade, stages);
    }

    /** Leave the intro. If `startGame`, jump into Zen level 1. */
    endIntro(startGame = true) {
        if (!this.introActive) return;
        this.introActive = false;
        this.intro.stop();
        this.plot.curveColorOverride = null;

        const beginBtn = document.getElementById('btn-keep-exploring');
        beginBtn.textContent = 'Keep Exploring';
        beginBtn.classList.remove('begin');
        document.getElementById('controls-layout').classList.remove('interaction-locked');

        this.cascade.clearStages();
        this.stagesList.innerHTML = '';
        this.withMascot(m => m.hide());

        if (startGame) {
            this.setMode('zen');
            document.getElementById('message-area').textContent = 'Zen Mode: Level 1. Build at your own pace.';
        }
    }

    /** Called every frame from the main loop */
    updateIntro(dt) {
        if (!this.introActive) return;
        const meets = this.plot._checkConstraints(this.cascade, this.game.constraints);
        this.plot.curveColorOverride = this.intro.update(dt, meets);
    }

    /** Run a Mascot call only once its sprites are loaded; never break the game */
    withMascot(fn) {
        if (!this.mascotReady || typeof Mascot === 'undefined') return Promise.resolve();
        try {
            return Promise.resolve(fn(Mascot)).catch(err => console.warn('Mascot:', err));
        } catch (err) {
            console.warn('Mascot:', err);
            return Promise.resolve();
        }
    }

    /** Confetti + celebrating mascot. Resolves when the celebration ends. */
    celebrate() {
        return this.withMascot(m => m.celebrate(document.getElementById('game-container'), { durationMs: 2500 }));
    }

    setMode(mode) {
        if (this.introActive) this.endIntro(false);
        document.getElementById('controls-area').classList.remove('interaction-locked');
        this.zenLocked = false;
        document.getElementById('controls-layout').classList.remove('interaction-locked');

        // Reset toggles globally when changing window context
        this.showBestSolution = false;
        const bestBtn = document.getElementById('best-solution');
        if (bestBtn) {
            bestBtn.classList.remove('active');
            bestBtn.textContent = '★ Best Solution';
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
        const modeLabels = { zen: 'Zen', challenge: 'Challenge', sandbox: 'Sandbox', leaderboard: 'Leaderboard' };
        document.getElementById('current-mode-label').textContent = modeLabels[mode] || mode;

        // Timer HUD visibility
        document.getElementById('challenge-hud').classList.toggle('hidden', mode === 'sandbox' || mode === 'leaderboard');

        // Toggle classes on game container for CSS-driven visibility
        const container = document.getElementById('game-container');
        // Treat both Zen and Challenge identically for CSS card geometry hiding (115px, hidden tools)
        container.classList.toggle('challenge-mode', mode === 'challenge' || mode === 'zen');
        container.classList.toggle('leaderboard-mode', mode === 'leaderboard');

        if (mode === 'challenge') {
            document.getElementById('btn-prev-level').style.display = 'none';
            document.getElementById('btn-keep-exploring').style.display = 'none';
            document.getElementById('btn-next-level').style.display = 'none';
            document.getElementById('btn-end-game').style.display = '';
            this.game.startChallenge('hardcore');
            this.overlay.classList.remove('hidden');
            document.getElementById('challenge-start-popup').classList.remove('hidden');
            document.getElementById('message-area').textContent = 'Challenge started! Match the target response.';
        } else if (mode === 'zen') {
            document.getElementById('btn-prev-level').style.display = '';
            document.getElementById('btn-keep-exploring').style.display = '';
            document.getElementById('btn-next-level').style.display = '';
            document.getElementById('btn-end-game').style.display = 'none';
            // Hide the overlay so it doesn't block interactions
            this.overlay.classList.add('hidden');
            document.getElementById('challenge-start-popup').classList.add('hidden');
            this.game.startChallenge('zen');
            this.game.startRound(); // Auto-start the level directly without asking

            // Unlock "Next" if the first level was already passed in this session
            this.updateZenNav();
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
        // Add-stage buttons disappear once the stage limit is reached
        this.addButtons ??= document.getElementById('add-buttons');
        this.addButtons.classList.toggle('hidden', this.cascade.stages.length >= 5);

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

                    // Freeze the design and spotlight Next until the player chooses
                    this.setZenLocked(true);
                    this.celebrate();
                    document.getElementById('message-area').textContent =
                        this.game.round < ZEN_LEVELS.length
                            ? 'Level passed! NEXT to advance, or KEEP EXPLORING.'
                            : 'Final level passed!';

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
        // The popup overlay sits above the mascot, so celebrate first
        this.game.completeRound(this.cascade, async (score) => {
            await this.celebrate();
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

        const { entries, offline } = await this.game.getLeaderboard();

        tbody.innerHTML = ''; // clear exiting rows

        const addMessageRow = (text) => {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.style.color = 'var(--font-gray)';
            td.style.textAlign = 'center';
            td.textContent = text;
            tr.appendChild(td);
            tbody.appendChild(tr);
        };

        if (entries.length === 0) {
            addMessageRow(offline ? 'LEADERBOARD UNAVAILABLE' : 'NO RECORDS FOUND');
            return;
        }

        entries.forEach((entry, i) => {
            const tr = document.createElement('tr');
            // Safe rank formatting based on 1-index
            const rank = (i + 1).toString() + (i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th');

            [rank, entry.name, entry.score.toLocaleString(), entry.date].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        if (offline) addMessageRow('OFFLINE — SHOWING LAST KNOWN SCORES');
    }

    init() {
        console.log('UI Initialized');
    }
}
