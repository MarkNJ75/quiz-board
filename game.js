

// ── Categories & Questions ─────────────────────────────────────────────────
console.log("game.js loaded");

// ── Core Game State ──────────────────────────────────────────
const ROWS = 5;
const DRAFT_SAVE_DELAY = 3000;

let categories = [];
let questions  = [];
let answered   = [];
let viewOnlyMode = false;
let stealingTeam = null;
let originalTeam = null;
let questionWasRevealed = false;
let stealPenaltyApplied = false;
let teamBeingStolenFrom = null;
let turnTeamBeforeSteal = null;
let currentEditName = null;
let pendingStartFreshName = null;
// ── Teams ──────────────────────────────────────────────────────────────────
const MIN_TEAMS = 2;
const MAX_TEAMS = 6;
let teamCount = 2;
let scores = Array(teamCount).fill(0);
let teamNames = makeDefaultTeamNames(teamCount);
let activeTeam = 0;

function makeDefaultTeamNames(count){
  return Array.from({ length: count }, (_, i) => `Team ${i + 1}`);
}

function clampTeamCount(value){
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return 2;
  return Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, parsed));
}

function getSelectedTeamCount(){
  return clampTeamCount(document.getElementById("teamCount")?.value || teamCount);
}

function setupTeams(count, preserveNames=false){
  teamCount = clampTeamCount(count);
  const oldNames = Array.isArray(teamNames) ? teamNames : [];
  scores = Array(teamCount).fill(0);
  teamNames = Array.from({ length: teamCount }, (_, i) => preserveNames && oldNames[i] ? oldNames[i] : `Team ${i + 1}`);
  activeTeam = 0;
}

function setTeamCountControl(count){
  const teamCountEl = document.getElementById("teamCount");
  if (teamCountEl) teamCountEl.value = String(clampTeamCount(count));
}

function buildScoreboard() {
  const sb = document.getElementById('scoreboard');
  sb.innerHTML = '';

  const modalOpen = document
    .getElementById('modalBg')
    ?.classList.contains('open');

  scores.forEach((_, i) => {
    const card = document.createElement('div');
    card.className = 'team-card' + (i === activeTeam ? ' active-team' : '');
    card.id = 'team-card-' + i;

    // ✅ Manual switching ONLY when modal is not open
    if (!modalOpen) {
      card.classList.add('clickable');
      card.onclick = () => {
        activeTeam = i;
        buildScoreboard();
        syncModalScoreboard?.();
      };
    }

    card.innerHTML = `
      <div class="team-name">${teamNames[i] || `Team ${i + 1}`}</div>
      <div class="team-score" id="score-${i}">${scores[i]}</div>
    `;

    // ⚡ Steal indicator (automatic)
    if (stealActive && i === stealingTeam) {
      const bolt = document.createElement('div');
      bolt.className = 'steal-bolt';
      bolt.textContent = '⚡ STEALING ⚡';
      card.prepend(bolt);
    }

    sb.appendChild(card);
  });
}

function applyStealDimming() {
  document.querySelectorAll('.team-card').forEach((card, idx) => {
    card.classList.remove('dimmed');

    if (stealActive && stealingTeam !== null && idx !== stealingTeam) {
      card.classList.add('dimmed');
    }
  });
}

function setActive(i){ 
  activeTeam=i; buildScoreboard();
  syncModalScoreboard();
  saveGame();
}

function advanceTurnFrom(teamIdx){
  if (teamIdx === null || teamIdx === undefined) return;
  activeTeam = (teamIdx + 1) % teamCount;
  buildScoreboard();
  syncModalScoreboard?.();
  saveGame();
}

function updateScore(teamIdx, delta){
  if (teamIdx < 0 || teamIdx >= scores.length) return;

  scores[teamIdx] += delta;

  const scoreEl = document.getElementById('score-' + teamIdx);
  if (scoreEl) scoreEl.textContent = scores[teamIdx];

  const card = document.getElementById('team-card-' + teamIdx);
  if (card) {
    card.classList.remove('score-flash');
    void card.offsetWidth;
    card.classList.add('score-flash');
  }
  syncModalScoreboard();
  saveGame();
}

// ── Board ──────────────────────────────────────────────────────────────────



function buildBoard(){
  const board = document.getElementById('board');
  board.innerHTML = '';
  board.style.setProperty('--cols', categories.length || 1);

  // Category headers
  categories.forEach(cat=>{
    const h = document.createElement('div');
    h.className = 'cat-header';
    h.textContent = cat;
    board.appendChild(h);
  });

  // Question rows
  for(let r=0; r<ROWS; r++){
    categories.forEach((_,c)=>{
      const cell = document.createElement('div');
      cell.className = 'cell' + (answered[c][r]?' answered':'');
      cell.id = `cell-${c}-${r}`;
      cell.textContent = answered[c][r] ? '' : '$'+questions[c][r].pts;
      if(!answered[c][r]) cell.onclick = ()=>openModal(c,r);
      board.appendChild(cell);
    });
  }
}

// ── Timer ──────────────────────────────────────────────────────────────────
const FULL_TIME = 60;
const STEAL_TIME = 30;
const STEAL_FX_MS = 1000;
const STEAL_AFTER_FX_PAUSE_MS = 500;
const STEAL_BOLT_MS = 1000;
const STEAL_THUNDER_MS = 3000;
const STEAL_PAUSE_AFTER_THUNDER_MS = 500;
let timerSec = FULL_TIME;
let timerMax = FULL_TIME;
let timerInterval = null;
let timerPaused = false;
let stealActive = false;

function startTimer(seconds, max){
  clearInterval(timerInterval);

  timerSec = seconds;
  timerMax = max;
  timerPaused = false;

  const bar = document.getElementById('timerBar');
  if (bar) bar.classList.add('running');

  updateTimerUI();

  timerInterval = setInterval(() => {
    if (timerPaused) return;

    timerSec--;

    if (timerSec < 0) timerSec = 0;

    updateTimerUI();

    if (timerSec === 0) {
    clearInterval(timerInterval);
    timerInterval = null;

    stopHeartbeat();

    if (timerMax === STEAL_TIME) {
      playDunSound();
    }

    const musicTail = timerMax === STEAL_TIME ? 600 : 3000;
    setTimeout(stopThinkMusic, musicTail);
  }
  }, 1000);
}

function stopTimer(){
  clearInterval(timerInterval);
  timerInterval = null;
  timerPaused = false;

  const btn = document.getElementById('pauseBtn');
  if (btn) btn.textContent = '⏸ Pause';

  const bar = document.getElementById('timerBar');
  if (bar) bar.classList.remove('running'); // 👈 important
}

function updateTimerUI(){
  const disp = document.getElementById('timerDisplay');
  const bar  = document.getElementById('timerBar');
  disp.textContent = timerSec;
  const pct = timerMax > 0 ? (timerSec/timerMax)*100 : 0;
  bar.style.width = pct+'%';
  disp.className = 'timer-display';
  if(timerSec > timerMax*0.5){ disp.classList.add('green'); bar.style.background='#1adb6a'; }
  else if(timerSec > timerMax*0.25){ disp.classList.add('yellow'); bar.style.background='#f5c518'; }
  else { disp.classList.add('red'); bar.style.background='#ff4545'; }
  if (stealActive) {
  const h = document.getElementById('heartbeatAudio');
  if (h && !h.paused) {
      const progress = 1 - (timerSec / STEAL_TIME);

      // 🔊 stays maxed, no fade-in weakness
      h.volume = 1.0;

      // 💓 bigger speed ramp = more panic
      h.playbackRate = Math.min(1.75, 1.15 + progress * 0.6);
    }
  }
}

