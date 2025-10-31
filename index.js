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
        img.onerror = reject;
    });
}

const assets = {};
const canvas = document.querySelector('canvas');
const c = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const fpsEl = document.getElementById('fps');
const loadingEl = document.getElementById('loading');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------
// SPRITESHEET
// ---------------------------------------------------
class SpriteSheet {
    constructor(image, frames = 30) {
        this.image = image;
        this.frames = frames;// total frames on the sheet (row = 1)
        this.frameW = image.width / frames;// may be fractional; drawImage accepts float cropping
        this.frameH = image.height;
    }
}

// ---------------------------------------------------
// PLAYER
// ---------------------------------------------------
class Player {
    constructor(x, y, sheets) {
        this.speed = 6;
        this.position = { x, y };
        this.velocity = { x: 0, y: 0 };

        this.width = 66;
        this.height = 150;

        this.sheets = sheets;
        this.sheet = sheets.idleRight;
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.animFps = 12;
        this.lastDirection = "right";

        this.onGround = false;// updated via collisions
    }

    setAnimation(anim) {
        if (this.sheet !== anim) {
            this.sheet = anim;
            this.frameIndex = 0;
            this.frameTimer = 0;
        }
    }

    update() {
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        if (this.position.y + this.height + this.velocity.y <= canvas.height) this.velocity.y += gravity;

        if (this.velocity.x > 0) {
            this.setAnimation(this.sheets.runRight);
            this.lastDirection = "right";
        }
        else if (this.velocity.x < 0) {
            this.setAnimation(this.sheets.runLeft);
            this.lastDirection = "left";
        }
        else {
            this.setAnimation(this.lastDirection === "right" ? this.sheets.idleRight : this.sheets.idleLeft);
        }

        this.frameTimer++;
        if (this.frameTimer >= this.animFps) {
            this.frameIndex++;
            this.frameTimer = 0;
        }
        if (this.frameIndex >= this.sheet.frames) this.frameIndex = 0;
    }

    draw(cameraX) {
        const img = this.sheet.image;
        c.drawImage(
            img,
            this.frameIndex * this.sheet.frameW,
            0,
            this.sheet.frameW,
            this.sheet.frameH,
            this.position.x - cameraX,
            this.position.y,
            this.width,
            this.height
        );
    }
}

// ---------------------------------------------------
// ENEMY
// ---------------------------------------------------
class Enemy {
    constructor(x, y) {
        this.width = 40;
        this.height = 40;

        this.startX = x;
        this.position = { x, y: y - this.height };
        this.velocity = { x: 1, y: 0 };
    }

    update() {
        this.position.x += this.velocity.x;

        if (this.position.x < this.startX - 30 || this.position.x > this.startX + 200) { this.velocity.x *= -1; }
    }

    draw(cameraX) {
        c.fillStyle = "red";
        c.fillRect(
            this.position.x - cameraX,
            this.position.y,
            this.width,
            this.height
        );
    }
}

// ---------------------------------------------------
// PLATFORM
// ---------------------------------------------------
class Platform {
    constructor({ x, y, image }) {
        this.position = { x, y };
        this.image = image;
        this.width = image.width;
        this.height = image.height;
    }

    draw(cameraX) {
        c.drawImage(this.image, this.position.x - cameraX, this.position.y);
    }
}

// ---------------------------------------------------
// PARALLAX
// ---------------------------------------------------
class ParallaxLayer {
    constructor({ x, y, image, ratio = 0.66 }) {
        this.position = { x, y };
        this.image = image;
        this.ratio = ratio;
    }

    draw(cameraX) {
        c.drawImage(
            this.image,
            this.position.x - cameraX * this.ratio,
            this.position.y
        );
    }
}

// ---------------------------------------------------
// GAME STATE
// ---------------------------------------------------
let gravity = 1.2;
let player, platforms, enemies, layers;
let keys = { left: false, right: false };
let scrollOffset = 0;
let cameraX = 0;

const groundY = 470;
const worldLen = 35000;
let lastTime = performance.now();
let gameover = false;
let gameWon = false;

// ---------------------------------------------------
// RESET
// ---------------------------------------------------
function resetGame() {
    layers = [
        new ParallaxLayer({ x: 0, y: 0, image: assets.bg, ratio: 0.33 }),
        new ParallaxLayer({ x: 0, y: 0, image: assets.hills, ratio: 0.66 })
    ];

    const sheets = {
        idleRight: new SpriteSheet(assets.idleRight, 60),
        idleLeft: new SpriteSheet(assets.idleLeft, 60),
        runRight: new SpriteSheet(assets.runRight, 30),
        runLeft: new SpriteSheet(assets.runLeft, 30)
    };

    player = new Player(100, 100, sheets);
    platforms = generateRandomPlatforms();
    scrollOffset = 0;
    cameraX = 0;

    scoreEl.textContent = "0";
    gameover = false;
}

