// ================================
// Piano Trainer – Full app.js
// ================================

document.addEventListener("DOMContentLoaded", () => {
    MidiInput.mode = "mock"; // ברירת מחדל


const GROQ_API_KEY = window.APP_CONFIG?.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  alert("Missing Groq API key (config.js)");
  return;
}


// ---------- Utils ----------
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Note pools per finger count
// 3 fingers: B,C,D,E (right) / G,A,B (left)
// 4 fingers: B,C,D,E,F,G (right) / G,A,B,C,D (left)
const RIGHT_HAND_3F = Array.from({ length: 6 }, (_, i) => 59 + i); // B3–D#4
const RIGHT_HAND_4F = Array.from({ length: 9 }, (_, i) => 59 + i); // B3–G4
const LEFT_HAND_3F  = Array.from({ length: 5 }, (_, i) => 43 + i); // G2–B2
const LEFT_HAND_4F  = Array.from({ length: 10 }, (_, i) => 43 + i); // G2–C#3+

function getRightNotes() { return fourFingers ? RIGHT_HAND_4F : RIGHT_HAND_3F; }
function getLeftNotes()  { return fourFingers ? LEFT_HAND_4F : LEFT_HAND_3F; }

// Note durations (in seconds at 80 BPM)
const TEMPO_BPM = 80;
const BEAT_DURATION = 60 / TEMPO_BPM; // One beat in seconds
const DURATIONS = [
  { name: "q", display: "♩ רבע", vexflow: "q", seconds: BEAT_DURATION, tolerance: 0.3 },
  { name: "h", display: "𝅗𝅥 חצי", vexflow: "h", seconds: BEAT_DURATION * 2, tolerance: 0.4 },
  { name: "w", display: "𝅝 שלם", vexflow: "w", seconds: BEAT_DURATION * 4, tolerance: 0.6 }
];

// Named chords (matched by pitch class – any octave accepted)
const CHORD_DEFS = [
  { label: "C",  notes: [60, 64, 67] },       // C, E, G
  { label: "F",  notes: [65, 69, 72] },       // F, A, C
  { label: "G",  notes: [67, 71, 74] },       // G, B, D
  { label: "Am", notes: [69, 72, 76] },       // A, C, E
  { label: "Bb", notes: [70, 74, 77] },       // Bb, D, F
  { label: "G7", notes: [67, 71, 74, 77] },   // G, B, D, F
  { label: "A7", notes: [69, 73, 76, 79] },   // A, C#, E, G
];

// Same chords for both hands, different octave for drawing
const RIGHT_HAND_CHORDS = CHORD_DEFS.map(c => ({
  ...c, display: c.label, chordName: c.label
}));
const LEFT_HAND_CHORDS = CHORD_DEFS.map(c => ({
  ...c,
  notes: c.notes.map(n => n - 12), // one octave lower for bass clef
  display: c.label, chordName: c.label
}));

function midiToNoteName(midi) {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// Display name without octave
function midiToDisplayName(midi) {
  return NOTE_NAMES[midi % 12];
}

// Check if two MIDI notes are the same pitch class (ignore octave)
function samePitchClass(midi1, midi2) {
  return midi1 % 12 === midi2 % 12;
}

// ---------- State ----------
let expected = null;
let noteColor = "black";
let correctCount = 0;
let wrongCount = 0;
let firstAttempt = true;

let rightHandMode = "notes"; // "notes", "chords", or "none"
let leftHandMode = "none";  // "notes", "chords", or "none"
let showNoteNames = true;
let fourFingers = false;
let isProcessing = false; // Prevent double counting during transition
let noteStartTime = null; // Track when note was pressed
let lastPressedNote = null; // Track which note is currently pressed
let metronomeEnabled = false;
let metronomeInterval = null;
let lastAgentSuggestion = null;
let agentBusy = false;
let learningMode = false;


// Mistakes tracking
let mistakesLog = {
  notes: {}, // { "E3": { count: 5, hand: "left" }, ... }
  chords: {}, // { "C3+E3+G3": { count: 2 }, ... }
  durations: {} // { "E3-half": { count: 3, duration: "חצי" }, ... }
};


window.mistakesLog = mistakesLog;


// Practice sequence
let practiceSequence = null;
let practiceIndex = 0;
let practiceMode = false;
let focusedRound = 0;
let focusedMistakesInRound = 0;
let focusedBestScore = Infinity;


// ---------- DOM ----------
const statusEl = document.getElementById("status");
const connectBtn = document.getElementById("connect");
const expectedNoteEl = document.getElementById("expectedNote");
const staffEl = document.getElementById("staff");
const correctCountEl = document.getElementById("correctCount");
const wrongCountEl = document.getElementById("wrongCount");
const rightHandModeEl = document.getElementById("rightHandMode");
const leftHandModeEl = document.getElementById("leftHandMode");
const toggleNoteNamesEl = document.getElementById("toggleNoteNames");
const toggleDurationsEl = document.getElementById("toggleDurations");
let checkDurations = toggleDurationsEl.checked;

const toggleMetronomeEl = document.getElementById("toggleMetronome");
const toggleLearningModeEl = document.getElementById("toggleLearningMode");
const resetScoreBtn = document.getElementById("resetScore");
const practiceSequenceDisplay = document.getElementById("practiceSequenceDisplay");
const startPracticeBtn = document.getElementById("startPractice");
const practiceProgressEl = document.getElementById("practiceProgress");
const virtualKeyboard = document.getElementById("virtualKeyboard");
const keysContainer = document.getElementById("keys");

//const mockMidiBtn = document.getElementById("mockMidi");
const mockMidiToggle = document.getElementById("mockMidiToggle");
MidiInput.mode = mockMidiToggle.checked ? "mock" : "real";



    

const VIRTUAL_KEYS = [
  { name: "C", midi: 60 },
  { name: "D", midi: 62 },
  { name: "E", midi: 64 },
  { name: "F", midi: 65 },
  { name: "G", midi: 67 },
  { name: "A", midi: 69 },
  { name: "B", midi: 71 }
];

// Init based on mock toggle default
if (mockMidiToggle.checked) {
  MidiInput.mode = "mock";
  virtualKeyboard.style.display = "block";
  renderVirtualKeyboard();
} else {
  MidiInput.mode = "real";
  virtualKeyboard.style.display = "none";
}

function renderVirtualKeyboard() {
  keysContainer.innerHTML = "";
  VIRTUAL_KEYS.forEach(k => {
    const el = document.createElement("div");
    el.className = "virtual-key";
    el.textContent = k.name;
    el.onclick = () => playNote(k.midi); // משתמש ב-Mock הקיים
    keysContainer.appendChild(el);
  });
}






//MidiInput.mode = "mock"; // ⬅️ ברירת מחדל

mockMidiToggle.addEventListener("change", async () => {
  if (mockMidiToggle.checked) {
    MidiInput.mode = "mock";
    await MidiInput.init(handleMIDIMessage);
    statusEl.textContent = "🎹 Mock MIDI פעיל";
    statusEl.style.color = "blue";
        virtualKeyboard.style.display = "block";
    renderVirtualKeyboard();
  } else {
    statusEl.textContent = "Mock כבוי – לחצי 'חבר MIDI'";
    statusEl.style.color = "gray";
        virtualKeyboard.style.display = "none";

  }

if (!practiceMode) {
  pickExpectedNote();
}});







// ---------- Hand mode ----------
rightHandModeEl.addEventListener("change", () => {
  rightHandMode = rightHandModeEl.value;
  if (!practiceMode) pickExpectedNote();
});

leftHandModeEl.addEventListener("change", () => {
  leftHandMode = leftHandModeEl.value;
  if (!practiceMode) pickExpectedNote();
});

// ---------- Toggles ----------
toggleNoteNamesEl.addEventListener("change", () => {
  showNoteNames = toggleNoteNamesEl.checked;
  if (expected) {
    if (expected.mode === "together") drawTwoHands(expected);
    else drawSingle(expected);
  }
});

toggleDurationsEl.addEventListener("change", () => {
  checkDurations = toggleDurationsEl.checked;
});

// ---------- Metronome ----------
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playMetronomeClick() {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  // Wood block sound - quick attack and decay
  oscillator.frequency.value = 800; // Lower frequency for warmer sound
  oscillator.type = "sine"; // Smoother sine wave
  
  // Quick fade out for "click" effect
  gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.03); // Very short 30ms
}

function startMetronome() {
  if (metronomeInterval) return; // Already running
  
  const intervalMs = (60 / TEMPO_BPM) * 1000; // Convert BPM to milliseconds
  playMetronomeClick(); // Play immediately
  metronomeInterval = setInterval(playMetronomeClick, intervalMs);
}

function stopMetronome() {
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }
}