function pauseResume(){
  if (!timerInterval) return; // ✅ no timer = pause button does nothing

  timerPaused = !timerPaused;

  const btn = document.getElementById('pauseBtn');
  const bar = document.getElementById('timerBar');

  btn.textContent = timerPaused ? '▶ Resume' : '⏸ Pause';

  if (timerPaused) {
    if (audio) audio.pause();
    stopHeartbeat();

    if (bar) bar.classList.remove('running'); // 👈 STOP animation instantly

  } else {
    if (stealActive && stealingTeam !== null && timerInterval) {
      playHeartbeat();
    } else if (!stealActive) {
      if (audio) audio.play().catch(()=>{});
    }

    if (bar) bar.classList.add('running'); // 👈 resume smooth animation
  }
}

function activateSteal(){
  if (!currentCell) return;
  stopTimer();
  stopThinkMusic();
  stopHeartbeat();

  const q = questions[currentCell.col][currentCell.row];
  const penalty = Math.ceil(q.pts / 2);
  const teamName = teamNames[activeTeam] || `Team ${activeTeam + 1}`;

  const text = `
    <div style="font-size:1.4em; margin-bottom:10px;">
      ${teamName} risks a steal!
    </div>

    Question value: <span style="color:#f5c518; font-size:1.3em;">$${q.pts}</span><br>
    Penalty: <span style="color:#ef4444; font-size:1.3em;">-$${penalty}</span>
  `;

  document.getElementById('stealWarningText').innerHTML = text;
  document.getElementById('stealWarningBg').classList.add('open');
}

function confirmSteal(){
  document.getElementById('stealWarningBg').classList.remove('open');

  stealActive = true;
  stealingTeam = null;
  originalTeam = activeTeam;
  turnTeamBeforeSteal = activeTeam;
  stealPenaltyApplied = false;

  stopTimer();
  stopThinkMusic();
  stopHeartbeat();

  document.getElementById('stealBanner').classList.add('active');
  document.getElementById('stealBtn').disabled = true;

  timerSec = STEAL_TIME;
  timerMax = STEAL_TIME;
  timerPaused = false;

  updateTimerUI();
  triggerLightningFX();
  buildScoreboard();
  applyStealDimming();

  setTimeout(() => {
    rebuildScoreButtons();
  }, 50);
}

function cancelSteal(){
  document.getElementById('stealWarningBg').classList.remove('open');
}

function triggerLightningFX(){
  const old = document.querySelector('.lightning-flash');
  if (old) old.remove();

  const bolt = document.createElement('div');
  bolt.className = 'lightning-flash';
  document.body.appendChild(bolt);

  playStealSound();

  setTimeout(() => bolt.remove(), STEAL_BOLT_MS);
}

function playStealSound(){
  const s = document.getElementById('stealAudio');
  if (!s) return;

  s.pause();
  s.currentTime = 0;
  s.volume = 1.0;
  s.play().catch(()=>{});

  setTimeout(() => {
    s.pause();
    s.currentTime = 0;
  }, STEAL_THUNDER_MS);
}

function playHeartbeat(){
  const h = document.getElementById('heartbeatAudio');
  if (!h) return;

  h.pause();
  h.currentTime = 0;
  h.loop = true;
  h.volume = 1.0;        // 🔊 louder start
  h.playbackRate = 1.15;  // slightly faster base
  h.play().catch(()=>{});
}

function stopHeartbeat(){
  const h = document.getElementById('heartbeatAudio');
  if (!h) return;

  h.pause();
  h.currentTime = 0;
}

function playDunSound(){
  const d = document.getElementById('dunAudio');
  if (!d) return;

  d.pause();
  d.currentTime = 0;
  d.volume = 1.0;
  d.play().catch(()=>{});
}


// ── Modal ──────────────────────────────────────────────────────────────────
let currentCell = null;

function openModal(col, row){
  const saveName = getSaveName();
  const saved = localStorage.getItem(getSaveKey(saveName));
 if (viewOnlyMode) {
    alert("This class is locked (view‑only). Unlock it to make changes.");
    return;
  }
  currentCell = {col, row};
  questionWasRevealed = false;
  stealActive = false;

  const q = questions[col][row];
  const isDD = q.dailyDouble;

  const ddBanner = document.getElementById("dailyDoubleBanner");
  const wagerBox = document.getElementById("wagerBox");
  const wagerInput = document.getElementById("wagerInput");
  const timerRow = document.querySelector(".timer-row");
  const questionBlock = document.querySelector(".question-block");
  const answerSection = document.querySelector(".answer-section");
  const scoreButtons = document.getElementById("scoreButtons");

  if (ddBanner) ddBanner.style.display = isDD ? "block" : "none";
  if (wagerBox) wagerBox.style.display = isDD ? "block" : "none";
  if (wagerInput) wagerInput.value = isDD ? q.pts : "";
  if (wagerInput) {
    wagerInput.oninput = () => rebuildScoreButtons();
  }

  document.getElementById('modalPoints').textContent =
  isDD ? categories[col] : '$' + q.pts + ' · ' + categories[col];
  document.getElementById('pauseBtn').disabled = false;
// Answer (clue) — show immediately
  const modalQuestion = document.getElementById('modalQuestion');
  modalQuestion.textContent = q.answer || q.q || '';
  modalQuestion.style.display = 'block';

  // Question — hidden until reveal
  const answerEn = document.getElementById('answerEn');
  answerEn.textContent = q.question || q.a || '';
  answerEn.style.display = 'none';

  // Clean up reveal state
  document.getElementById('revealBtn').style.display = 'block';
  document.getElementById('answerRow').style.display = 'block';
  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) closeBtn.disabled = false;

  document.querySelectorAll('#scoreButtons button, #scoreButtons select').forEach(btn => {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  });
  document.getElementById('stealBanner').classList.remove('active');
  document.getElementById('stealBtn').disabled = false;
  document.getElementById('pauseBtn').textContent = '⏸ Pause';

  rebuildScoreButtons();
  document.getElementById('modalBg').classList.add('open');

  if (isDD) {
    triggerDailyDoubleFX();
    stopTimer();
    document.getElementById('stealBtn').style.display = 'none';

    if (timerRow) timerRow.style.display = "none";
    if (questionBlock) questionBlock.style.display = "none";
    if (answerSection) answerSection.style.display = "none";
    if (scoreButtons) scoreButtons.style.display = "none";
  } else {
    document.getElementById('stealBtn').style.display = 'inline-block';

    if (timerRow) timerRow.style.display = "flex";
    if (questionBlock) questionBlock.style.display = "block";
    if (answerSection) answerSection.style.display = "block";
    if (scoreButtons) scoreButtons.style.display = "flex";

    startTimer(FULL_TIME, FULL_TIME);
    playThinkMusic();
    syncModalScoreboard();
  }
}

