/**
 * Neandertool - DSP Engine
 * 
 * Implements filter stages (1st order poles, 2nd order biquads)
 * and cascade computation for frequency response.
 */

/**
 * AnimatedParameter - A parameter that can oscillate within a range
 */
class AnimatedParameter {
    constructor(value) {
        this.value = value;
        this.autoRange();
        this.isAnimating = false;
        this.phase = 0;  // 0 to 2π for oscillation
    }

    autoRange() {
        let tolerance = 0.2; // default 20%
        const tolSpan = document.getElementById('slider-tolerance-value');
        if (tolSpan) {
            tolerance = parseFloat(tolSpan.textContent) / 100;
        }

        // Enforce the sliders to cleanly frame ± tolerance around the nominal value.
        this.min = Math.max(0, this.value * (1 - tolerance));
        this.max = this.value * (1 + tolerance);
    }

    setRange(min, max) {
        this.min = Math.max(0, min);
        this.max = max;
        if (this.value < this.min) this.value = this.min;
        if (this.value > this.max) this.value = this.max;
    }

    update(deltaTime, speed) {
        if (!this.isAnimating) return;

        // Oscillate using sine wave
        this.phase += deltaTime * speed * 2 * Math.PI;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;

        // Map sine [-1, 1] to [min, max]
        const normalized = (Math.sin(this.phase) + 1) / 2;
        this.value = this.min + normalized * (this.max - this.min);
    }

    startAnimation() {
        this.isAnimating = true;
    }

    stopAnimation() {
        this.isAnimating = false;
    }
}

/**
 * FilterStage - Base class for filter stages
 */
class FilterStage {
    constructor(type) {
        this.type = type;
        this.id = FilterStage.nextId++;
        this.active = true;
    }

    static nextId = 1;

    /**
     * Get complex frequency response H(jω)
     * Returns {re, im} for the complex value
     */
    getResponse(omega) {
        return { re: 1, im: 0 };
    }

    /**
     * Get magnitude |H(jω)|
     */
    getMagnitude(omega) {
        const h = this.getResponse(omega);
        return Math.sqrt(h.re * h.re + h.im * h.im);
    }

    /**
     * Get magnitude in dB
     */
    getMagnitudeDb(omega) {
        const mag = this.getMagnitude(omega);
        return mag > 1e-10 ? 20 * Math.log10(mag) : -200;
    }

    /**
     * Generate an isolated frequency response array for plotting just this stage
     */
    getFrequencyResponse(freqMin, freqMax, numPoints = 500) {
        const response = [];
        const logMin = Math.log10(Math.max(0.001, freqMin));
        const logMax = Math.log10(freqMax);

        for (let i = 0; i <= numPoints; i++) {
            const logFreq = logMin + (i / numPoints) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);
            const omega = freq;

            response.push({
                freq,
                omega,
                magnitude: this.getMagnitude(omega),
                magnitudeDb: this.getMagnitudeDb(omega)
            });
        }

        return response;
    }
}

/**
 * FirstOrderLowPass - Single pole lowpass
 * H(s) = f₀ / (s + f₀)
 * H(jω) = f₀ / (jω + f₀)
 */
class FirstOrderLowPass extends FilterStage {
    constructor(f0 = 1.0) {
        super('pole');
        this.f0 = new AnimatedParameter(f0);
    }

    getResponse(omega) {
        const f0 = this.f0.value;
        // H(jω) = f₀ / (jω + f₀) = f₀ / (f₀ + jω)
        // = f₀(f₀ - jω) / (f₀² + ω²)
        const denom = f0 * f0 + omega * omega;
        return {
            re: f0 * f0 / denom,
            im: -f0 * omega / denom
        };
    }

    getParameters() {
        return [this.f0];
    }

    /**
     * Get s-plane pole coordinates
     */
    getPoles() {
        return [
            { re: -this.f0.value, im: 0 }
        ];
    }
}

/**
 * SecondOrderLowPass - Biquad lowpass
 * H(s) = f₀² / (s² + (f₀/Q)s + f₀²)
 * H(jω) = f₀² / (-ω² + j(f₀/Q)ω + f₀²)
 */
class SecondOrderLowPass extends FilterStage {
    constructor(f0 = 1.0, Q = 0.707) {
        super('biquad');
        this.f0 = new AnimatedParameter(f0);
        this.Q = new AnimatedParameter(Q);
    }

