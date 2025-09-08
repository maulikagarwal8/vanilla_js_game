const ASSET_PATHS = {
    platform: './img/platform.png',
    platformSmall: './img/platformsmalltall.png',
    bg: './img/background.png',
    hills: './img/hills.png',
    runRight: './img/spriterunRight.png',
    runLeft: './img/spriteRunLeft.png',
    idleRight: './img/spriteStandRight.png',
    idleLeft: './img/spriteStandLeft.png'
};

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
    });
}

const assets = {};

// ---------------------------
// Canvas + HUD
// ---------------------------
const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const fpsEl = document.getElementById('fps');
const loadingEl = document.getElementById('loading');

// ---------------------------
// Math helpers
// ---------------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------
// Classes
// ---------------------------
class SpriteSheet {
    constructor(image, frames = 30) {
        this.image = image;
        this.frames = frames; // total frames on the sheet (row = 1)
        this.frameW = image.width / frames; // may be fractional; drawImage accepts float cropping
        this.frameH = image.height;
    }
}

class Player {
    constructor(x, y, sheets) {
        this.speed = 6; // horizontal movement speed
        this.position = { x, y };
        this.velocity = { x: 0, y: 0 };
        this.width = 66;   // collision/draw width (scaled)
        this.height = 150; // collision/draw height (scaled)

        // animation state
        this.sheets = sheets; // { idleLeft, idleRight, runLeft, runRight }
        this.facing = 'right';
        this.state = 'idle'; // 'idle' | 'run'
        this.sheet = this.sheets.idleRight;
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.animFps = 12; // animation frames per second

        this.lastDirection = "right";

        this.onGround = false; // updated via collisions
    }

    setAnimation(anim) {
        if (this.sheet !== anim) {
            this.sheet = anim
            this.frameIndex = 0
            this.frameTimer = 0
        }
    }

    update(dtMs) {
        this.position.x += this.velocity.x
        this.position.y += this.velocity.y

        if (this.position.y + this.height + this.velocity.y <= canvas.height) {
            this.velocity.y += gravity
        }

        // Animation control
        if (this.velocity.x > 0) {
            this.setAnimation(this.sheets.runRight)
            this.lastDirection = "right"
        }
        else if (this.velocity.x < 0) {
            this.setAnimation(this.sheets.runLeft)
            this.lastDirection = "left"
        }
        else {
            if (this.lastDirection === "right") this.setAnimation(this.sheets.idleRight)
            else this.setAnimation(this.sheets.idleLeft)
        }

        // Frame handling
        this.frameTimer++
        if (this.frameTimer >= this.animFps) {
            this.frameIndex++
            this.frameTimer = 0
        }
        if (this.frameIndex >= this.sheet.frames) this.frameIndex = 0

        this.draw()
    }

    draw() {
        const img = this.sheet.image;
        const fw = this.sheet.frameW;
        const fh = this.sheet.frameH;
        const sx = this.frameIndex * fw; // crop start x for current frame
        const sy = 0;
        const sw = fw;
        const sh = fh;
        const dx = this.position.x;
        const dy = this.position.y;
        const dw = this.width;
        const dh = this.height;

        c.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }
}

class Enemy {
    constructor(x, y) {
        this.width = 40
        this.height = 40
        this.startX = x
        this.position = { x, y: y - this.height }
        this.velocity = { x: 1, y: 0 }
    }
    draw(c) {
        c.fillStyle = "red"
        c.fillRect(this.position.x, this.position.y, this.width, this.height)
    }
    update(c) {
        this.draw(c)
        this.position.x += this.velocity.x
        if (this.position.x < this.startX - 30 || this.position.x > this.startX + 200) {
            this.velocity.x *= -1 // patrol
        }
    }
}

class Platform {
    constructor({ x, y, image }) {
        this.position = { x, y };
        this.image = image;
        this.width = image.width;
        this.height = image.height;
    }
    draw() {
        c.drawImage(this.image, this.position.x, this.position.y);
    }
}

class ParallaxLayer {
    constructor({ x, y, image, ratio = 0.66 }) {
        this.position = { x, y };
        this.image = image; this.ratio = ratio;
        this.width = image.width; this.height = image.height;
    }
    draw() { c.drawImage(this.image, this.position.x, this.position.y); }
}