toggleMetronomeEl.addEventListener("change", () => {
  metronomeEnabled = toggleMetronomeEl.checked;
  if (metronomeEnabled) {
    startMetronome();
  } else {
    stopMetronome();
  }
});

toggleLearningModeEl.addEventListener("change", () => {
  learningMode = toggleLearningModeEl.checked;
});

const toggle4FingersEl = document.getElementById("toggle4Fingers");
toggle4FingersEl.addEventListener("change", () => {
  fourFingers = toggle4FingersEl.checked;
  if (!practiceMode) pickExpectedNote();
});

// ---------- Chord Dialog ----------
const chordDialogOverlay = document.getElementById("chordDialogOverlay");
const chordCardsEl = document.getElementById("chordCards");
document.getElementById("showChordsBtn").addEventListener("click", () => {
  renderChordCards();
  chordDialogOverlay.classList.add("open");
});
document.getElementById("closeChordDialog").addEventListener("click", () => {
  chordDialogOverlay.classList.remove("open");
});
chordDialogOverlay.addEventListener("click", (e) => {
  if (e.target === chordDialogOverlay) chordDialogOverlay.classList.remove("open");
});

function renderChordCards() {
  chordCardsEl.innerHTML = "";
  // One octave of white keys: C D E F G A B (MIDI 60-71)
  const WHITE_KEYS = [
    { note: "C", midi: 60 }, { note: "D", midi: 62 }, { note: "E", midi: 64 },
    { note: "F", midi: 65 }, { note: "G", midi: 67 }, { note: "A", midi: 69 }, { note: "B", midi: 71 }
  ];
  // Black keys with positions (offset from left of parent white key)
  const BLACK_KEYS = [
    { note: "C#", midi: 61, afterWhite: 0 }, // between C and D
    { note: "D#", midi: 63, afterWhite: 1 }, // between D and E
    { note: "F#", midi: 66, afterWhite: 3 }, // between F and G
    { note: "G#", midi: 68, afterWhite: 4 }, // between G and A
    { note: "A#", midi: 70, afterWhite: 5 }, // between A and B (= Bb)
  ];

  CHORD_DEFS.forEach(chord => {
    const card = document.createElement("div");
    card.className = "chord-card";

    const title = document.createElement("h3");
    title.textContent = chord.label;
    card.appendChild(title);

    // Mini piano
    const piano = document.createElement("div");
    piano.className = "mini-piano";

    const pressedPitchClasses = new Set(chord.notes.map(n => n % 12));
    const whiteKeyWidth = 32;

    // White keys
    WHITE_KEYS.forEach((wk) => {
      const key = document.createElement("div");
      key.className = "white-key" + (pressedPitchClasses.has(wk.midi % 12) ? " pressed" : "");
      const label = document.createElement("span");
      label.className = "key-label";
      label.textContent = wk.note;
      key.appendChild(label);
      piano.appendChild(key);
    });

    // Black keys (absolute positioned)
    BLACK_KEYS.forEach((bk) => {
      const key = document.createElement("div");
      key.className = "black-key" + (pressedPitchClasses.has(bk.midi % 12) ? " pressed" : "");
      key.style.left = ((bk.afterWhite + 1) * whiteKeyWidth - 10) + "px";
      piano.appendChild(key);
    });

    card.appendChild(piano);
    chordCardsEl.appendChild(card);
  });
}

