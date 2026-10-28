
const $ = (id) => document.getElementById(id);

const game = $("game");
const player = $("player");
const obstacle = $("obstacle");
const star = $("star");
const overlay = $("overlay");

const scoreText = $("score");
const bestText = $("best");
const startBtn = $("startBtn");
const menuBtn = $("menuBtn");
const musicBtn = $("musicBtn");
const leaderboard = $("leaderboard");
const leaderboardList = $("leaderboardList");

const characters = ["🐰", "🐱", "🐻", "🐸"];

const settings = {
  easy:   { speed: 230, jump: 610, gap: 300 },
  normal: { speed: 290, jump: 570, gap: 240 },
  hard:   { speed: 370, jump: 550, gap: 190 }
};

let selectedCharacter = "🐰";
let selectedLevel = "normal";
let playerName = "Player";

let running = false;
let score = 0;
let best = 0;
let speed = settings.normal.speed;

let jumpY = 0;
let jumpVelocity = 0;
let obstacleX = 0;
let starX = 0;
let nextObstacleGap = 0;
let starCollected = false;

let lastTime = 0;
let animationId = null;
let obstaclePassed = false;
let audioContext = null;
let musicTimer = null;
let musicStep = 0;
let soundEnabled = true;
let savedThisRun = false;

function loadData(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data === null ? fallback : JSON.parse(data);
  } catch {
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The game still works if browser storage is unavailable.
  }
}

best = Number(loadData("miniJumpBest", 0)) || 0;
bestText.textContent = best;

let scores = loadData("miniJumpScores", []);
if (!Array.isArray(scores)) scores = [];

function updateBest() {
  bestText.textContent = best;
}

function updateScore() {
  scoreText.textContent = score;
}

