/**
 * Neandertool - Intro Demo
 *
 * Attract-mode loop shown when the page opens: two 2nd-order stages wander
 * semi-randomly towards a solution of a demo template. When the template is
 * met the curve flashes green, holds for a moment, and the loop restarts.
 */

const INTRO_TEMPLATE = { wp: 1, ws: 2.5, Ap: 3, As: 24 };

// A known solution (4th-order Butterworth-like) the random walk converges to
const INTRO_TARGET = {
    gainDb: -0.2,
    stages: [
        { f0: 1.15, Q: 0.541 },
        { f0: 1.15, Q: 1.307 }
    ]
};

class IntroDemo {
    constructor() {
        this.active = false;
        this.cascade = null;
        this.stages = [];
    }

    static getConstraints() {
        const { wp, ws, Ap, As } = INTRO_TEMPLATE;
        return {
            passband: { freqMin: 0.1, freqMax: wp, dbMin: -Ap },
            stopband: { freqMin: ws, freqMax: 100, dbMax: -As },
            wp, ws, Ap, As,
            minOrder: 4
        };
    }

    start(cascade, stages) {
        this.cascade = cascade;
        this.stages = stages;
        this.active = true;
        this.reset();
    }

    stop() {
        this.active = false;
    }

    /**
     * Restart the loop: glide quickly (but continuously) from wherever the
     * parameters are to a random, clearly off-target point, then search again.
     */
    reset() {
        const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
        this.phase = 'scatter';
        this.step = 0;
        this.phaseTime = 0;

        const scattered = [rnd(-8, -1)];
        this.stages.forEach(() => scattered.push(rnd(0.35, 3.5), rnd(0.3, 3.0)));
        this.setSegment(this.readState(), scattered, 0.45);
    }

    setSegment(from, to, dur) {
        this.from = from;
        this.to = to;
        this.segTime = 0;
        this.segDur = dur;
        this.frameSliders(from, to);
    }

    /** Current parameter vector: [gain, f0a, Qa, f0b, Qb] */
    readState() {
        const v = [this.cascade.globalGainDb];
        for (const s of this.stages) v.push(s.f0.value, s.Q.value);
        return v;
    }

    targetState() {
        const v = [INTRO_TARGET.gainDb];
        for (const t of INTRO_TARGET.stages) v.push(t.f0, t.Q);
        return v;
    }

    writeState(v) {
        this.cascade.globalGainDb = v[0];
        this.stages.forEach((s, i) => {
            s.f0.value = v[1 + 2 * i];
            s.Q.value = v[2 + 2 * i];
        });
    }

    /**
     * Pick the next waypoint: move part of the way towards the target (in log
     * space for f0/Q) plus noise that shrinks as the search goes on.
     */
    nextWaypoint() {
        const from = this.readState();
        const target = this.targetState();
        const k = Math.min(1, 0.3 + this.step * 0.1);
        const noise = Math.max(0, 0.45 * (1 - this.step / 8));
        const randn = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.4;

        const to = from.map((c, i) => {
            if (i === 0) {
                // Gain in dB: linear approach
                return c + k * (target[0] - c) + noise * 2 * randn();
            }
            const lc = Math.log(c);
            const lt = Math.log(target[i]);
            return Math.exp(lc + k * (lt - lc) + noise * randn());
        });
        to[0] = Math.max(-12, Math.min(0, to[0]));

        this.setSegment(from, to, 0.55 + Math.random() * 0.45);
        this.step++;
    }

    /** Frame the sliders around a segment so the thumbs track the motion */
    frameSliders(from, to) {
        this.stages.forEach((s, i) => {
            [[s.f0, 1 + 2 * i], [s.Q, 2 + 2 * i]].forEach(([param, idx]) => {
                const lo = Math.min(from[idx], to[idx]);
                const hi = Math.max(from[idx], to[idx]);
                param.min = lo * 0.85;
                param.max = hi * 1.15;
                if (param._slider) {
                    param._slider.min = param.min;
                    param._slider.max = param.max;
                }
            });
        });
    }

    /**
     * Advance the animation. `meets` tells whether the template is met now.
     * Returns a curve color override (or null to use the default coloring).
     */
    update(dt, meets) {
        if (!this.active) return null;
        this.phaseTime += dt;

        if (this.phase === 'scatter' || this.phase === 'search') {
            if (this.phase === 'search' && meets) {
                this.phase = 'success';
                this.phaseTime = 0;
                return '#4caf50';
            }
            this.segTime += dt;
            const t = Math.min(1, this.segTime / this.segDur);
            const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
            this.writeState(this.from.map((a, i) => a + (this.to[i] - a) * e));
            if (t >= 1) {
                this.phase = 'search';
                this.nextWaypoint();
            }
            return null;
        }

        // Success: flash green, hold, then loop
        if (this.phaseTime < 1.2) {
            return Math.floor(this.phaseTime / 0.15) % 2 === 0 ? '#4caf50' : '#ffffff';
        }
        if (this.phaseTime < 3.0) return '#4caf50';

        this.reset();
        return null;
    }
}
