
"use strict";

/* ==========================================================
   CUPID'S ARROW — GAME CONFIGURATION
   CUSTOMIZE: title, player, messages, levels, difficulty
========================================================== */

const CONFIG = {
  title: "Cupid's Arrow",
  player: "Sweetheart",
  levels: 10,

  gravity: 370,
  powerMin: 250,
  powerMax: 850,

  messages: {
    miss: "Miss you",
    bull: "I love you",
    rings: [
      "Almost there!",
      "So close!",
      "Nice shot!",
      "Keep aiming!"
    ]
  },

  difficulty: {
    easy: {
      speed: 0.72,
      size: 1.18,
      arrows: 9
    },
    normal: {
      speed: 1,
      size: 1,
      arrows: 7
    },
    hard: {
      speed: 1.3,
      size: 0.85,
      arrows: 6
    }
  }
};

const $ = id => document.getElementById(id);

const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const arena = $("arena");

const reduced = matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

let state = "welcome";
let level = 1;
let score = 0;
let best = 0;
let arrows = 0;
let lives = 3;
let combo = 0;
let bulls = 0;
let hits = 0;
let misses = 0;
let shots = 0;
let missStreak = 0;
let hitStreak = 0;
let levelHits = 0;
let levelBulls = 0;

let player = CONFIG.player;
let diff = CONFIG.difficulty.normal;

let bow = { x: 90, y: 325 };

let target = {
  x: 770,
  y: 270,
  r: 70,
  phase: 0,
  speed: 1,
  react: 0
};

let wind = 0;
let aim = null;
let arrow = null;
let particles = [];
let time = 0;
let last = 0;
let lockedUntil = 0;
let soundOn = true;
let audio = null;
let levelBonus = 0;

try {
  best = Number(
    localStorage.getItem("cupids-arrow-best") || 0
  ) || 0;
} catch (e) {}

/* ==========================================================
   INITIAL UI
========================================================== */

$("gameTitle").textContent = CONFIG.title;
$("brandTitle").textContent = CONFIG.title;
$("playerName").value = CONFIG.player;

const touch = matchMedia("(pointer: coarse)").matches;

$("controlHint").textContent = touch
  ? "Touch near the bow, drag backward to aim, then lift your finger to shoot."
  : "Click near the bow, drag backward to aim, then release to shoot.";

$("gameHint").textContent = $("controlHint").textContent;

function show(id) {
  for (const el of document.querySelectorAll(".screen")) {
    el.classList.toggle("active", el.id === id);
  }

  state = id;

  if (id === "game") resize();
}

function saveBest() {
  if (score > best) {
    best = score;

    try {
      localStorage.setItem(
        "cupids-arrow-best",
        String(best)
      );
    } catch (e) {}
  }
}

function updateHUD() {
  $("levelValue").textContent =
    level + "/" + CONFIG.levels;

  $("scoreValue").textContent = score.toLocaleString();
  $("bestValue").textContent = best.toLocaleString();
  $("arrowsValue").textContent = arrows;
  $("comboValue").textContent = combo;
  $("bullValue").textContent = bulls;

  $("livesValue").textContent =
    "❤️".repeat(lives) + "♡".repeat(3 - lives);

  $("windValue").textContent = wind === 0
    ? "Wind: Calm"
    : `Wind: ${wind > 0 ? "→" : "←"} ${Math.abs(wind).toFixed(0)}`;

  $("powerValue").textContent =
    `Power: ${aim ? Math.round(aim.power * 100) : 0}%`;
}

/* ==========================================================
   RESPONSIVE CANVAS
========================================================== */

function resize() {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const dpr = Math.min(devicePixelRatio || 1, 2);

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  ctx.setTransform(
    canvas.width / 960,
    0,
    0,
    canvas.height / 540,
    0,
    0
  );
}

window.addEventListener("resize", resize);

/* ==========================================================
   WEB AUDIO — NO EXTERNAL FILES
========================================================== */

function initAudio() {
  if (!soundOn) return;

  try {
    audio ??= new (
      window.AudioContext || window.webkitAudioContext
    )();

    if (audio.state === "suspended") {
      audio.resume();
    }
  } catch (e) {
    soundOn = false;
  }
}

