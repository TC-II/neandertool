/**
 * Neandertool - Main Entry Point
 */

/**
 * Scale the whole UI to the available window. The layout is designed at
 * DESIGN_HEIGHT px tall (unzoomed); the zoom fills the window height, unless
 * that would make the layout narrower than MIN_WIDTH.
 */
const DESIGN_HEIGHT = 890;
const MIN_WIDTH = 1500;
const UI_GAP = 12; // visual px around the container (matches --ui-gap)

function fitToViewport() {
    // Hidden/unsized window (e.g. background tab): keep the last zoom
    if (window.innerWidth === 0 || window.innerHeight === 0) return;
    const zoom = Math.min(
        (window.innerHeight - 2 * UI_GAP) / DESIGN_HEIGHT,
        (window.innerWidth - 2 * UI_GAP) / MIN_WIDTH
    );
    document.documentElement.style.setProperty('--ui-zoom', Math.max(0.2, zoom).toFixed(4));
}

document.addEventListener('DOMContentLoaded', () => {
    // Size the UI before the canvases measure themselves
    fitToViewport();
    window.addEventListener('resize', fitToViewport);

    // Initialize systems
    const cascade = new FilterCascade();
    const game = new GameManager();
    const ui = new UIManager(cascade, game);

    ui.init();

    let lastTime = performance.now();

    // Main loop
    function loop(currentTime) {
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Intro demo drives the stage parameters while it runs
        ui.updateIntro(Math.min(deltaTime, 0.1));

        // Update animations
        cascade.updateAnimations(deltaTime);

        // Update parameter displays (sliders + value spans)
        ui.updateParameterDisplays();

        // Check constraints and render through UIManager
        ui.render();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    // Default to Zen mode, opening with the intro demo until the player presses BEGIN
    ui.setMode('zen');
    ui.startIntro();

    // Mascot: greet once its sprites are loaded
    if (typeof Mascot !== 'undefined') {
        Mascot.init({ version: '2' })
            .then(() => {
                ui.mascotReady = true;
                ui.withMascot(m => m.greet(document.getElementById('game-container')));
            })
            .catch(err => console.warn('Mascot init failed:', err));
    }
});