// ---------------------------------------------------
// PLATFORM GENERATION
// ---------------------------------------------------
function generateRandomPlatforms() {
    const out = [];
    enemies = [];

    let cursor = -1;
    // stitch ground platforms together to form a floor
    while (cursor < worldLen) {
        out.push(new Platform({ x: cursor, y: groundY, image: assets.platform }));
        cursor += assets.platform.width - 3;// small overlap to remove seams
    }
    // sprinkle small platforms above ground for gameplay
    const smallCount = 70;
    for (let i = 0; i < smallCount; i++) {
        const px = 400 + Math.random() * (worldLen - 800);
        const py = groundY - (60 + Math.random() * 180);// between 60–240 px above ground
        out.push(new Platform({ x: px, y: py, image: assets.platformSmall }));
        enemies.push(new Enemy(px + 40, py));
    }
    return out;
}

// ---------------------------------------------------
// INPUT
// ---------------------------------------------------
window.addEventListener("keydown", (e) => {
    if (gameover) {
        keys.left = false
        keys.right = false
        return
    }
    if (e.key === "a" || e.key === "A") keys.left = true;
    if (e.key === "d" || e.key === "D") keys.right = true;
    if ((e.key === "w" || e.key === "W") && player.onGround) {
        player.velocity.y = -20;
        player.onGround = false;
    }
});

window.addEventListener("keyup", (e) => {
    if (gameover) return
    if (e.key === "a" || e.key === "A") keys.left = false;
    if (e.key === "d" || e.key === "D") keys.right = false;
});

let audioCtx = null, osc = null, gain = null, musicOn = false;
const musicBtn = document.getElementById('musicBtn');
// Helper function to pause execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const melody = [
    { freq: 111.63, duration: 300 }, // C4
    { freq: 143.66, duration: 300 }, // D4
    { freq: 179.63, duration: 300 }, // E4
    { freq: 199.23, duration: 600 }  // F4
];
musicBtn.addEventListener('click', async () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gain = audioCtx.createGain();
        gain.gain.value = 0.03;
        gain.connect(audioCtx.destination);
    }
    if (!musicOn) {
        musicOn = true;
        musicBtn.textContent = 'Music: On';
        // Setup the oscillator once
        // Creating a new oscillator each time the button is pressed (to be stopped later)
        osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.connect(gain);
        osc.start(0);
        while (musicOn) {
            for (const note of melody) {
                if (!musicOn) break;
                // Change the frequency for the current note
                osc.frequency.setValueAtTime(note.freq, audioCtx.currentTime);
                await delay(note.duration);
            }
            if (!musicOn) break;
            await delay(1000);
        }
        if (osc) {
            osc.stop();
            osc.disconnect();
            osc = null;
        }
        musicBtn.textContent = 'Music: Off';
    }
    else {
        musicOn = false;
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

// ---------------------------------------------------
// MAIN LOOP
// ---------------------------------------------------
function animate(now) {
    const dt = now - lastTime;
    lastTime = now;

    c.clearRect(0, 0, canvas.width, canvas.height);
    // Parallax backgrounds
    layers.forEach((layer) => layer.draw(cameraX));
    // Horizontal movement
    player.velocity.x = keys.right ? player.speed : keys.left ? -player.speed : 0;
    // Camera scroll logic
    if (keys.right && player.position.x - cameraX >= 400) {
        cameraX += player.speed;
        scrollOffset += player.speed;
    }
    if (keys.left && cameraX > 0 && player.position.x - cameraX <= 100) {
        cameraX -= player.speed;
        scrollOffset -= player.speed;
    }

    // Enemy update
    enemies.forEach((enemy) => {
        enemy.update();
        // Collision with player
        if (
            player.position.x < enemy.position.x + enemy.width &&
            player.position.x + player.width > enemy.position.x &&
            player.position.y < enemy.position.y + enemy.height &&
            player.position.y + player.height > enemy.position.y
        ) {
            window.location.reload();
        }
    });

    // Platform collision
    player.onGround = false;
    platforms.forEach((platform) => {
        const pTop = platform.position.y;
        const pLeft = platform.position.x;
        const pRight = platform.position.x + platform.width;

        const bottomNow = player.position.y + player.height;
        const bottomNext = bottomNow + player.velocity.y;

        const withinX =
            player.position.x + player.width > pLeft &&
            player.position.x < pRight;

        if (
            player.velocity.y >= 0 &&
            bottomNow <= pTop &&
            bottomNext >= pTop &&
            withinX
        ) {
            player.position.y = pTop - player.height;
            player.velocity.y = 0;
            player.onGround = true;
        }
    });

    // Update player
    player.update();
    // Draw platforms
    platforms.forEach((p) => p.draw(cameraX));
    // Draw player
    player.draw(cameraX);
    // Draw enemies
    enemies.forEach((enemy) => enemy.draw(cameraX));
    // HUD
    scoreEl.textContent = Math.floor(scrollOffset / 10);
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

// ---------------------------------------------------
// BOOT
// ---------------------------------------------------
(async function () {
    const entries = await Promise.all(
        Object.entries(ASSET_PATHS).map(async ([k, src]) => [k, await loadImage(src)])
    );

    entries.forEach(([k, img]) => (assets[k] = img));

    loadingEl.innerHTML = "<span class='ok'>Assets loaded</span>";
    setTimeout(() => loadingEl.remove(), 300);

    resetGame();
    lastTime = performance.now();
    requestAnimationFrame(animate);
})();