function tone(
  f = 440,
  d = 0.13,
  type = "sine",
  vol = 0.07,
  delay = 0
) {
  if (!soundOn || !audio) return;

  try {
    const o = audio.createOscillator();
    const g = audio.createGain();
    const t = audio.currentTime + delay;

    o.type = type;
    o.frequency.setValueAtTime(f, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(
      vol, t + 0.012
    );
    g.gain.exponentialRampToValueAtTime(
      0.0001, t + d
    );

    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  } catch (e) {}
}

function sfx(name) {
  if (name === "pull") {
    tone(190, 0.12, "triangle", 0.03);
  }

  if (name === "shoot") {
    tone(290, 0.13, "sawtooth", 0.035);
  }

  if (name === "hit") {
    tone(530, 0.13);
    tone(720, 0.18, "sine", 0.05, 0.09);
  }

  if (name === "miss") {
    tone(250, 0.24, "sine", 0.04);
  }

  if (name === "bull") {
    [523, 659, 784, 1046].forEach((f, i) => {
      tone(f, 0.35, "sine", 0.075, i * 0.105);
    });
  }

  if (name === "level") {
    [440, 554, 659, 880].forEach((f, i) => {
      tone(f, 0.22, "triangle", 0.06, i * 0.09);
    });
  }
}

/* ==========================================================
   GAME AND LEVEL SETUP
========================================================== */

function start() {
  initAudio();

  player =
    $("playerName").value.trim() || CONFIG.player;

  diff =
    CONFIG.difficulty[$("difficulty").value] ||
    CONFIG.difficulty.normal;

  score = 0;
  lives = 3;
  combo = 0;
  bulls = 0;
  hits = 0;
  misses = 0;
  shots = 0;
  missStreak = 0;
  hitStreak = 0;
  level = 1;

  setupLevel();
  show("game");
}

function setupLevel() {
  arrows = diff.arrows;
  levelHits = 0;
  levelBulls = 0;

  aim = null;
  arrow = null;
  particles = [];
  lockedUntil = 0;
  time = 0;

  target.phase = 0;
  target.react = 0;

  target.r =
    (76 - (level - 1) * 3.5) * diff.size;

  target.x = 660 + (level - 1) * 16;
  target.y = 270;

  target.speed =
    (0.9 + level * 0.16) * diff.speed;

  wind = level < 4
    ? 0
    : (level % 2 ? 1 : -1) * (12 + level * 3);

  bow.y = 325;

  updateHUD();
}

/* ==========================================================
   POINTER CONTROLS — MOUSE AND TOUCH
========================================================== */

function pointer(e) {
  const r = canvas.getBoundingClientRect();

  return {
    x: (e.clientX - r.left) * 960 / r.width,
    y: (e.clientY - r.top) * 540 / r.height
  };
}

canvas.addEventListener("pointerdown", e => {
  if (
    state !== "game" ||
    arrow ||
    aim ||
    performance.now() < lockedUntil ||
    arrows <= 0
  ) return;

  const p = pointer(e);

  if (
    Math.hypot(
      p.x - bow.x,
      p.y - bow.y
    ) > 190
  ) return;

  initAudio();

  aim = {
    pointer: e.pointerId,
    x: p.x,
    y: p.y,
    power: 0
  };

  canvas.setPointerCapture(e.pointerId);
  sfx("pull");
  updateAim(p);
});

canvas.addEventListener("pointermove", e => {
  if (!aim || e.pointerId !== aim.pointer) return;

  updateAim(pointer(e));
});

function updateAim(p) {
  if (!aim) return;

  aim.x = p.x;
  aim.y = p.y;

  aim.dx = Math.max(0, bow.x - p.x);
  aim.dy = bow.y - p.y;

  aim.distance = Math.min(
    180,
    Math.hypot(aim.dx, aim.dy)
  );

  aim.power = Math.min(
    1,
    aim.distance / 150
  );

  updateHUD();
}

canvas.addEventListener("pointerup", e => {
  if (!aim || e.pointerId !== aim.pointer) return;

  const a = aim;
  aim = null;

  if (state === "game" && a.distance > 12) {
    const angle = Math.atan2(
      a.dy,
      Math.max(18, a.dx)
    );

    const speed =
      CONFIG.powerMin +
      (CONFIG.powerMax - CONFIG.powerMin) * a.power;

    arrow = {
      x: bow.x + 24,
      y: bow.y,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      angle: -angle,
      age: 0
    };

    arrows--;
    shots++;

    sfx("shoot");
  }

  updateHUD();
});

canvas.addEventListener("pointercancel", () => {
  aim = null;
  updateHUD();
});

/* ==========================================================
   PARTICLES AND ROMANTIC MESSAGES
========================================================== */

function addParticles(x, y, n, kind) {
  if (reduced) n = Math.min(n, 8);

  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 50 + Math.random() * 200;

    particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 65,
      life: 0.7 + Math.random() * 1.1,
      kind,
      sz: 4 + Math.random() * 9
    });
  }
}