// ---------------------------
// Game state & helpers
// ---------------------------
let gravity = 1.2;
let player; // instance
let platforms = [];
let layers = [];
let keys = { left: false, right: false, up: false };
let scrollOffset = 0; // distance scrolled to the right (for scoring)
let lastTime = performance.now();
let gameWon = false;
const groundY = 470;
const worldLen = 36000; // total world length
let gameover = false

function resetGame() {
    // Parallax background layers
    layers = [
        new ParallaxLayer({ x: -1, y: -1, image: assets.bg, ratio: 0.33 }),
        new ParallaxLayer({ x: -1, y: -1, image: assets.hills, ratio: 0.66 })
    ];

    // Player
    const sheets = {
        idleRight: new SpriteSheet(assets.idleRight, 60),
        idleLeft: new SpriteSheet(assets.idleLeft, 60),
        runRight: new SpriteSheet(assets.runRight, 30),
        runLeft: new SpriteSheet(assets.runLeft, 30)
    };
    player = new Player(100, 100, sheets);

    // World
    platforms = generateRandomPlatforms();
    scrollOffset = 0;
    scoreEl.textContent = '0';
}

// ---------------------------
// Random platform generation
// ---------------------------
function generateRandomPlatforms() {
    const out = [];
    enemies = [];


    // stitch ground platforms together to form a floor
    let cursor = -1;
    while (cursor < worldLen) {
        out.push(new Platform({ x: cursor, y: groundY, image: assets.platform }));
        cursor += assets.platform.width - 3; // small overlap to remove seams
    }

    // sprinkle small platforms above ground for gameplay
    const smallCount = 70;
    for (let i = 0; i < smallCount; i++) {
        const px = 400 + Math.random() * (worldLen - 800);
        const py = groundY - (60 + Math.random() * 180); // between 60–240 px above ground
        out.push(new Platform({ x: px, y: py, image: assets.platformSmall }));
        enemies.push(new Enemy(px + 40, py))
    }

    // sort for deterministic draw order
    out.sort((a, b) => a.position.x - b.position.x);
    return out;
}

// ---------------------------
// Input
// ---------------------------
window.addEventListener('keydown', (e) => {
    if (gameover) {
        keys.left = false
        keys.right = false
        return
    }
    const k = e.key;
    if (k === 'a' || k === 'A') keys.left = true;
    if (k === 'd' || k === 'D') keys.right = true;
    if (k === 'w' || k === 'W') {
        // jump only if on the ground or on a platform
        if (player && player.onGround) {
            player.velocity.y = -20; // jump impulse
            player.onGround = false;
        }
    }
});

window.addEventListener('keyup', (e) => {
    if (gameover) return
    const k = e.key;
    if (k === 'a' || k === 'A') keys.left = false;
    if (k === 'd' || k === 'D') keys.right = false;
});

// ---------------------------
// Music (simple oscillator so no external files needed)
// ---------------------------
let audioCtx = null, osc = null, gain = null, musicOn = false;
const musicBtn = document.getElementById('musicBtn');
musicBtn.addEventListener('click', async () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gain = audioCtx.createGain();
        gain.gain.value = 0.03; // quiet background hum
        gain.connect(audioCtx.destination);
    }
    if (!musicOn) {
        osc = audioCtx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 110; // A2
        osc.connect(gain);
        osc.start();
        musicOn = true;
        musicBtn.textContent = 'Music: On';
    } else {
        if (osc) { osc.stop(); osc.disconnect(); }
        musicOn = false;
        musicBtn.textContent = 'Music: Off';
    }
});

document.getElementById('restartBtn').addEventListener('click', () => {
    resetGame();
});