function closeModal() {
  const modalBg = document.getElementById("modalBg");
  if (modalBg) modalBg.classList.remove("open");

  stopTimer();
  stopThinkMusic();
  stopHeartbeat(); // if you have this

  // 🔥 RESET DAILY DOUBLE UI
  const ddBanner = document.getElementById("dailyDoubleBanner");
  const wagerBox = document.getElementById("wagerBox");
  const questionBlock = document.querySelector(".question-block");
  const answerSection = document.querySelector(".answer-section");
  const scoreButtons = document.getElementById("scoreButtons");

  if (ddBanner) ddBanner.style.display = "none";
  if (wagerBox) wagerBox.style.display = "none";

  if (questionBlock) questionBlock.style.visibility = "visible";
  if (answerSection) answerSection.style.visibility = "visible";
  if (scoreButtons) scoreButtons.style.visibility = "visible";

  // Reset state
  stealActive = false;
  stealingTeam = null;

  currentCell = null;
}

function markCurrentCellAnswered(){
  if(currentCell){
    const {col, row} = currentCell;
    answered[col][row] = true;

    const cell = document.getElementById(`cell-${col}-${row}`);
    if (cell) {
      cell.classList.add('answered');
      cell.textContent = '';
      cell.onclick = null;
    }

    saveGame();
  }
}

function revealAnswer() {
  questionWasRevealed = true;

  stopTimer();
  stopThinkMusic();
  stopHeartbeat(); // ✅ add this

  document.getElementById('answerEn').style.display = 'block';
  document.getElementById('revealBtn').style.display = 'none';

  const stealBtn = document.getElementById('stealBtn');
  if (stealBtn) stealBtn.disabled = true;

  if (!stealActive) {
    stealingTeam = null;
  }

  const stealBanner = document.getElementById('stealBanner');
  if (stealBanner && !stealActive) stealBanner.classList.remove('active');

  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) pauseBtn.disabled = true;
}

function revealAndFreezeAfterScoring() {
  questionWasRevealed = true;
  stopTimer();
  stopThinkMusic();

  document.getElementById('answerEn').style.display = 'block';
  document.getElementById('revealBtn').style.display = 'none';

  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) closeBtn.disabled = false;

  const stealBtn = document.getElementById('stealBtn');
  if (stealBtn) stealBtn.disabled = true;

  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) pauseBtn.disabled = true;

  const scoreButtons = document.querySelectorAll('#scoreButtons button, #scoreButtons select');
  scoreButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  });

  stealActive = false;
  stealingTeam = null;

  const stealBanner = document.getElementById('stealBanner');
  if (stealBanner) stealBanner.classList.remove('active');
  stealActive = false;
  stealingTeam = null;
  applyStealDimming();
  buildScoreboard();
}


function rebuildScoreButtons(){
  const container = document.getElementById('scoreButtons');
  container.innerHTML = '';
  if(!currentCell) return;

  const q = questions[currentCell.col][currentCell.row];
  const basePts = q.pts;

  // DAILY DOUBLE
  if (q.dailyDouble) {
  const i = activeTeam;
  const name = teamNames[i] || 'Team ' + (i + 1);
  const wager = Number(document.getElementById("wagerInput")?.value) || basePts;

  const correctBtn = document.createElement('button');
  correctBtn.className = 'score-btn correct';
  correctBtn.textContent = '⚡ ' + name + ' Correct +$' + wager;
  correctBtn.onclick = () => awardPoint(i, wager);
  container.appendChild(correctBtn);

  const wrongBtn = document.createElement('button');
  wrongBtn.className = 'score-btn wrong';
  wrongBtn.textContent = '✕ ' + name + ' Wrong -$' + wager;
  wrongBtn.onclick = () => handleWrongAnswer(i);
  container.appendChild(wrongBtn);

    return;
  }

  // STEAL MODE: PICK STEALING TEAM FROM DROPDOWN
  if (stealActive && stealingTeam === null) {
    const stolenFromTeam = originalTeam; // freezes the team being stolen from

    const picker = document.createElement('select');
    picker.className = 'setup-select';
    picker.style.flex = '1';
    picker.style.minWidth = '220px';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose stealing team...';
    picker.appendChild(placeholder);

    scores.forEach((_, i) => {
      if (i === stolenFromTeam) return;

      const option = document.createElement('option');
      option.value = i;
      option.textContent = teamNames[i] || 'Team ' + (i + 1);
      picker.appendChild(option);
    });

    picker.onchange = () => {
      if (picker.value === '') return;

      stealingTeam = Number(picker.value);

      if (!stealPenaltyApplied && stolenFromTeam !== null && stolenFromTeam !== stealingTeam) {
        const halfPenalty = Math.ceil(basePts / 2);
        scores[stolenFromTeam] -= halfPenalty;
        stealPenaltyApplied = true;
      }

      activeTeam = stealingTeam;
      buildScoreboard();
      applyStealDimming();
      syncModalScoreboard?.();
      saveGame();

      const closeBtn = document.querySelector('.close-btn');
      if (closeBtn) closeBtn.disabled = true;

      rebuildScoreButtons();
      timerSec = STEAL_TIME;
      timerMax = STEAL_TIME;
      timerPaused = false;
      updateTimerUI();

      const pauseBtn = document.getElementById('pauseBtn');
      if (pauseBtn) {
        pauseBtn.disabled = false;
        pauseBtn.textContent = '⏸ Pause';
      }

      startTimer(STEAL_TIME, STEAL_TIME);
      playHeartbeat();
    };

      container.appendChild(picker);
    return;
  }

  // STEAL MODE: ONLY STEALING TEAM CAN SCORE
  if (stealActive && stealingTeam !== null) {
    const i = stealingTeam;
    const name = teamNames[i] || 'Team ' + (i + 1);

    const correctBtn = document.createElement('button');
    correctBtn.className = 'score-btn correct';
    const wager = Number(document.getElementById("wagerInput")?.value) || basePts;

    correctBtn.textContent = '⚡ ' + name + ' Correct +' + wager;
    correctBtn.onclick = () => awardPoint(i, basePts);
    container.appendChild(correctBtn);

    const wrongBtn = document.createElement('button');
    wrongBtn.className = 'score-btn wrong';
    wrongBtn.textContent = '✕ ' + name + ' Wrong -' + wager;
    wrongBtn.onclick = () => handleWrongAnswer(i);
    container.appendChild(wrongBtn);

    const changeBtn = document.createElement('button');
    changeBtn.className = 'score-btn skip';
    changeBtn.textContent = 'Choose Different Team';
    changeBtn.onclick = () => {
      stealingTeam = null;
      activeTeam = originalTeam;
      stopTimer();
      stopThinkMusic();

      timerSec = STEAL_TIME;
      timerMax = STEAL_TIME;
      timerPaused = false;
      updateTimerUI();
      buildScoreboard();
      rebuildScoreButtons();
      stopHeartbeat();
    };

    container.appendChild(changeBtn);
    return;
  }

  // NORMAL MODE: ONLY ACTIVE/HIGHLIGHTED TEAM CAN SCORE
  const i = activeTeam;
  const name = teamNames[i] || 'Team ' + (i + 1);

  const correctBtn = document.createElement('button');
  correctBtn.className = 'score-btn correct';
  correctBtn.textContent = name + ' Correct +' + basePts;
  correctBtn.onclick = () => awardPoint(i, basePts);
  container.appendChild(correctBtn);

  const wrongBtn = document.createElement('button');
  wrongBtn.className = 'score-btn wrong';
  wrongBtn.textContent = name + ' Wrong -' + basePts;
  wrongBtn.onclick = () => handleWrongAnswer(i);
  container.appendChild(wrongBtn);
}