    getResponse(omega) {
        const f0 = this.f0.value;
        const Q = this.Q.value;

        // Denominator: (-ω² + f₀²) + j(f₀/Q)ω
        const realPart = f0 * f0 - omega * omega;
        const imagPart = (f0 / Q) * omega;
        const denomMagSq = realPart * realPart + imagPart * imagPart;

        const num = f0 * f0;

        return {
            re: (num * realPart) / denomMagSq,
            im: -(num * imagPart) / denomMagSq
        };
    }

    getParameters() {
        return [this.f0, this.Q];
    }

    /**
     * Get s-plane pole coordinates
     */
    getPoles() {
        const f0 = this.f0.value;
        const Q = this.Q.value;

        // Characteristic equation: s^2 + (f0/Q)s + f0^2 = 0
        // Roots: s = (-f0/Q ± sqrt((f0/Q)^2 - 4f0^2)) / 2

        const alpha = f0 / (2 * Q);
        const discriminant = (f0 * f0) / (4 * Q * Q) - f0 * f0;

        if (discriminant >= 0) {
            // Overdamped or critically damped (real poles)
            const sqrtDisc = Math.sqrt(discriminant);
            return [
                { re: -alpha + sqrtDisc, im: 0 },
                { re: -alpha - sqrtDisc, im: 0 }
            ];
        } else {
            // Underdamped (complex conjugate pair)
            const sqrtDisc = Math.sqrt(-discriminant);
            return [
                { re: -alpha, im: sqrtDisc },
                { re: -alpha, im: -sqrtDisc }
            ];
        }
    }
}

/**
 * FilterCascade - Chain of filter stages
 */
class FilterCascade {
    constructor() {
        this.stages = [];
        this.animationSpeed = 1.0;  // Oscillations per second
        this.globalGainDb = 0.0;    // Added global system gain
    }

    addStage(stage) {
        this.stages.push(stage);
        return stage;
    }

    removeStage(id) {
        this.stages = this.stages.filter(s => s.id !== id);
    }

    clearStages() {
        this.stages = [];
        this.globalGainDb = 0.0; // Reset gain on clear
    }

    /**
     * Get combined frequency response
     */
    getResponse(omega) {
        let re = 1, im = 0;

        for (const stage of this.stages) {
            if (!stage.active) continue;

            const h = stage.getResponse(omega);
            // Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
            const newRe = re * h.re - im * h.im;
            const newIm = re * h.im + im * h.re;
            re = newRe;
            im = newIm;
        }

        // Apply linear offset from logarithmic global gain
        const linearGain = Math.pow(10, this.globalGainDb / 20);
        return { re: re * linearGain, im: im * linearGain };
    }

    getMagnitude(omega) {
        const h = this.getResponse(omega);
        return Math.sqrt(h.re * h.re + h.im * h.im);
    }

    getMagnitudeDb(omega) {
        const mag = this.getMagnitude(omega);
        return mag > 1e-10 ? 20 * Math.log10(mag) : -200;
    }

    /**
     * Generate frequency response array for plotting
     */
    getFrequencyResponse(freqMin, freqMax, numPoints = 500) {
        const response = [];
        // Support normalized frequencies below 1 (e.g. 0.1 rad/s)
        const logMin = Math.log10(Math.max(0.001, freqMin));
        const logMax = Math.log10(freqMax);

        for (let i = 0; i <= numPoints; i++) {
            const logFreq = logMin + (i / numPoints) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);
            // In normalized space, freq IS omega. We don't convert to 2*PI*f.
            const omega = freq;

            response.push({
                freq,
                omega,
                magnitude: this.getMagnitude(omega),
                magnitudeDb: this.getMagnitudeDb(omega)
            });
        }

        return response;
    }

    /**
     * Update all animated parameters
     */
    updateAnimations(deltaTime) {
        for (const stage of this.stages) {
            for (const param of stage.getParameters()) {
                param.update(deltaTime, this.animationSpeed);
            }
        }
    }

    /**
     * Start all animations
     */
    playAll() {
        for (const stage of this.stages) {
            for (const param of stage.getParameters()) {
                param.startAnimation();
            }
        }
    }

    /**
     * Pause all animations
     */
    pauseAll() {
        for (const stage of this.stages) {
            for (const param of stage.getParameters()) {
                param.stopAnimation();
            }
        }
    }
}