function chooseCharacter(emoji) {
  selectedCharacter = emoji;
  $("heroCharacter").textContent = emoji;
  player.textContent = emoji;

  document.querySelectorAll(".character").forEach((button) => {
    const selected = button.dataset.character === emoji;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function chooseDifficulty(level) {
  selectedLevel = level;

  document.querySelectorAll(".difficulty").forEach((button) => {
    const selected = button.dataset.level === level;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

document.querySelectorAll(".character").forEach((button) => {
  button.addEventListener("click", () => {
    chooseCharacter(button.dataset.character);
    playSound("select");
  });
});

document.querySelectorAll(".difficulty").forEach((button) => {
  button.addEventListener("click", () => {
    chooseDifficulty(button.dataset.level);
    playSound("select");
  });
});

// Create browser audio only after a user interaction.
function getAudio() {
  if (!soundEnabled) return null;

  const AudioClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioClass) return null;

  if (!audioContext) audioContext = new AudioClass();

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function tone(frequency, duration, type = "sine", volume = 0.07) {
  const audio = getAudio();
  if (!audio) return;

  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audio.currentTime);

  gain.gain.setValueAtTime(volume, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audio.currentTime + duration
  );

  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}

function playSound(type) {
  if (!soundEnabled) return;

  if (type === "jump") {
    tone(420, 0.12, "square", 0.035);
    setTimeout(() => tone(620, 0.12, "square", 0.025), 65);
  } else if (type === "star") {
    tone(740, 0.12);
    setTimeout(() => tone(980, 0.16), 90);
  } else if (type === "gameover") {
    tone(330, 0.2, "triangle");
    setTimeout(() => tone(220, 0.35, "triangle"), 170);
  } else {
    tone(520, 0.06, "sine", 0.025);
  }
}

// A short, looping melody made with synthesized notes.
const melody = [523, 659, 784, 659, 587, 698, 880, 698];

function startMusic() {
  stopMusic();
  if (!soundEnabled) return;

  musicStep = 0;

  musicTimer = setInterval(() => {
    if (!running || !soundEnabled) return;

    tone(melody[musicStep % melody.length], 0.18, "sine", 0.018);
    musicStep++;
  }, 260);
}

function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

musicBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  musicBtn.textContent = soundEnabled ? "🔊 Sound: On" : "🔇 Sound: Off";

  if (soundEnabled && running) startMusic();
  else stopMusic();

  if (soundEnabled) playSound("select");
});

function showMenu(title = "Ready for an adventure?",
                  messageText = "Jump over obstacles and collect stars!") {
  running = false;
  stopMusic();

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  overlay.style.display = "flex";
  $("menuTitle").textContent = title;
  $("menuMessage").textContent = messageText;

  startBtn.hidden = false;
  startBtn.textContent = "▶ Start Game";
  $("playerName").disabled = false;

  menuBtn.hidden = true;
  leaderboard.hidden = true;

  player.classList.remove("running", "jumping", "celebrate");
  obstacle.style.display = "none";
  star.style.display = "none";
  player.style.bottom = "43px";
  player.style.transform = "none";

  chooseCharacter(selectedCharacter);
}

function renderLeaderboard() {
  leaderboardList.replaceChildren();

  const sorted = [...scores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (sorted.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No scores yet. Be the first!";
    leaderboardList.appendChild(item);
    return;
  }

  sorted.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.name} — ${entry.score} points`;
    leaderboardList.appendChild(item);
  });
}

$("leaderboardBtn").addEventListener("click", () => {
  renderLeaderboard();
  leaderboard.hidden = false;
  playSound("select");
});

$("closeLeaderboard").addEventListener("click", () => {
  leaderboard.hidden = true;
  playSound("select");
});

function startGame() {
  if (running) return;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  const enteredName = $("playerName").value.trim();
  playerName = (enteredName || "Player").slice(0, 16);

  chooseCharacter(selectedCharacter);

  score = 0;
  speed = settings[selectedLevel].speed;
  jumpY = 0;
  jumpVelocity = 0;
  obstacleX = game.clientWidth + 50;
  starX = game.clientWidth + 220;
  nextObstacleGap = 0;
  starCollected = false;
  obstaclePassed = false;
  savedThisRun = false;
  lastTime = 0;

  updateScore();
  obstacle.style.display = "block";
  star.style.display = "block";
  obstacle.style.left = obstacleX + "px";
  star.style.left = starX + "px";
  star.style.top = "120px";
  player.style.bottom = "43px";

  overlay.style.display = "none";
  menuBtn.hidden = false;
  player.classList.add("running");
  player.classList.remove("jumping", "celebrate");

  running = true;
  startMusic();
  animationId = requestAnimationFrame(gameLoop);
}

function jump() {
  if (!running || jumpY > 0 || jumpVelocity > 0) return;

  jumpVelocity = settings[selectedLevel].jump;
  player.classList.remove("running");
  player.classList.add("jumping");
  playSound("jump");
}

function collides(first, second) {
  const a = first.getBoundingClientRect();
  const b = second.getBoundingClientRect();

  const insetA = 9;
  const insetB = 7;

  return (
    a.left + insetA < b.right - insetB &&
    a.right - insetA > b.left + insetB &&
    a.top + insetA < b.bottom - insetB &&
    a.bottom - insetA > b.top + insetB
  );
}

function collectStar() {
  starCollected = true;
  star.style.display = "none";
  score += 5;
  updateScore();

  player.classList.remove("celebrate");
  void player.offsetWidth;
  player.classList.add("celebrate");

  playSound("star");
}

function finishGame() {
  if (!running) return;

  running = false;
  stopMusic();

  player.classList.remove("running", "jumping", "celebrate");
  playSound("gameover");

  if (score > best) {
    best = score;
    saveData("miniJumpBest", best);
    updateBest();
  }

  // Save one result per completed game.
  if (!savedThisRun) {
    scores.push({
      name: playerName,
      score: score,
      date: new Date().toISOString()
    });

    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 5);
    saveData("miniJumpScores", scores);
    savedThisRun = true;
  }

  renderLeaderboard();

  $("menuTitle").textContent = "Game Over! 💗";
  $("menuMessage").textContent = `${playerName}, you scored ${score} points!`;
  startBtn.textContent = "🔄 Play Again";

  overlay.style.display = "flex";
  leaderboard.hidden = false;
  menuBtn.hidden = true;
  $("playerName").disabled = false;
}

function gameLoop(time) {
  if (!running) return;

  if (lastTime === 0) lastTime = time;
  const dt = Math.min((time - lastTime) / 1000, 0.035);
  lastTime = time;

  // Jump physics.
  if (jumpY > 0 || jumpVelocity > 0) {
    jumpY += jumpVelocity * dt;
    jumpVelocity -= 1450 * dt;

    if (jumpY <= 0) {
      jumpY = 0;
      jumpVelocity = 0;
      player.classList.remove("jumping");
      player.classList.add("running");
    }
  }

  player.style.bottom = (43 + jumpY) + "px";

  // Move obstacles.
  obstacleX -= speed * dt;

  if (obstacleX < -50) {
    obstacleX = game.clientWidth + 20 + Math.random() * 90;
    obstaclePassed = false;
    nextObstacleGap = settings[selectedLevel].gap;

    score += 1;
    updateScore();

    speed = Math.min(speed + 4, 540);
  }

  obstacle.style.left = obstacleX + "px";

  // Move and respawn stars.
  starX -= speed * dt;

  if (starX < -45) {
    starX = game.clientWidth + 130 + Math.random() * 160;
    starCollected = false;
    star.style.top = (85 + Math.random() * 90) + "px";
    star.style.display = "block";
  }

  star.style.left = starX + "px";

  if (collides(player, obstacle)) {
    finishGame();
    return;
  }

  if (!starCollected && collides(player, star)) {
    collectStar();
  }

  animationId = requestAnimationFrame(gameLoop);
}

startBtn.addEventListener("click", startGame);

menuBtn.addEventListener("click", () => {
  showMenu();
  playSound("select");
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" && event.code !== "ArrowUp") return;

  event.preventDefault();

  if (!running && overlay.style.display !== "none") {
    // Start from the menu; subsequent presses jump.
    if (leaderboard.hidden) startGame();
  } else {
    jump();
  }
});

game.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;

  if (!running && overlay.style.display !== "none") return;
  jump();
});

chooseCharacter(selectedCharacter);
chooseDifficulty(selectedLevel);
showMenu();
renderLeaderboard();