// ---------- Reset Score ----------
resetScoreBtn.addEventListener("click", () => {
    mistakesLog = { notes: {}, chords: {}, durations: {} };
window.mistakesLog = mistakesLog;
lastAgentSuggestion = null;

  correctCount = 0;
  wrongCount = 0;
  correctCountEl.textContent = correctCount;
  wrongCountEl.textContent = wrongCount;
  console.log("🔄 Score reset!");
});

// ---------- Mistakes Logging ----------
function logMistake(type, data) {
  console.log("📝 Logging mistake:", type, data);
  
  if (type === "note") {
    const key = data.name;
    if (!mistakesLog.notes[key]) {
      mistakesLog.notes[key] = { count: 0, hand: data.hand };
    }
    mistakesLog.notes[key].count++;
  } else if (type === "chord") {
    const key = data.chordName;
    if (!mistakesLog.chords[key]) {
      mistakesLog.chords[key] = { count: 0 };
    }
    mistakesLog.chords[key].count++;
  } else if (type === "duration") {
    const key = `${data.name}-${data.duration.name}`;
    if (!mistakesLog.durations[key]) {
      mistakesLog.durations[key] = { 
        count: 0, 
        noteName: data.name,
        duration: data.duration.display,
        hand: data.hand
      };
    }
    mistakesLog.durations[key].count++;
  }
  
  console.log("Current mistakes log:", mistakesLog);

  if (practiceMode) {
  focusedMistakesInRound++;
}


}


  
  