function getDailyDoubleWager(){
  const wager = Number(document.getElementById("wagerInput")?.value);
  if (!wager || wager <= 0) {
    showAppAlert("Enter a wager!", "⚡ WAGER REQUIRED ⚡");
    return null;
  }
  return wager;
}

function handleWrongAnswer(teamIdx = activeTeam){
  if (!currentCell) return;

  // 🚫 prevent double click spam
  document.querySelectorAll('#scoreButtons button').forEach(b => b.disabled = true);

  // ⛔ stop everything immediately
  stopTimer();
  stopThinkMusic();

  const q = questions[currentCell.col][currentCell.row];

  if (q.dailyDouble) {
    const wager = getDailyDoubleWager();
    if (wager === null) return;
    updateScore(teamIdx, -wager);
  } else {
    updateScore(teamIdx, -q.pts);
  }

  playWrongSound();
  showResultFlash('wrong');

  const teamToAdvanceFrom = (stealActive && turnTeamBeforeSteal !== null)
    ? turnTeamBeforeSteal
    : teamIdx;

  revealAndFreezeAfterScoring();
  markCurrentCellAnswered();  
  stopHeartbeat(); // ✅ ensure tile clears

  advanceTurnFrom(teamToAdvanceFrom);
  turnTeamBeforeSteal = null;

  // OPTIONAL: auto close after 2 sec
  // setTimeout(closeModal, 2000);
}

function awardPoint(teamIdx, pts){
  if (!currentCell) return;

  // 🚫 prevent double click spam
  document.querySelectorAll('#scoreButtons button').forEach(b => b.disabled = true);

  // ⛔ stop everything immediately
  stopTimer();
  stopThinkMusic();

  const q = questions[currentCell.col][currentCell.row];

  // Daily Double override
  if (q.dailyDouble) {
    const wager = getDailyDoubleWager();
    if (wager === null) return;
    pts = wager;
  }

  updateScore(teamIdx, pts);
  playCorrectSound();
  showResultFlash('correct');

  const teamToAdvanceFrom = (stealActive && turnTeamBeforeSteal !== null)
    ? turnTeamBeforeSteal
    : teamIdx;

  revealAndFreezeAfterScoring();
  markCurrentCellAnswered();   // ✅ ensure tile clears

  advanceTurnFrom(teamToAdvanceFrom);
  turnTeamBeforeSteal = null;

  flashCorrect();
  stopHeartbeat();

  // OPTIONAL: auto close after 2 sec
  // setTimeout(closeModal, 2000);
}

function markAnswered(){
  if(currentCell){
    const {col, row} = currentCell;
    answered[col][row] = true;

    const cell = document.getElementById(`cell-${col}-${row}`);
    if (cell) {
      cell.classList.add('answered');
      cell.textContent = '';
      cell.onclick = null;
    }

    saveGame();
  }
}

function flashCorrect(){
  const f = document.getElementById('flash');
  f.className = 'flash correct show';
  setTimeout(()=>f.className='flash correct', 500);
}

function showResultFlash(type){
  const old = document.querySelector('.result-flash-text');
  if (old) old.remove();

  const div = document.createElement('div');
  div.className = `result-flash-text ${type}`;
  div.textContent = type === 'correct' ? 'CORRECT' : 'WRONG';

  document.body.appendChild(div);

 setTimeout(() => div.remove(), type === 'correct' ? 500 : 900);
}


function triggerDailyDoubleFX() {
  // SOUND
  stopThinkMusic();
  const audio = document.getElementById("dailyDoubleAudio");
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  // SCREEN FLASH
  const flash = document.createElement("div");
  flash.className = "dd-fullscreen-flash";
  document.body.appendChild(flash);

  setTimeout(() => flash.remove(), 1200);
}

function showQuestionContent(q) {
  document.getElementById('modalPoints').textContent = '$' + q.pts + ' · ' + categories[currentCell.col];

  document.getElementById('modalQuestion').textContent = q.answer || q.q || '';
  document.getElementById('modalQuestionEs').textContent = '';

  document.getElementById('answerEn').textContent = '❓ ' + (q.question || q.a || '');
}

function syncModalScoreboard() {
  const modalSB = document.getElementById('modalScoreboard');
  const mainSB = document.getElementById('scoreboard');
  if (!modalSB || !mainSB) return;

  modalSB.innerHTML = mainSB.innerHTML;

  modalSB.querySelectorAll('.team-card').forEach(card => {
    card.classList.remove('clickable');
    card.onclick = null;
  });
}

// ── Reset ──────────────────────────────────────────────────────────────────
function resetGame(){
  if (!categories.length || !questions.length) {
   showAppAlert("No game is currently loaded.", "⚠️ NO GAME LOADED ⚠️");
    return;
  }

  document.getElementById("resetBoardWarningBg").classList.add("open");
}

function cancelResetBoard() {
  document.getElementById("resetBoardWarningBg").classList.remove("open");
}

function confirmResetBoard() {
  document.getElementById("resetBoardWarningBg").classList.remove("open");

  scores = Array(teamCount).fill(0);
  activeTeam = 0;
  answered = Array.from({ length: categories.length }, () => Array(ROWS).fill(false));

  closeModal();
  buildScoreboard();
  buildBoard();
  saveGame();
}

function lockInWager(){
  const wager = getDailyDoubleWager();
  if (wager === null) return;
  const wagerBox = document.getElementById("wagerBox");
  if (wagerBox) wagerBox.style.display = "none";

  const timerRow = document.querySelector(".timer-row");
  const questionBlock = document.querySelector(".question-block");
  const answerSection = document.querySelector(".answer-section");
  const scoreButtons = document.getElementById("scoreButtons");

  if (timerRow) timerRow.style.display = "flex";
  if (questionBlock) questionBlock.style.display = "block";
  if (answerSection) answerSection.style.display = "block";
  if (scoreButtons) scoreButtons.style.display = "flex";

  startTimer(FULL_TIME, FULL_TIME);
  playThinkMusic();
}

// ── Audio ──────────────────────────────────────────────────────────────────
const audio = document.getElementById('thinkAudio');
const correctAudio = document.getElementById('correctAudio');
const wrongAudio = document.getElementById('wrongAudio');
if(audio) audio.volume = 0.7;
if(correctAudio) correctAudio.volume = 0.9;
if(wrongAudio) wrongAudio.volume = 0.9;