/**
 * ChebyshevSolver - Calculates optimal Chebyshev Type I filter
 */
class ChebyshevSolver {
    /**
     * Calculate minimum order for given specs
     * @param {number} wp - Passband edge (rad/s)
     * @param {number} ws - Stopband edge (rad/s)
     * @param {number} Ap - Passband ripple (dB)
     * @param {number} As - Stopband attenuation (dB)
     */
    static getMinOrder(wp, ws, Ap, As) {
        const epsilon = Math.sqrt(Math.pow(10, Ap / 10) - 1);
        const A = Math.pow(10, As / 20);

        const ratio = ws / wp;
        const n = Math.acosh(Math.sqrt(A * A - 1) / epsilon) / Math.acosh(ratio);

        return Math.ceil(n);
    }

    /**
     * Get Chebyshev poles for given order and ripple
     */
    static getPoles(n, epsilon, wp) {
        const poles = [];
        const gamma = Math.asinh(1 / epsilon) / n;

        for (let k = 1; k <= n; k++) {
            const theta = Math.PI * (2 * k - 1) / (2 * n);
            const sigma = -wp * Math.sinh(gamma) * Math.sin(theta);
            const omega = wp * Math.cosh(gamma) * Math.cos(theta);
            poles.push({ sigma, omega });
        }

        return poles;
    }

    /**
     * Get frequency response of optimal Chebyshev filter
     */
    static getResponse(omega, n, epsilon, wp) {
        // |H(jω)|² = 1 / (1 + ε² * Tn²(ω/wp))
        // where Tn is Chebyshev polynomial

        const x = omega / wp;
        let Tn;

        if (x <= 1) {
            Tn = Math.cos(n * Math.acos(x));
        } else {
            Tn = Math.cosh(n * Math.acosh(x));
        }

        const magSq = 1 / (1 + epsilon * epsilon * Tn * Tn);
        return Math.sqrt(magSq);
    }

    /**
     * Generate full frequency response
     */
    static getFrequencyResponse(wp, ws, Ap, As, freqMin, freqMax, numPoints = 500) {
        const n = this.getMinOrder(wp, ws, Ap, As);
        const epsilon = Math.sqrt(Math.pow(10, Ap / 10) - 1);

        const response = [];
        // Support normalized frequencies below 1 (e.g. 0.1 rad/s)
        const logMin = Math.log10(Math.max(0.001, freqMin));
        const logMax = Math.log10(freqMax);

        for (let i = 0; i <= numPoints; i++) {
            const logFreq = logMin + (i / numPoints) * (logMax - logMin);
            const freq = Math.pow(10, logFreq);
            // In normalized space, freq IS omega. We don't convert to 2*PI*f.
            const omega = freq;
            const mag = this.getResponse(omega, n, epsilon, wp);

            response.push({
                freq,
                omega,
                magnitude: mag,
                magnitudeDb: mag > 1e-10 ? 20 * Math.log10(mag) : -200
            });
        }

        return { response, order: n, epsilon };
    }

    /**
     * Convert theoretical Chebyshev poles into tangible stage classes and compute required DC compensation gain.
     */
    static getBestSolutionStages(wp, ws, Ap, As) {
        const n = this.getMinOrder(wp, ws, Ap, As);
        const epsilon = Math.sqrt(Math.pow(10, Ap / 10) - 1);
        const poles = this.getPoles(n, epsilon, wp);

        const stages = [];
        // Complex conjugate pairs -> Second-order stages
        for (const p of poles) {
            if (p.omega > 1e-10) { // Only process one from the conjugate pair
                const f0 = Math.sqrt(p.sigma * p.sigma + p.omega * p.omega);
                const Q = f0 / (-2 * p.sigma);
                stages.push(new SecondOrderLowPass(f0, Q));
            }
        }

        // Real poles -> First-order stages
        for (const p of poles) {
            if (Math.abs(p.omega) <= 1e-10) { // Check for purely real poles
                const f0 = -p.sigma;
                stages.push(new FirstOrderLowPass(f0));
            }
        }

        // Chebyshev Type-I even order passes DC at -Ap dB. 
        // Biquads pass DC at 0dB. Therefore, to match Chebyshev precisely, we subtract Ap from global gain.
        let globalGainDb = 0;
        if (n % 2 === 0) {
            globalGainDb = -Ap;
        }

        return { stages, globalGainDb };
    }
}