function showWinScreen() {
    gameover = true
    const overlay = document.createElement("div")
    overlay.id = "winScreen"
    overlay.style.position = "absolute"
    overlay.style.top = "0"
    overlay.style.left = "0"
    overlay.style.width = "100%"
    overlay.style.height = "100%"
    overlay.style.background = "rgba(0,0,0,0.8)"
    overlay.style.display = "flex"
    overlay.style.flexDirection = "column"
    overlay.style.alignItems = "center"
    overlay.style.justifyContent = "center"
    overlay.style.color = "white"
    overlay.style.fontSize = "40px"
    overlay.innerHTML = `
        <p>🎉 YOU WIN! 🎉</p>
        <button onclick="restartGame()">Play Again</button>
    `
    document.body.appendChild(overlay)
}

function restartGame() {
    window.location.reload()
}

// ---------------------------
// Main game loop
// ---------------------------
function animate(now) {
    const dt = now - lastTime; // ms since last frame
    lastTime = now;

    // clear
    c.clearRect(0, 0, canvas.width, canvas.height);

    // parallax draw
    layers.forEach(layer => layer.draw());
    // horizontal movement intent
    player.velocity.x = 0;
    if (keys.right && player.position.x < 400) {
        // move player until 400px, then scroll world
        player.velocity.x = player.speed;
    } else if (keys.left && (player.position.x > 100 || (scrollOffset === 0 && player.position.x > 0))) {
        player.velocity.x = -player.speed;
    }

    // scroll world when player is in the "centered" band
    if (!keys.left && !keys.right) {
        player.velocity.x = 0; // no intent
    } else if (keys.right && player.position.x >= 400) {
        scrollOffset += player.speed;
        platforms.forEach(p => p.position.x -= player.speed);
        layers.forEach(layer => layer.position.x -= player.speed * 0.66);
        enemies.forEach(enemy => { enemy.position.x -= player.speed })
    } else if (keys.left && scrollOffset > 0 && player.position.x <= 100) {
        scrollOffset -= player.speed;
        platforms.forEach(p => p.position.x += player.speed);
        layers.forEach(layer => layer.position.x += player.speed * 0.66);
        enemies.forEach(enemy => { enemy.position.x += player.speed })
    }

    enemies.forEach(enemy => {
        enemy.update(c)

        // Collision check
        if (player.position.x < enemy.position.x + enemy.width &&
            player.position.x + player.width > enemy.position.x &&
            player.position.y < enemy.position.y + enemy.height &&
            player.position.y + player.height > enemy.position.y) {
            restartGame()
        }
    })

    // platform collision (top-only)
    player.onGround = false;
    platforms.forEach(platform => {
        const pTop = platform.position.y;
        const pLeft = platform.position.x;
        const pRight = platform.position.x + platform.width;
        const pBottom = platform.position.y + platform.height;

        // Axis-Aligned Bounding Box check (only top landing)
        const playerBottomNext = player.position.y + player.height + player.velocity.y;
        const playerBottomNow = player.position.y + player.height;
        const withinX = (player.position.x + player.width) > pLeft && player.position.x < pRight;
        const falling = player.velocity.y >= 0;

        if (falling && playerBottomNow <= pTop && playerBottomNext >= pTop && withinX) {
            // place on top
            player.velocity.y = 0;
            player.position.y = pTop - player.height;
            player.onGround = true;
        }
    });

    // update + draw entities
    player.update(dt);
    platforms.forEach(p => p.draw());
    player.draw();
    enemies.forEach(en => en.update(c));
    // HUD updates
    scoreEl.textContent = Math.max(0, Math.floor(scrollOffset / 10)).toString();
    // FPS (simple smoothing)
    fpsEl.textContent = (1000 / dt).toFixed(0);

    // win/lose checks
    if (!gameWon && scrollOffset > worldLen * 0.75) {
        gameWon = true
        showWinScreen()
    }
    if (player.position.y > canvas.height) {
        resetGame();
    }

    requestAnimationFrame(animate);
}

// ---------------------------
// Boot
// ---------------------------
(async function boot() {
    const entries = await Promise.all(
        Object.entries(ASSET_PATHS).map(async ([key, src]) => [key, await loadImage(src)])
    );
    entries.forEach(([k, img]) => (assets[k] = img));

    loadingEl.innerHTML = '<span class="ok">Assets loaded ✓</span>';
    setTimeout(() => loadingEl.remove(), 300);

    resetGame();
    lastTime = performance.now();
    requestAnimationFrame(animate);
})();