function showAgentHint(text) {
  expectedNoteEl.textContent = `🎯 ${text}`;
}


// ---------- Parse Practice Sequence ----------
window.parsePracticeSequence = function parsePracticeSequence(text) {
  const sequence = [];
  const lines = text.split('\n');

  const normalizeNote = n =>
    /[0-9]/.test(n) ? n : `${n}4`; // ברירת מחדל לאוקטבה 4

  for (const line of lines) {
    const match = line.match(
      /([A-G][#b]?(?:\d)?(?:\+[A-G][#b]?(?:\d)?)*),\s*(Right|Left),\s*(Quarter|Half|Whole|q|h|w)/i
    );

    if (!match) continue;

    const rawNoteName = match[1];
    const hand = match[2].toLowerCase();
    const durationStr = match[3].toLowerCase();

    const normalizedName = rawNoteName
      .split("+")
      .map(normalizeNote)
      .join("+");

    let duration;
    if (durationStr === "quarter" || durationStr === "q") {
      duration = DURATIONS[0];
    } else if (durationStr === "half" || durationStr === "h") {
      duration = DURATIONS[1];
    } else {
      duration = DURATIONS[2];
    }

    if (normalizedName.includes("+")) {
      // chord
      const chordNotes = normalizedName
        .split("+")
        .map(n => noteNameToMidi(n));

      sequence.push({
        mode: "chord",
        hand,
        chord: chordNotes,
        chordName: normalizedName,
        duration
      });
    } else {
      // single note
      const midi = noteNameToMidi(normalizedName);

      sequence.push({
        mode: "single",
        midi,
        hand,
        name: normalizedName,
        duration
      });
    }
  }

  console.log("🎼 Parsed sequence:", sequence);
  return sequence;
};


// ---------- Note Name to MIDI ----------
function noteNameToMidi(noteName) {
  // Convert "C4" to MIDI number 60
  const noteMatch = noteName.match(/([A-G][#b]?)(\d)/);
  if (!noteMatch) return 60; // default
  
  const note = noteMatch[1];
  const octave = parseInt(noteMatch[2]);
  
  const noteMap = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11
  };
  
  return (octave + 1) * 12 + noteMap[note];
}


function enterFocusedPractice(sequence) {
  practiceSequence = sequence;
  practiceIndex = 0;
  practiceMode = true;
  focusedRound = 0;
    focusedMistakesInRound = 0;
    focusedBestScore = Infinity;



  showPracticeNote();
}



// ---------- Show Practice Note ----------
function showPracticeNote() {
 if (!practiceMode || practiceIndex >= practiceSequence.length) {
  focusedRound++;

  if (focusedMistakesInRound < focusedBestScore) {
    focusedBestScore = focusedMistakesInRound;
  }

  // הצלחה – כמעט בלי טעויות
  if (focusedMistakesInRound <= 1) {
    expectedNoteEl.textContent = "✅ נראה שזה התייצב";
    setTimeout(exitFocusedPractice, 1200);
    return;
  }

  // חזרה על אותו רצף (עד 3 פעמים)
  if (focusedRound < 3) {
    expectedNoteEl.textContent = "🔁 ננסה שוב לחזק את זה";
    focusedMistakesInRound = 0;
    practiceIndex = 0;
    setTimeout(showPracticeNote, 800);
    return;
  }

  // יותר מדי סיבובים
  expectedNoteEl.textContent = "🟡 נעצור כאן ונמשיך הלאה";
  setTimeout(exitFocusedPractice, 1200);
  return;
}


  const item = practiceSequence[practiceIndex];
  expected = item;
  noteColor = "black";
  firstAttempt = true;
  isProcessing = false;
  
  // Update progress
  practiceProgressEl.textContent = `${practiceIndex + 1} / ${practiceSequence.length}`;
  
  // Display the note
  if (item.mode === "chord") {
    expected.pressed = new Set();
    let msg = `${item.hand === "right" ? "יד ימין" : "יד שמאל"} - אקורד`;
    if (showNoteNames) {
      msg += ` (${item.chordName})`;
    }
    if (checkDurations) {
      msg += ` ${item.duration.display}`;
    }
    expectedNoteEl.textContent = msg;
    drawChord(expected);
  } else {
    let msg = item.hand === "right" ? "יד ימין" : "יד שמאל";
    if (showNoteNames) {
      msg += ` (${item.name})`;
    }
    if (checkDurations) {
      msg += ` ${item.duration.display}`;
    }
    
    expectedNoteEl.textContent = msg;
    drawSingle(expected);
  }
}

// ---------- Update MIDI Handler for Practice Mode ----------
// We need to modify the existing MIDI handler to move to next note in practice mode
// This will be added at the end of successful note/chord completion

// ---------- Custom Sequence ----------

// ---------- MIDI ----------

connectBtn.addEventListener("click", async () => {
  try {
    mockMidiToggle.checked = false;
    MidiInput.mode = "real";

    statusEl.textContent = "מתחבר ל-MIDI...";
    statusEl.style.color = "orange";

    await MidiInput.init(handleMIDIMessage);

    statusEl.textContent = "🎹 מחובר ל-MIDI אמיתי";
    statusEl.style.color = "green";
if (!practiceMode) {
  pickExpectedNote();
}

  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.style.color = "red";
  }
});


// ---------- Exit Focused Practice ----------
function exitFocusedPractice() {
  practiceMode = false;
  practiceSequence = null;
  practiceIndex = 0;

  mistakesLog = { notes: {}, chords: {}, durations: {} };
  window.mistakesLog = mistakesLog;

  practiceProgressEl.textContent = "";

 pickExpectedNote();
}



// ---------- Maybe Enter Focused Practice ----------
async function maybeEnterFocusedPractice() {
  if (!learningMode) return;
  if (practiceMode) return;
  if (agentBusy) return;

  const decision = shouldEnterFocusedPractice(mistakesLog, lastAgentSuggestion);
  if (!decision.enter) return;

  agentBusy = true;
  lastAgentSuggestion = Date.now();

  // 👇 החיווי
  expectedNoteEl.textContent = "🎯 מזהה קושי… יוצר תרגול ממוקד";
  practiceProgressEl.textContent = "⏳ פונה ל-Groq…";

  const sequence = await createFocusedPractice({
    mistakes: mistakesLog
  });

  agentBusy = false;

  if (!sequence || sequence.length === 0) {
    practiceProgressEl.textContent = "";
    expectedNoteEl.textContent = "⚠️ לא הצלחתי לבנות תרגול";
    return;
  }

  // 👇 רק עכשיו נכנסים למצב תרגול
  enterFocusedPractice(sequence);
}

// ---------- Pick expected ----------
function pickExpectedNote() {
    if (practiceMode) {
  console.error("❌ pickExpectedNote CALLED DURING PRACTICE");
  console.trace();
  return;
}

  console.log("🔄 PICKING NEW NOTE - resetting flags");
  firstAttempt = true;
  noteColor = "black";
  isProcessing = false;

  // Build list of active hands and their modes
  const options = [];
  if (rightHandMode !== "none") options.push({ hand: "right", mode: rightHandMode });
  if (leftHandMode !== "none") options.push({ hand: "left", mode: leftHandMode });

  if (options.length === 0) {
    expectedNoteEl.textContent = "בחר לפחות יד אחת";
    return;
  }

  // Pick a random active hand
  const pick = options[Math.floor(Math.random() * options.length)];
  const pool = pick.hand === "right" ? getRightNotes() : getLeftNotes();
  const chords = pick.hand === "right" ? RIGHT_HAND_CHORDS : LEFT_HAND_CHORDS;
  const handLabel = pick.hand === "right" ? "יד ימין" : "יד שמאל";

  if (pick.mode === "chords") {
    const chord = chords[Math.floor(Math.random() * chords.length)];
    expected = {
      mode: "chord",
      hand: pick.hand,
      chord: chord.notes,
      chordName: chord.display,
      pressed: new Set()
    };
    let msg = `${handLabel} - אקורד`;
    if (showNoteNames) msg += ` ${chord.label}`;
    expectedNoteEl.textContent = msg;
    drawChord(expected);
    return;
  }

  // notes mode
  const midi = pool[Math.floor(Math.random() * pool.length)];
  const duration = DURATIONS[Math.floor(Math.random() * DURATIONS.length)];
  console.log(`🎲 Picked MIDI ${midi} (${midiToNoteName(midi)}) from pool of ${pool.length} chromatic notes [${pool[0]}–${pool[pool.length-1]}]`);

  expected = {
    mode: "single",
    midi,
    hand: pick.hand,
    name: midiToNoteName(midi),
    displayName: midiToDisplayName(midi),
    duration: duration
  };

  let msg = `${handLabel} - תו`;
  if (showNoteNames) msg += ` ${expected.displayName}`;
  if (checkDurations) msg += ` ${duration.display}`;
  expectedNoteEl.textContent = msg;
  drawSingle(expected);
}

// ---------- MIDI handler ----------
function handleMIDIMessage(e) {
  const [status, note, velocity] = e.data;
  console.log("MIDI:", status, note, velocity, "firstAttempt:", firstAttempt, "isProcessing:", isProcessing);
  
  // Check if this is a note-off message (status 128-143 or velocity 0)
  const isNoteOff = (status >= 128 && status < 144) || velocity === 0;

  if (practiceMode && !practiceSequence) return;

  
 if (status >= 0xF8) return;

if (!expected) {
  console.warn("MIDI event while expected is null", { practiceMode });
  return;
}

  if (isProcessing && !isNoteOff) return; // Block new note-on when processing

  // ----- HANDLE NOTE RELEASE (for duration checking) -----
  if (isNoteOff && checkDurations && expected.mode === "single" && note === lastPressedNote && noteStartTime !== null) {
    const noteDuration = (Date.now() - noteStartTime) / 1000; // Duration in seconds
    const expectedDuration = expected.duration.seconds;
    const tolerance = expected.duration.tolerance;
    
    console.log(`Note released after ${noteDuration.toFixed(2)}s, expected ${expectedDuration.toFixed(2)}s ±${tolerance}s`);
    
    const durationCorrect = Math.abs(noteDuration - expectedDuration) <= tolerance;
    
    if (durationCorrect) {
      console.log("✅ Duration correct!");
      if (firstAttempt) {
        correctCount++;
        correctCountEl.textContent = correctCount;
        firstAttempt = false;
      }
      isProcessing = true;
      expectedNoteEl.textContent = "✅ נכון!";
      noteColor = "green";
      drawSingle(expected);
      
      setTimeout(() => {
        if (practiceMode) {
          practiceIndex++;
          showPracticeNote();
        } else {
          pickExpectedNote();
        }
      }, 300);
    } else {
      console.log("❌ Duration wrong!");
      if (firstAttempt) {
        wrongCount++;
        wrongCountEl.textContent = wrongCount;
        firstAttempt = false;
        // Log the duration mistake
        logMistake("duration", {
          name: expected.name,
          duration: expected.duration,
          hand: expected.hand
        });
if (!practiceMode) {
  maybeEnterFocusedPractice();
}
      }
      const diff = (noteDuration - expectedDuration).toFixed(1);
      if (!practiceMode) {
      const handLabel = expected.hand === "right" ? "יד ימין" : "יד שמאל";
      expectedNoteEl.textContent = `❌ ${handLabel} - תו ${expected.displayName || expected.name} ${expected.duration.display} – אורך לא נכון (${diff > 0 ? '+' : ''}${diff}s)`;
      noteColor = "red";
      drawSingle(expected);
      }
    }
    
    noteStartTime = null;
    lastPressedNote = null;
    return;
  }
  
  if (isNoteOff) return; // Ignore other note-off messages

  // ----- CHORD MODE (match pitch class – any octave accepted) -----
  if (expected.mode === "chord") {
    // Check if this note matches any chord note by pitch class
    const matchedChordNote = expected.chord.find(cn => samePitchClass(note, cn));
    if (matchedChordNote && !expected.pressed.has(matchedChordNote)) {
      expected.pressed.add(matchedChordNote);
      console.log("Chord note pressed:", note, "matched:", matchedChordNote, "Total pressed:", expected.pressed.size, "Need:", expected.chord.length);
      drawChord(expected);

      // Check if all chord notes are pressed
      if (expected.pressed.size === expected.chord.length) {
        console.log("✅ CHORD COMPLETE!");
        if (firstAttempt) {
          correctCount++;
          correctCountEl.textContent = correctCount;
          firstAttempt = false;
        }
        isProcessing = true;
        expectedNoteEl.textContent = "✅ נכון!";
        noteColor = "green";
        
        setTimeout(() => {
          if (practiceMode) {
            practiceIndex++;
            showPracticeNote();
          } else {
            pickExpectedNote();
          }
        }, 500);
      }
    } else {
      console.log("❌ Wrong note in chord:", note);
      if (firstAttempt) {
        wrongCount++;
        wrongCountEl.textContent = wrongCount;
        firstAttempt = false;
        // Log the chord mistake
        logMistake("chord", {
          chordName: expected.chordName
        });
if (!practiceMode) {
  maybeEnterFocusedPractice();
}      }
if (!practiceMode) {
      const handLabel = expected.hand === "right" ? "יד ימין" : "יד שמאל";
      let msg = `❌ ${handLabel} - אקורד`;
      if (showNoteNames) msg += ` ${expected.chordName}`;
      expectedNoteEl.textContent = msg;
      noteColor = "red";
      drawChord(expected);
    }
}
    return;
  }

  // ----- TWO HANDS TOGETHER -----
  if (expected.mode === "together") {
    if (note === expected.right.midi) expected.pressed.right = true;
    if (note === expected.left.midi)  expected.pressed.left = true;

    drawTwoHands(expected);

    if (expected.pressed.right && expected.pressed.left) {
      if (firstAttempt) {
        correctCount++;
        correctCountEl.textContent = correctCount;
        firstAttempt = false; // Mark as used immediately
      }
      isProcessing = true; // Block further input
      expectedNoteEl.textContent = "✅ נכון!";
      noteColor = "green";
setTimeout(() => {
  if (practiceMode) {
    practiceIndex++;
    showPracticeNote();
  } else {
    pickExpectedNote();
  }
}, 400);
    }
    return;
  }

  // ----- SINGLE (match pitch class – any octave accepted) -----
  if (samePitchClass(note, expected.midi)) {
    console.log("✅ CORRECT NOTE! firstAttempt:", firstAttempt, "correctCount before:", correctCount);
    
    // If checking durations, just record the start time and wait for release
    if (checkDurations) {
      noteStartTime = Date.now();
      lastPressedNote = note;
      expectedNoteEl.textContent = "⏱️ החזק/י את התו...";
      noteColor = "blue";
      drawSingle(expected);
      return;
    }
    
    // Not checking durations - immediate success
    if (firstAttempt) {
      correctCount++;
      console.log("   → COUNTED! correctCount after:", correctCount);
      correctCountEl.textContent = correctCount;
      firstAttempt = false; // Mark immediately to prevent double counting
    } else {
      console.log("   → NOT COUNTED (not first attempt)");
    }
    isProcessing = true; // Block further input
    expectedNoteEl.textContent = "✅ נכון!";
    noteColor = "green";
    drawSingle(expected);
    
    setTimeout(() => {
      if (practiceMode) {
        practiceIndex++;
        showPracticeNote();
      } else {
        pickExpectedNote();
      }
    }, 300);
  } else {
    console.log("❌ WRONG NOTE! firstAttempt:", firstAttempt);
    if (firstAttempt) {
      wrongCount++;
      console.log("   → COUNTED WRONG! wrongCount:", wrongCount);
      wrongCountEl.textContent = wrongCount;
      firstAttempt = false;
      // Log the note mistake
      logMistake("note", {
        name: expected.name,
        hand: expected.hand
      });
if (!practiceMode) {
  maybeEnterFocusedPractice();
}    }
if (!practiceMode) {
    const handLabel = expected.hand === "right" ? "יד ימין" : "יד שמאל";
    let msg = `❌ ${handLabel} - תו`;
    if (showNoteNames) msg += ` ${expected.displayName || expected.name}`;
    if (checkDurations) msg += ` ${expected.duration.display}`;
    expectedNoteEl.textContent = msg;
    noteColor = "red";
    drawSingle(expected);
  }
}
}

// ---------- Drawing ----------
function drawEmptyStaves() {
  staffEl.innerHTML = "";
  const VF = Vex.Flow;
  const r = new VF.Renderer(staffEl, VF.Renderer.Backends.SVG);
  r.resize(300, 220);
  const ctx = r.getContext();
  const treble = new VF.Stave(10, 40, 280);
  treble.addClef("treble").setContext(ctx).draw();
  const bass = new VF.Stave(10, 120, 280);
  bass.addClef("bass").setContext(ctx).draw();
  return { VF, ctx, treble, bass };
}

function drawSingle(note) {
  const { VF, ctx, treble, bass } = drawEmptyStaves();
  try {
    const stave = note.hand === "right" ? treble : bass;
    const clef = note.hand === "right" ? "treble" : "bass";

    const key = note.name.replace(/([A-G][#b]?)(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);
    const duration = note.duration ? note.duration.vexflow : "q";
    const sn = new VF.StaveNote({ clef, keys: [key], duration: duration });
    // Note: VexFlow 4.2.5 Accidental is broken (setNote not a function).
    // The key string "c#/4" already positions the note correctly on the staff.
    sn.setStyle({ fillStyle: noteColor });

    const v = new VF.Voice({ num_beats: duration === "w" ? 4 : (duration === "h" ? 2 : 1), beat_value: 4 });
    v.addTickables([sn]);
    new VF.Formatter().format([v], 200);
    v.draw(ctx, stave);
  } catch (e) {
    console.error("drawSingle error:", e, note);
  }
}

window.callLLM = async function callLLM(prompt) {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${window.APP_CONFIG.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        messages: [
          { role: "system", content: "You are a piano practice assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      })
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("Groq error:", err);
    throw new Error(err);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
};

function drawTwoHands(ex) {
  const { VF, ctx, treble, bass } = drawEmptyStaves();
  try {
    const rk = ex.right.name.replace(/([A-G][#b]?)(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);
    const lk = ex.left.name.replace(/([A-G][#b]?)(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);

    const rn = new VF.StaveNote({ clef: "treble", keys: [rk], duration: "q" });
    const ln = new VF.StaveNote({ clef: "bass", keys: [lk], duration: "q" });

    rn.setStyle({ fillStyle: ex.pressed.right ? "green" : "black" });
    ln.setStyle({ fillStyle: ex.pressed.left ? "green" : "black" });

    const rv = new VF.Voice({ num_beats: 1, beat_value: 4 });
    rv.addTickables([rn]);
    new VF.Formatter().format([rv], 200);
    rv.draw(ctx, treble);

    const lv = new VF.Voice({ num_beats: 1, beat_value: 4 });
    lv.addTickables([ln]);
    new VF.Formatter().format([lv], 200);
    lv.draw(ctx, bass);
  } catch (e) {
    console.error("drawTwoHands error:", e, ex);
  }
}

function drawChord(chordData) {
  const { VF, ctx, treble, bass } = drawEmptyStaves();
  try {
    const stave = chordData.hand === "right" ? treble : bass;
    const clef = chordData.hand === "right" ? "treble" : "bass";

    const keys = chordData.chord.map(midi => {
      const noteName = midiToNoteName(midi);
      return noteName.replace(/([A-G][#b]?)(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);
    });

    const chordNote = new VF.StaveNote({ clef, keys, duration: "q" });

    chordData.chord.forEach((midi, index) => {
      let color;
      if (noteColor === "red") color = "red";
      else if (noteColor === "green") color = "green";
      else color = chordData.pressed.has(midi) ? "green" : "black";
      chordNote.setKeyStyle(index, { fillStyle: color });
    });

    const v = new VF.Voice({ num_beats: 1, beat_value: 4 });
    v.addTickables([chordNote]);
    new VF.Formatter().format([v], 200);
    v.draw(ctx, stave);
  } catch (e) {
    console.error("drawChord error:", e, chordData);
  }
}

// ---------- Startup ----------
pickExpectedNote();

// Auto-connect MIDI on page load
(async () => {
  try {
    await MidiInput.init(handleMIDIMessage);
    if (MidiInput.mode === "mock") {
      statusEl.textContent = "🎹 Mock MIDI פעיל";
      statusEl.style.color = "blue";
    } else {
      statusEl.textContent = "🎹 מחובר ל-MIDI אמיתי";
      statusEl.style.color = "green";
    }
  } catch (e) {
    console.warn("Auto MIDI init failed:", e.message);
    statusEl.textContent = "לא מחובר – לחצ/י 'חבר MIDI' או הפעל/י Mock";
    statusEl.style.color = "gray";
    // Retry on first user click anywhere on the page
    const retryOnClick = async () => {
      document.removeEventListener("click", retryOnClick);
      if (MidiInput.handler) return; // Already connected
      try {
        await MidiInput.init(handleMIDIMessage);
        statusEl.textContent = "🎹 מחובר ל-MIDI אמיתי";
        statusEl.style.color = "green";
      } catch (err) {
        console.warn("MIDI retry failed:", err.message);
      }
    };
    document.addEventListener("click", retryOnClick);
  }
})();

});