function message(text, x = 480, y = 180) {
  const el = $("floatingText");

  el.textContent = text;
  el.style.left = (x / 960 * 100) + "%";
  el.style.top = (y / 540 * 100) + "%";

  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

/* ==========================================================
   SCORING AND HIT DETECTION
========================================================== */

function settle(kind, ratio = 1) {
  arrow = null;

  lockedUntil =
    performance.now() + (reduced ? 250 : 1150);

  if (kind === "miss") {
    misses++;
    missStreak++;
    hitStreak = 0;
    combo = 0;

    message(CONFIG.messages.miss, 520, 220);
    sfx("miss");

    // One life lost for every three consecutive misses.
    if (missStreak >= 3) {
      lives = Math.max(0, lives - 1);
      missStreak = 0;
    }
  } else {
    hits++;
    levelHits++;
    missStreak = 0;
    hitStreak++;
    combo++;

    let points = 0;

    if (ratio <= 0.19) {
      points = 100;
      bulls++;
      levelBulls++;

      message(
        CONFIG.messages.bull,
        target.x,
        target.y - 90
      );

      addParticles(
        target.x,
        target.y,
        75,
        "heart"
      );

      $("glow").classList.remove("flash");
      void $("glow").offsetWidth;
      $("glow").classList.add("flash");

      if (!reduced) {
        arena.classList.add("shake");

        setTimeout(() => {
          arena.classList.remove("shake");
        }, 400);
      }

      sfx("bull");
    } else {
      points = ratio <= 0.42
        ? 65
        : ratio <= 0.7
          ? 35
          : 15;

      const choices = CONFIG.messages.rings;

      message(
        choices[Math.floor(Math.random() * choices.length)],
        target.x,
        target.y - 85
      );

      addParticles(
        target.x,
        target.y,
        18,
        "heart"
      );

      sfx("hit");
    }

    // Bonus for consecutive accurate shots.
    score += points + Math.min(
      100,
      Math.max(0, combo - 1) * 10
    );

    target.react = 0.35;

    // Restore a heart after five consecutive hits.
    if (hitStreak >= 5 && lives < 3) {
      lives++;
      hitStreak = 0;
      message("A heart restored! 💗", 480, 120);
    }
  }

  saveBest();
  updateHUD();
}

/* ==========================================================
   LEVEL COMPLETION AND GAME ENDING
========================================================== */

function finishLevel() {
  if (state !== "game") return;

  levelBonus =
    levelHits * 20 +
    levelBulls * 30 +
    arrows * 10;

  score += levelBonus;
  saveBest();
  updateHUD();

  if (level >= CONFIG.levels) {
    finishGame();
    return;
  }

  sfx("level");

  $("levelCompleteTitle").textContent =
    `Level ${level} Complete!`;

  $("levelCompleteText").textContent =
    `${player}, your arrows are bringing you closer to love!`;

  $("levelReward").textContent =
    `Level bonus: +${levelBonus} points`;

  addParticles(480, 180, 95, "confetti");

  show("levelComplete");
}

function gameOver() {
  saveBest();

  $("gameOverText").textContent =
    `${player}, you scored ${score.toLocaleString()} points ` +
    `and reached Level ${level}. Try again!`;

  show("gameOver");
}

function finishGame() {
  sfx("bull");

  $("finalPlayer").textContent =
    `A beautiful adventure, ${player}!`;

  $("finalScore").textContent = score.toLocaleString();
  $("finalBest").textContent = best.toLocaleString();

  $("finalAccuracy").textContent =
    (shots ? hits / shots * 100 : 0).toFixed(1) + "%";

  $("finalHits").textContent = hits;
  $("finalMisses").textContent = misses;
  $("finalBulls").textContent = bulls;

  show("final");
}

function checkEnd() {
  if (
    state !== "game" ||
    arrow ||
    aim ||
    performance.now() < lockedUntil
  ) return;

  if (lives <= 0) {
    gameOver();
    return;
  }

  if (arrows <= 0) {
    finishLevel();
  }
}

/* ==========================================================
   GAME PHYSICS AND ANIMATION UPDATE
========================================================== */

function update(dt) {
  if (state !== "game") return;

  time += dt;

  target.phase += dt * target.speed;

  const move = 70 + level * 7;

  target.y =
    270 + Math.sin(target.phase) * move;

  target.x =
    660 +
    (level - 1) * 16 +
    Math.sin(target.phase * 0.43) *
    Math.min(35, level * 4);

  target.react = Math.max(
    0,
    target.react - dt
  );

  if (arrow) {
    const a = arrow;
    const oldX = a.x;
    const oldY = a.y;

    a.age += dt;

    a.vx += wind * dt;
    a.vy += CONFIG.gravity * dt;

    a.x += a.vx * dt;
    a.y += a.vy * dt;

    a.angle = Math.atan2(a.vy, a.vx);

    const segmentX = a.x - oldX;
    const segmentY = a.y - oldY;

    const u = Math.max(
      0,
      Math.min(
        1,
        (
          (target.x - oldX) * segmentX +
          (target.y - oldY) * segmentY
        ) /
        (
          segmentX * segmentX +
          segmentY * segmentY || 1
        )
      )
    );

    const near = Math.hypot(
      oldX + segmentX * u - target.x,
      oldY + segmentY * u - target.y
    ) / target.r;

    if (
      near <= 1 &&
      a.x >= target.x - target.r - 20
    ) {
      settle("hit", near);
    } else if (
      a.x > 1010 ||
      a.y > 590 ||
      a.y < -100 ||
      a.age > 4
    ) {
      settle("miss");
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 90 * dt;
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  checkEnd();
}

/* ==========================================================
   ORIGINAL CANVAS ARTWORK
========================================================== */

function heart(x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  ctx.fillStyle = color;
  ctx.beginPath();

  ctx.moveTo(0, 6);
  ctx.bezierCurveTo(-24, -11, -15, -26, 0, -12);
  ctx.bezierCurveTo(15, -26, 24, -11, 0, 6);

  ctx.fill();
  ctx.restore();
}

function background() {
  const g = ctx.createLinearGradient(0, 0, 0, 540);

  g.addColorStop(0, "#f6bed6");
  g.addColorStop(0.56, "#ffe4bf");
  g.addColorStop(1, "#b9a7d7");

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 960, 540);

  // Sunset
  ctx.fillStyle = "#ffe9a1";
  ctx.beginPath();
  ctx.arc(755, 110, 65, 0, Math.PI * 2);
  ctx.fill();

  // Floating clouds
  for (let i = 0; i < 6; i++) {
    const x =
      ((i * 210 + time * (i % 2 ? 8 : -7)) %
        1200 + 1200) % 1200 - 100;

    const y = 70 + (i % 3) * 50;

    ctx.fillStyle = "rgba(255,255,255,.52)";

    for (let j = 0; j < 3; j++) {
      ctx.beginPath();
      ctx.ellipse(
        x + j * 24,
        y + (j % 2) * 5,
        37, 19, 0, 0, Math.PI * 2
      );
      ctx.fill();
    }
  }

  // Lavender hills
  ctx.fillStyle = "#c4a3ca";
  ctx.beginPath();
  ctx.moveTo(0, 465);
  ctx.quadraticCurveTo(200, 365, 430, 455);
  ctx.quadraticCurveTo(700, 350, 960, 440);
  ctx.lineTo(960, 540);
  ctx.lineTo(0, 540);
  ctx.fill();

  // Foreground garden
  ctx.fillStyle = "#8da995";
  ctx.beginPath();
  ctx.moveTo(0, 500);
  ctx.quadraticCurveTo(430, 425, 960, 495);
  ctx.lineTo(960, 540);
  ctx.lineTo(0, 540);
  ctx.fill();

  // Heart-shaped flowers
  for (let i = 0; i < 22; i++) {
    const x = i * 47 + 10;
    const y = 495 + Math.sin(i * 3) * 16;

    ctx.strokeStyle = "#638b75";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + 25);
    ctx.lineTo(x, y);
    ctx.stroke();

    heart(
      x, y, 0.35,
      i % 2 ? "#fff1ad" : "#f47da7"
    );
  }
}

function drawTarget() {
  const t = target;

  ctx.save();
  ctx.translate(t.x, t.y);

  const scale = 1 + t.react * 0.3;
  ctx.scale(scale, scale);

  // Target stand
  ctx.strokeStyle = "#86556c";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, t.r);
  ctx.lineTo(0, t.r + 90);
  ctx.stroke();

  const rings = [
    "#fff5df",
    "#f29ab7",
    "#fff6e8",
    "#d84f80",
    "#f9cb74"
  ];

  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = rings[i];
    ctx.beginPath();
    ctx.arc(
      0, 0,
      t.r * (1 - i * 0.195),
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.strokeStyle = "rgba(108,45,75,.22)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Romantic bull's-eye
  heart(0, 3, t.r / 100, "#ac235b");

  ctx.restore();
}

function drawBow() {
  const x = bow.x;
  const y = bow.y;

  ctx.save();

  // Curved wooden bow
  ctx.strokeStyle = "#9d563b";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y - 80);
  ctx.quadraticCurveTo(x + 75, y, x, y + 80);
  ctx.stroke();

  ctx.strokeStyle = "#f5d18a";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Animated bowstring
  const sx = aim
    ? x - Math.min(90, aim.distance * 0.5)
    : x + 5;

  const sy = aim
    ? y + (aim.y - y) * 0.45
    : y;

  ctx.strokeStyle = "#fff8e9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 80);
  ctx.lineTo(sx, sy);
  ctx.lineTo(x, y + 80);
  ctx.stroke();

  ctx.restore();

  if (!arrow) {
    const ang = aim
      ? Math.atan2(
          bow.y - aim.y,
          Math.max(18, bow.x - aim.x)
        )
      : 0;

    drawArrow(sx, sy, ang, 70);
  }
}