function playThinkMusic(){
  if(!audio || !audio.src) return;
  audio.loop = true; // 👈 important
  audio.currentTime = 0;
  audio.play().catch(()=>{});
}

function stopThinkMusic(){
  if(!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

function playEffect(sound){
  if(!sound || !sound.src) return;
  sound.pause();
  sound.currentTime = 0;
  sound.play().catch(()=>{});
}

function playCorrectSound(){ 
  setTimeout(() => playEffect(correctAudio), 200);
}
function playWrongSound(){ 
  setTimeout(() => playEffect(wrongAudio), 200);
}

// ── Saved Game Functions ────────────────────────────────────────────────────────

function saveGame() {
  const name = getSaveName();
  if (!name) return;

  // If teacher renamed the class/period, remove old save key
  if (currentEditName && currentEditName !== name) {
    localStorage.removeItem(getSaveKey(currentEditName));
  }

  currentEditName = name;

  const key = getSaveKey(name);

  const state = {
    categories,
    questions,
    answered,
    scores,
    teamNames,
    activeTeam,
    teamCount,
    subtitle: document.getElementById("gameSubtitleInput")?.value.trim() || "Review Game",
    savedAt: new Date().toISOString()
  };

  localStorage.setItem(key, JSON.stringify(state));
  refreshSavedGamesList();
}

function loadGame() {
  const saved = localStorage.getItem("jeopardyGame");
  if (!saved) return false;

  const state = JSON.parse(saved);

  categories = state.categories;
  questions = state.questions;
  answered = state.answered;
  teamCount = clampTeamCount(state.teamCount || state.scores?.length || 2);
  scores = Array.isArray(state.scores) ? state.scores.slice(0, teamCount) : Array(teamCount).fill(0);
  while (scores.length < teamCount) scores.push(0);
  teamNames = Array.isArray(state.teamNames) ? state.teamNames.slice(0, teamCount) : makeDefaultTeamNames(teamCount);
  while (teamNames.length < teamCount) teamNames.push(`Team ${teamNames.length + 1}`);
  activeTeam = Math.min(state.activeTeam || 0, teamCount - 1);
  setTeamCountControl(teamCount);

  return true;
}

function getSaveName() {
  const input = document.getElementById("saveNameInput");
  return input ? input.value.trim() : "";
}

function getSaveKey(name) {
  return "jeopardyGame::" + name;
}

function duplicateSavedGame(name) {
  const oldKey = getSaveKey(name);
  const saved = localStorage.getItem(oldKey);

  if (!saved) {
    showAppAlert("Saved game not found.", "⚠️ GAME NOT FOUND ⚠️");
    return;
  }

  const newName = prompt(`Duplicate "${name}" as:`, `${name} Copy`);
  if (!newName || !newName.trim()) return;

  const cleanName = newName.trim();
  const newKey = getSaveKey(cleanName);

  if (localStorage.getItem(newKey)) {
    alert(`A saved game named "${cleanName}" already exists.`);
    return;
  }

  const state = JSON.parse(saved);

  // ✅ Duplicate as a fresh game
  state.answered = Array.from(
    { length: state.categories.length },
    () => Array(ROWS).fill(false)
  );

  state.scores = Array(state.teamCount || 2).fill(0);
  state.activeTeam = 0;
  state.savedAt = new Date().toISOString();

  localStorage.setItem(newKey, JSON.stringify(state));
  refreshSavedGamesList();

  const banner = document.getElementById("draftSavedBanner");
  if (banner) {
    banner.textContent = `Duplicated as ${cleanName} ✓`;
    banner.style.display = "block";

    clearTimeout(draftBannerTimer);
    draftBannerTimer = setTimeout(() => {
      banner.style.display = "none";
      banner.textContent = "Draft saved ✓";
    }, 1400);
  }
}

// ── Teacher Builder ────────────────────────────────────────────────────────
const POINT_VALUES = [100, 200, 300, 400, 500];

function getCategoryCount(){
  const countEl = document.getElementById('categoryCount');
  return Math.max(2, Math.min(6, parseInt(countEl?.value || '5', 10)));
}

function buildTeacherFields(){
  const builder = document.getElementById('teacherBoardBuilder');
  if (!builder) return;

  const previous = readBuilderData(false);
  const count = getCategoryCount();
  builder.innerHTML = '';

  for (let c = 0; c < count; c++) {
    const savedCat = previous[c] || {};
    const section = document.createElement('div');
    section.className = 'category-editor';

    section.innerHTML = `
      <h3>Category ${c + 1}</h3>

      <input
        class="category-title-input"
        id="cat-title-${c}"
        placeholder="Category title"
        value="${escapeAttr(savedCat?.name || '')}"
      >

      <div class="qa-grid">
        <div class="qa-head">Points</div>
        <div class="qa-head">Answer</div>
        <div class="qa-head">Question</div>
        <div class="qa-head">DD</div>

        ${POINT_VALUES.map((pts, r) => {
          const item = savedCat.questions?.[r] || {};
          return `
            <div class="pts-label">$${pts}</div>

            <textarea
              id="answer-${c}-${r}"
              placeholder="Answer (what students see first)"
            >${escapeHtml(item.answer || '')}</textarea>

            <textarea
              id="question-${c}-${r}"
              placeholder="Question (what you reveal)"
            >${escapeHtml(item.question || '')}</textarea>

            <label class="dd-cell" title="Daily Double">
              <input
                type="checkbox"
                id="dd-${c}-${r}"
                ${item.dailyDouble ? 'checked' : ''}
              >
              <span class="dd-label">DD</span>
            </label>
          `;
        }).join('')}
      </div>
    `;

    builder.appendChild(section);
  }
}

function readBuilderData(requireComplete=true){
  const count = getCategoryCount();
  const data = [];

  for(let c=0; c<count; c++){
    const titleEl = document.getElementById(`cat-title-${c}`);
    const title = titleEl ? titleEl.value.trim() : '';
    const cat = { name: title, questions: [] };

    for(let r=0; r<ROWS; r++){
      const answer = document.getElementById(`answer-${c}-${r}`)?.value.trim() || '';
      const question = document.getElementById(`question-${c}-${r}`)?.value.trim() || '';
      const dd = document.getElementById(`dd-${c}-${r}`)?.checked || false;

      if(requireComplete && (!answer || !question)){
        alert(`Please fill in both the answer and question for ${title}, $${POINT_VALUES[r]}.`);
        return null;
      }

      cat.questions.push({
         pts: POINT_VALUES[r],
        answer,
        question,
        dailyDouble: dd
      });
    }

    data.push(cat);
  }

  return data;
}

function updateBuilderHeader(mode = "new", name = "") {
  const gameTitle = document.getElementById("gameTitle");
  const gameSubtitle = document.getElementById("gameSubtitle");
  const className = document.getElementById("builderClassName");

  const subtitleInput = document.getElementById("gameSubtitleInput");
  const saveInput = document.getElementById("saveNameInput");

  if (gameTitle) gameTitle.textContent = "⚡ Jeopardy ⚡";

  if (gameSubtitle) {
    gameSubtitle.textContent = subtitleInput?.value.trim() || "New Draft";
  }

  if (className) {
    className.textContent = saveInput?.value.trim() || "New Class / Period";
  }

}


function loadSampleBoard(){
  const countEl = document.getElementById('categoryCount');
  if(countEl) countEl.value = '5';
  buildTeacherFields();

  const sample = (typeof gradeData !== 'undefined' && gradeData['9']) ? gradeData['9'].subjects : [
    {name:'Vocabulary', questions:[
      {pts:100, q:'A person, place, thing, or idea.', a:'What is a noun?'},
      {pts:200, q:'An action word.', a:'What is a verb?'},
      {pts:300, q:'A describing word.', a:'What is an adjective?'},
      {pts:400, q:'A comparison using like or as.', a:'What is a simile?'},
      {pts:500, q:'The central message of a text.', a:'What is theme?'}
    ]},
    {name:'Grammar', questions:[
      {pts:100, q:'The past tense of go.', a:'What is went?'},
      {pts:200, q:'The past tense of eat.', a:'What is ate?'},
      {pts:300, q:'The past tense of write.', a:'What is wrote?'},
      {pts:400, q:'A complete sentence needs this and a verb.', a:'What is a subject?'},
      {pts:500, q:'A sentence that asks something.', a:'What is a question?'}
    ]},
    {name:'Reading', questions:[
      {pts:100, q:'The people in a story.', a:'Who are the characters?'},
      {pts:200, q:'Where and when a story happens.', a:'What is setting?'},
      {pts:300, q:'The problem in a story.', a:'What is conflict?'},
      {pts:400, q:'Events in order.', a:'What is sequence?'},
      {pts:500, q:'Using text details to support an answer.', a:'What is evidence?'}
    ]},
    {name:'Writing', questions:[
      {pts:100, q:'A capital letter starts this.', a:'What is a sentence?'},
      {pts:200, q:'A sentence that tells the main idea.', a:'What is a topic sentence?'},
      {pts:300, q:'Words like first, next, then, finally.', a:'What are sequence words?'},
      {pts:400, q:'A sentence that gives proof.', a:'What is evidence?'},
      {pts:500, q:'A final sentence that ends a paragraph.', a:'What is a conclusion?'}
    ]},
    {name:'Speaking', questions:[
      {pts:100, q:'Speaking loud enough to be heard.', a:'What is volume?'},
      {pts:200, q:'Looking at the audience.', a:'What is eye contact?'},
      {pts:300, q:'A helpful phrase students can complete.', a:'What is a sentence frame?'},
      {pts:400, q:'Taking turns in a discussion.', a:'What is conversation etiquette?'},
      {pts:500, q:'Explaining why your answer is correct.', a:'What is justification?'}
    ]}
  ];

  sample.slice(0,5).forEach((cat, c)=>{
    const titleEl = document.getElementById(`cat-title-${c}`);
    if(titleEl) titleEl.value = cat.name;
    cat.questions.slice(0,5).forEach((item, r)=>{
      const answerEl = document.getElementById(`answer-${c}-${r}`);
      const questionEl = document.getElementById(`question-${c}-${r}`);
      if(answerEl) answerEl.value = item.q || item.answer || '';
      if(questionEl) questionEl.value = item.a || item.question || '';
      const ddEl = document.getElementById(`dd-${c}-${r}`);
      if(ddEl) ddEl.checked = false;
    });
  });
}

function escapeHtml(value){
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;');
}

function escapeAttr(value){
  return escapeHtml(value).replaceAll('"','&quot;');
}


function getCurrentTemplateData(requireComplete=true){
  const builtData = readBuilderData(requireComplete);
  if (!builtData) return null;
  return {
    version: 1,
    subtitle: document.getElementById("gameSubtitleInput")?.value.trim() || "Review Game",
    categories: builtData.map(s => s.name),
    questions: builtData.map(s => s.questions)
  };
}

function loadTemplateIntoBuilder(template){
  if (!template || !Array.isArray(template.categories) || !Array.isArray(template.questions)) {
    alert("This does not look like a valid Jeopardy template.");
    return false;
  }

  const count = Math.max(2, Math.min(6, template.categories.length));
  const categoryCountEl = document.getElementById('categoryCount');
  if (categoryCountEl) categoryCountEl.value = String(count);
  buildTeacherFields();

  const subtitleInput = document.getElementById("gameSubtitleInput");
  if (subtitleInput && template.subtitle) subtitleInput.value = template.subtitle;

  template.categories.slice(0, count).forEach((catName, c) => {
    const titleEl = document.getElementById(`cat-title-${c}`);
    if (titleEl) titleEl.value = catName || `Category ${c + 1}`;

    (template.questions[c] || []).slice(0, ROWS).forEach((item, r) => {
      const answerEl = document.getElementById(`answer-${c}-${r}`);
      const questionEl = document.getElementById(`question-${c}-${r}`);
      const ddEl = document.getElementById(`dd-${c}-${r}`);
      if (answerEl) answerEl.value = item.answer || item.q || '';
      if (questionEl) questionEl.value = item.question || item.a || '';
      if (ddEl) ddEl.checked = !!item.dailyDouble;
    });
  });

  categories = template.categories.slice(0, count);
  questions = template.questions.slice(0, count);
  answered = Array.from({ length: categories.length }, () => Array(ROWS).fill(false));
  setupTeams(getSelectedTeamCount(), false);
  return true;
}

window.exportGameTemplate = function(){
  const template = getCurrentTemplateData(true);
  if (!template) return;

  const safeSubtitle = template.subtitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'jeopardy-game';

  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `${safeSubtitle}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

window.importGameTemplate = function(input){
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const template = JSON.parse(event.target.result);
      if (loadTemplateIntoBuilder(template)) {
        updateBuilderHeader();
        saveGame();
        showDraftSavedBanner();
      }
    } catch (err) {
      alert('Could not import this template. Make sure it is a valid .json file.');
      console.error(err);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
};

function startSessionFromCurrentTemplate(){
  const builtData = readBuilderData(true);
  if(!builtData) return false;

  categories = builtData.map(s => s.name);
  questions = builtData.map(s => s.questions);
  answered = Array.from({ length: categories.length }, () => Array(ROWS).fill(false));
  setupTeams(getSelectedTeamCount(), false);
  return true;
}

const BUILT_IN_TEMPLATES = [
  {
    name: "Past Tense Review",
    file: "templates/past-tense-review.json"
  },
  {
    name: "Amala's Hope Chapter 2",
    file: "templates/amala-hope-chapter-2.json"
  }
];

function populateBuiltInTemplates(){
  const select = document.getElementById("builtInTemplateSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Choose a template...</option>';

  BUILT_IN_TEMPLATES.forEach(template => {
    const option = document.createElement("option");
    option.value = template.file;
    option.textContent = template.name;
    select.appendChild(option);
  });
}

async function loadSelectedBuiltInTemplate(){
  const select = document.getElementById("builtInTemplateSelect");
  if (!select || !select.value) {
    showAppAlert("Choose a template first.", "⚠️ TEMPLATE REQUIRED ⚠️");
    return;
  }

  try {
    const res = await fetch(select.value);

    if (!res.ok) {
      throw new Error("Template file not found.");
    }

    const template = await res.json();

    if (loadTemplateIntoBuilder(template)) {
      updateBuilderHeader();
      saveGame();
      showDraftSavedBanner();
    }
  } catch (err) {
    showAppAlert("Could not load this template.", "⚠️ TEMPLATE ERROR ⚠️");
    console.error(err);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

function updateGameScreenHeader(name = "") {
  const titleMain = document.getElementById("gameTitleMain");
  const classLine = document.getElementById("gameClass");
  const subtitleInput = document.getElementById("gameSubtitleInput");

  if (titleMain) {
    titleMain.textContent = subtitleInput?.value.trim() || "Review Game";
  }

  if (classLine) {
    classLine.textContent = name || getSaveName() || "Class / Period";
  }
}
window.startGame = function () {
  viewOnlyMode = false;

  const saveName = getSaveName();
  currentEditName = saveName;

  if (!saveName) {
    showAppAlert(
      "Please enter a class / period name before starting.",
      "⚠️ CLASS / PERIOD REQUIRED ⚠️"
    );
    return;
  }

  const key = getSaveKey(saveName);
  const saved = localStorage.getItem(key);

  let shouldWarn = false;

  if (saved) {
    const state = JSON.parse(saved);

    const hasAnswered =
      state.answered &&
      state.answered.flat().some(v => v);

    const hasScores =
      state.scores &&
      state.scores.some(s => s !== 0);

    shouldWarn = hasAnswered || hasScores;
  }

  if (shouldWarn) {
    pendingStartFreshName = saveName;

    document.getElementById("startFreshWarningText").innerHTML = `
      A game for <span class="save-name">"${saveName}"</span> is already in progress.

      <ul>
        <li>↺ Reset scores</li>
        <li>□ Clear answered questions</li>
      </ul>

      Start fresh, or keep the current game?
    `;

    document.getElementById("startFreshWarningBg").classList.add("open");
    return;
  }

  if (!startSessionFromCurrentTemplate()) return;

  document.getElementById("teacherSetup").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("gameBottomBar").style.display = "block";

  updateGameScreenHeader(saveName);

  buildScoreboard();
  buildBoard();
  saveGame();
};

function cancelStartFresh() {
  pendingStartFreshName = null;
  document.getElementById("startFreshWarningBg").classList.remove("open");
}

function confirmStartFresh() {
  const saveName = pendingStartFreshName;
  pendingStartFreshName = null;

  document.getElementById("startFreshWarningBg").classList.remove("open");

  if (!saveName) return;

  if (!startSessionFromCurrentTemplate()) return;

  document.getElementById("teacherSetup").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("gameBottomBar").style.display = "block";

  updateGameScreenHeader(saveName);

  buildScoreboard();
  buildBoard();
  saveGame();
}

document.addEventListener('DOMContentLoaded', () => {
  newDraft();

  const teacherSetup = document.getElementById("teacherSetup");
  if (teacherSetup) teacherSetup.style.visibility = "visible";

  populateBuiltInTemplates();
  refreshSavedGamesList();
});

document.addEventListener("keydown", (e) => {
  if (!currentCell) return;

  const pts = questions[currentCell.col][currentCell.row].pts;

  if (e.key === " ") {
    e.preventDefault();
    revealAnswer(); // Space = reveal
  }

  if (/^[1-6]$/.test(e.key)) {
    const teamIdx = Number(e.key) - 1;
    const q = questions[currentCell.col][currentCell.row];
    if (q.dailyDouble) {
      if (teamIdx === activeTeam) awardPoint(activeTeam, pts);
    } else if (teamIdx < scores.length) {
      awardPoint(teamIdx, pts);
    }
  }

  if (e.key === "x" || e.key === "X") {
    handleWrongAnswer();
  }

  if (e.key === "Escape") {
    closeModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const active = document.activeElement;

  if (active.tagName === "TEXTAREA") {
    e.preventDefault();

    const all = Array.from(document.querySelectorAll(".qa-grid textarea"));
    const idx = all.indexOf(active);

    if (idx !== -1 && idx < all.length - 1) {
      all[idx + 1].focus();
    }
  }
});



let draftSaveTimer;
let draftBannerTimer;

function showDraftSavedBanner() {
  const banner = document.getElementById("draftSavedBanner");
  if (!banner) return;

  banner.style.display = "block";

  clearTimeout(draftBannerTimer);
  draftBannerTimer = setTimeout(() => {
    banner.style.display = "none";
  }, 1200);
}

document.addEventListener("input", (e) => {
  if (e.target.matches(
    ".qa-grid textarea, .category-title-input, #gameSubtitleInput, #saveNameInput"
  )) {
    scheduleBuilderAutosave();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.matches(
    ".dd-cell input, #categoryCount, #teamCount"
  )) {
    scheduleBuilderAutosave();
  }
});

function scheduleBuilderAutosave(){
  updateBuilderHeader();

  clearTimeout(draftSaveTimer);

  draftSaveTimer = setTimeout(() => {
    const template = getCurrentTemplateData(false);
    if (!template) return;

    categories = template.categories;
    questions = template.questions;
    answered = Array.from(
      { length: categories.length },
      () => Array(ROWS).fill(false)
    );

    saveGame();
    showDraftSavedBanner();
  }, DRAFT_SAVE_DELAY);
}

function clearDraft() {
  if (!confirm(
  "⚠️ WARNING\n\nThis will clear the entire form:\n• subtitle / unit name\n• class / period\n• all categories and questions\n\nClick OK to clear the form."
    )) return;

  localStorage.removeItem("jeopardyGame");

  categories = [];
  questions = [];
  answered = [];
  scores = Array(teamCount).fill(0);
  teamNames = makeDefaultTeamNames(teamCount);
  activeTeam = 0;

  document.querySelectorAll(".qa-grid textarea").forEach(box => box.value = "");
  document.querySelectorAll(".category-title-input").forEach((box, i) => {
    box.value = "";
    box.placeholder = `Category ${i + 1}`;
  });
  document.querySelectorAll(".dd-cell input").forEach(box => box.checked = false);

  const subtitleInput = document.getElementById("gameSubtitleInput");
  if (subtitleInput) {
    subtitleInput.value = "";
    subtitleInput.placeholder = "New Draft";
  }

  updateBuilderHeader();

  const banner = document.getElementById("draftSavedBanner");
  if (banner) {
    banner.textContent = "Draft cleared ✓";
    banner.style.display = "block";
    setTimeout(() => {
      banner.style.display = "none";
      banner.textContent = "Draft saved ✓";
    }, 1200);
  }
}

function newDraft() {
  currentEditName = null;

  const saveInput = document.getElementById("saveNameInput");
  const subtitleInput = document.getElementById("gameSubtitleInput");
  const categoryCountEl = document.getElementById("categoryCount");
  const teamCountEl = document.getElementById("teamCount");

  if (saveInput) {
    saveInput.value = "";
    saveInput.placeholder = "Class / Period Save Name";
  }

  if (subtitleInput) {
    subtitleInput.value = "";
    subtitleInput.placeholder = "New Draft";
  }

  if (categoryCountEl) categoryCountEl.value = "5";
  if (teamCountEl) teamCountEl.value = "2";

  categories = [];
  questions = [];
  answered = [];

  teamCount = 2;
  scores = Array(teamCount).fill(0);
  teamNames = makeDefaultTeamNames(teamCount);
  activeTeam = 0;

  // rebuild blank form
  buildTeacherFields();

  // force all inputs/checkboxes blank
  document.querySelectorAll(".category-title-input").forEach(input => {
    input.value = "";
  });

  document.querySelectorAll(".qa-grid textarea").forEach(textarea => {
    textarea.value = "";
  });

  document.querySelectorAll(".dd-cell input").forEach(box => {
    box.checked = false;
  });

  updateBuilderHeader();

  document.getElementById("teacherSetup").style.display = "block";
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("gameBottomBar").style.display = "none";

  refreshSavedGamesList();
}

function refreshSavedGamesList() {
  const container = document.getElementById("savedGamesList");
  if (!container) return;

  container.innerHTML = "";

  const keys = Object.keys(localStorage)
    .filter(k => k.startsWith("jeopardyGame::") && !k.includes("__draft__"))
    .sort();

  if (!keys.length) {
    container.innerHTML = "<em>No saved games yet.</em>";
    return;
  }

  keys.forEach(key => {
    const name = key.replace("jeopardyGame::", "");
    const data = JSON.parse(localStorage.getItem(key));
    const time = new Date(data.savedAt).toLocaleString();

    const row = document.createElement("div");
    row.style.marginBottom = "8px";

    const safeName = JSON.stringify(name);

    row.innerHTML = `
      <strong>${data.subtitle || "New Draft"}</strong><br>
      <small>${name}</small><br>
      <small>Last saved: ${time}</small><br>
      <button onclick='resumeSavedGame(${safeName})'>Resume</button>
      <button onclick='editSavedGame(${safeName})'>Edit</button>
      <button onclick='duplicateSavedGame(${safeName})'>Duplicate</button>
      <button onclick='deleteSavedGame(${safeName})'>Delete</button>
    `;

    container.appendChild(row);
  });
}

function resumeSavedGame(name) {
  const key = getSaveKey(name);
  const saved = localStorage.getItem(key);

  if (!saved) {
    alert("Saved game not found.");
    return;
  }

  currentEditName = name;
  const state = JSON.parse(saved);

  const hasCompleteCategories =
  Array.isArray(state.categories) &&
  state.categories.length >= 2 &&
  state.categories.every(cat => String(cat || "").trim());

  const hasCompleteQuestions =
    Array.isArray(state.questions) &&
    state.questions.length === state.categories.length &&
    state.questions.every(category =>
      Array.isArray(category) &&
      category.length === ROWS &&
      category.every(q =>
        String(q.answer || q.q || "").trim() &&
        String(q.question || q.a || "").trim()
      )
    );

  if (!hasCompleteCategories || !hasCompleteQuestions) {
    showAppAlert(
      "This saved game is incomplete.<br><br>Click <span class='save-name'>Edit</span> and finish all categories, answers, and questions before resuming.",
      "⚠️ SAVED GAME INCOMPLETE ⚠️"
    );
  }

  const selectedTeamCount = getSelectedTeamCount();
  const savedTeamCount = clampTeamCount(state.teamCount || state.scores?.length || 2);

  const teamCountChanged = selectedTeamCount !== savedTeamCount;

  if (teamCountChanged) {
    const ok = confirm(
      `You've changed the number of teams from ${savedTeamCount} to ${selectedTeamCount}.

  This will reset:
  • scores
  • answered questions
  • active team

  Do you wish to proceed?`
    );

    if (!ok) return;

    state.teamCount = selectedTeamCount;
    state.scores = Array(selectedTeamCount).fill(0);
    state.teamNames = makeDefaultTeamNames(selectedTeamCount);
    state.activeTeam = 0;
    state.answered = Array.from(
      { length: state.categories.length },
      () => Array(ROWS).fill(false)
    );
    state.savedAt = new Date().toISOString();

    localStorage.setItem(key, JSON.stringify(state));
  }

  categories = state.categories;
  questions = state.questions;
  answered = state.answered;
  teamCount = clampTeamCount(state.teamCount || 2);
  scores = Array.isArray(state.scores) ? state.scores.slice(0, teamCount) : Array(teamCount).fill(0);
  while (scores.length < teamCount) scores.push(0);

  teamNames = Array.isArray(state.teamNames) ? state.teamNames.slice(0, teamCount) : makeDefaultTeamNames(teamCount);
  while (teamNames.length < teamCount) teamNames.push(`Team ${teamNames.length + 1}`);

  activeTeam = Math.min(state.activeTeam || 0, teamCount - 1);
  viewOnlyMode = false;

  setTeamCountControl(teamCount);

  const saveInput = document.getElementById("saveNameInput");
  const subtitleInput = document.getElementById("gameSubtitleInput");

  if (saveInput) saveInput.value = name;
  if (subtitleInput) subtitleInput.value = state.subtitle || "New Draft";

  document.getElementById("teacherSetup").style.display = "none";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("gameBottomBar").style.display = "block";

  updateGameScreenHeader(name);

  buildScoreboard();
  buildBoard();
}

function deleteSavedGame(name) {
  const ok = confirm(`Delete saved game "${name}"?\nThis cannot be undone.`);
  if (!ok) return;

  localStorage.removeItem(getSaveKey(name));
  localStorage.removeItem("jeopardyGame::" + name);
  localStorage.removeItem(name);

  refreshSavedGamesList();
}

function editSavedGame(name) {
  const key = getSaveKey(name);
  const saved = localStorage.getItem(key);

  if (!saved) {
    alert("Saved game not found.");
    return;
  }

  currentEditName = name;

  const state = JSON.parse(saved);

  const saveInput = document.getElementById("saveNameInput");
  const subtitleInput = document.getElementById("gameSubtitleInput");
  const categoryCountEl = document.getElementById("categoryCount");

  if (saveInput) saveInput.value = name;
  if (subtitleInput) subtitleInput.value = state.subtitle || "";

  if (categoryCountEl) {
    categoryCountEl.value = String(Math.max(2, Math.min(6, state.categories.length)));
  }

  loadTemplateIntoBuilder({
    categories: state.categories,
    questions: state.questions,
    subtitle: state.subtitle || ""
  });

  updateBuilderHeader("edit", name);

  document.getElementById("teacherSetup").style.display = "block";
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("gameBottomBar").style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function quitToBuilder(){
  closeModal();

  document.getElementById("gameArea").style.display = "none";
  document.getElementById("teacherSetup").style.display = "block";
  document.getElementById("gameBottomBar").style.display = "none";

  buildTeacherFields();
  refreshSavedGamesList();
  updateBuilderHeader();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAppAlert(message, title = "⚠️ WARNING ⚠️") {
  const titleEl = document.getElementById("appAlertTitle");
  const textEl = document.getElementById("appAlertText");
  const bg = document.getElementById("appAlertBg");

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.innerHTML = message;
  if (bg) bg.classList.add("open");
}

function closeAppAlert() {
  const bg = document.getElementById("appAlertBg");
  if (bg) bg.classList.remove("open");
}