function drawArrow(x, y, angle, length = 62) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Shaft
  ctx.strokeStyle = "#6b3c3c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-length * 0.75, 0);
  ctx.lineTo(length * 0.25, 0);
  ctx.stroke();

  // Arrowhead
  ctx.fillStyle = "#fff5e4";
  ctx.beginPath();
  ctx.moveTo(length * 0.38, 0);
  ctx.lineTo(length * 0.17, -7);
  ctx.lineTo(length * 0.17, 7);
  ctx.fill();

  // Pink feather
  ctx.fillStyle = "#e65c90";
  ctx.beginPath();
  ctx.moveTo(-length * 0.75, 0);
  ctx.lineTo(-length * 0.95, -10);
  ctx.lineTo(-length * 0.85, 0);
  ctx.lineTo(-length * 0.95, 10);
  ctx.fill();

  ctx.restore();
}

/* ==========================================================
   AIMING TRAJECTORY GUIDE
========================================================== */

function guide() {
  if (!aim) return;

  const a = aim;

  const ang = Math.atan2(
    a.dy,
    Math.max(18, a.dx)
  );

  const v =
    CONFIG.powerMin +
    (CONFIG.powerMax - CONFIG.powerMin) * a.power;

  const vx = Math.cos(ang) * v;
  const vy = -Math.sin(ang) * v;

  ctx.fillStyle = "rgba(255,255,255,.9)";

  for (let t = 0.12; t < 2.5; t += 0.13) {
    const x =
      bow.x + 24 + vx * t + wind * t * t / 2;

    const y =
      bow.y + vy * t +
      CONFIG.gravity * t * t / 2;

    if (x > 960 || y > 540) break;

    ctx.globalAlpha = Math.max(
      0.15,
      1 - t / 3
    );

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/* ==========================================================
   CANVAS RENDERING
========================================================== */

function render() {
  if (!canvas.width) return;

  ctx.clearRect(0, 0, 960, 540);

  background();
  drawTarget();
  guide();
  drawBow();

  if (arrow) {
    drawArrow(
      arrow.x,
      arrow.y,
      arrow.angle
    );
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.min(
      1,
      p.life / 0.45
    );

    if (p.kind === "heart") {
      heart(
        p.x,
        p.y,
        p.sz / 14,
        "#e83e78"
      );
    } else {
      const colors = [
        "#fff0a3",
        "#ef6796",
        "#ffffff",
        "#bca5ef"
      ];

      ctx.fillStyle =
        colors[Math.floor(p.sz) % 4];

      ctx.fillRect(
        p.x,
        p.y,
        p.sz,
        p.sz * 0.5
      );
    }
  }

  ctx.globalAlpha = 1;
}

/* ==========================================================
   REQUEST ANIMATION FRAME
========================================================== */

function frame(now) {
  const dt = Math.min(
    0.033,
    (now - last) / 1000 || 0
  );

  last = now;

  if (state === "game") {
    update(dt);
    render();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* ==========================================================
   BUTTON EVENT HANDLERS
========================================================== */

$("startBtn").onclick = start;

$("pauseBtn").onclick = () => {
  if (state === "game") {
    aim = null;
    show("pause");
  }
};

$("resumeBtn").onclick = () => show("game");

$("restartLevelBtn").onclick = () => {
  setupLevel();
  show("game");
};

$("pauseRestartBtn").onclick = () => {
  setupLevel();
  show("game");
};

$("restartGameBtn").onclick = start;

$("pauseHomeBtn").onclick = () => show("welcome");

$("gameOverHomeBtn").onclick = () => show("welcome");

$("tryAgainBtn").onclick = start;

$("playAgainBtn").onclick = start;

$("nextLevelBtn").onclick = () => {
  level++;
  setupLevel();
  show("game");
};

/* ==========================================================
   SOUND AND FULLSCREEN
========================================================== */

$("soundBtn").onclick = () => {
  soundOn = !soundOn;

  $("soundBtn").textContent =
    soundOn ? "🔊" : "🔇";

  if (soundOn) initAudio();
};

$("fullscreenBtn").onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (
      document.documentElement.requestFullscreen
    ) {
      await document.documentElement.requestFullscreen();
    }
  } catch (e) {
    // Fullscreen is optional on unsupported browsers.
  }
};

/* ==========================================================
   SHARE RESULTS
========================================================== */

$("shareBtn").onclick = async () => {
  const accuracy = (
    shots ? hits / shots * 100 : 0
  ).toFixed(1);

  const text =
    `💘 ${CONFIG.title}: ${score} points, ` +
    `${hits} hits, ${bulls} bull's-eyes, ` +
    `${accuracy}% accuracy! ` +
    `Every arrow finds its way back to you. I love you!`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: CONFIG.title,
        text
      });

      $("shareStatus").textContent = "Shared!";
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);

      $("shareStatus").textContent = "Result copied!";
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;

      document.body.append(ta);
      ta.select();

      const ok = document.execCommand("copy");
      ta.remove();

      $("shareStatus").textContent = ok
        ? "Result copied!"
        : "Copy is unavailable in this browser.";
    }
  } catch (e) {
    $("shareStatus").textContent =
      e.name === "AbortError"
        ? "Share cancelled."
        : "Sharing unavailable.";
  }
};

/* ==========================================================
   KEYBOARD SHORTCUTS
========================================================== */

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && state === "game") {
    $("pauseBtn").click();
  } else if (
    e.key === "Escape" &&
    state === "pause"
  ) {
    $("resumeBtn").click();
  }
});

updateHUD();
