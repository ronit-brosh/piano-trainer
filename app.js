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

const RIGHT_HAND_NOTES = [60, 62, 64, 65, 67, 69, 71];
const LEFT_HAND_NOTES  = [48, 50, 52, 53, 55, 57, 59];

// Note durations (in seconds at 80 BPM)
const TEMPO_BPM = 80;
const BEAT_DURATION = 60 / TEMPO_BPM; // One beat in seconds
const DURATIONS = [
  { name: "q", display: "♩ רבע", vexflow: "q", seconds: BEAT_DURATION, tolerance: 0.3 },
  { name: "h", display: "𝅗𝅥 חצי", vexflow: "h", seconds: BEAT_DURATION * 2, tolerance: 0.4 },
  { name: "w", display: "𝅝 שלם", vexflow: "w", seconds: BEAT_DURATION * 4, tolerance: 0.6 }
];

// Specific chords for left hand only
const LEFT_HAND_CHORDS = [
  { name: "C3+E3+G3", notes: [48, 52, 55], display: "C3+E3+G3" },    // C3-E3-G3
  { name: "B2+F3+G3", notes: [47, 53, 55], display: "B2+F3+G3" },    // B2-F3-G3
];

function midiToNoteName(midi) {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// ---------- State ----------
let expected = null;
let noteColor = "black";
let correctCount = 0;
let wrongCount = 0;
let firstAttempt = true;

let handMode = "right";
let showNoteNames = true;
//let checkDurations = true;
let leftHandMode = "notes"; // "notes", "chords", or "both"
let isProcessing = false; // Prevent double counting during transition
let noteStartTime = null; // Track when note was pressed
let lastPressedNote = null; // Track which note is currently pressed
let metronomeEnabled = false;
let metronomeInterval = null;
let lastAgentSuggestion = null;
let agentBusy = false;


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
const handModeEl = document.getElementById("handMode");
const toggleNoteNamesEl = document.getElementById("toggleNoteNames");
const toggleDurationsEl = document.getElementById("toggleDurations");
let checkDurations = toggleDurationsEl.checked;

const toggleMetronomeEl = document.getElementById("toggleMetronome");
const leftHandRadios = document.getElementsByName("leftHandMode");
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

if (mockMidiToggle.checked) {
    MidiInput.mode = "mock";
  virtualKeyboard.style.display = "block";
  renderVirtualKeyboard();
} else {
    MidiInput.mode = "real";
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
handModeEl.addEventListener("change", () => {
  handMode = handModeEl.value;
if (!practiceMode) {
  pickExpectedNote();
}
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
  
  // This would affect future note generation if you want to randomize durations
});

// Listen to left hand mode radio buttons
leftHandRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    leftHandMode = radio.value;

    if (!practiceMode) {
  pickExpectedNote(); // Generate new note with updated settings
}
  });
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
  isProcessing = false; // Reset processing flag

  if (handMode === "together") {
    const r = RIGHT_HAND_NOTES[Math.floor(Math.random() * RIGHT_HAND_NOTES.length)];
    const l = LEFT_HAND_NOTES[Math.floor(Math.random() * LEFT_HAND_NOTES.length)];

    expected = {
      mode: "together",
      right: { midi: r, name: midiToNoteName(r) },
      left:  { midi: l, name: midiToNoteName(l) },
      pressed: { right: false, left: false }
    };

    let msg = "נגן/י בשתי הידיים יחד";
    if (showNoteNames) {
      msg += ` (ימין: ${expected.right.name}, שמאל: ${expected.left.name})`;
    }
    expectedNoteEl.textContent = msg;
    drawTwoHands(expected);
    return;
  }

  // ---- single hand or chord ----
  let pool;
  if (handMode === "right") {
    pool = RIGHT_HAND_NOTES;
  } else if (handMode === "left") {
    // For left hand, check the mode setting
    if (leftHandMode === "chords") {
      // Only chords
      const chord = LEFT_HAND_CHORDS[Math.floor(Math.random() * LEFT_HAND_CHORDS.length)];
      
      expected = {
        mode: "chord",
        hand: "left",
        chord: chord.notes,
        chordName: chord.display,
        pressed: new Set()
      };
      
      let msg = "יד שמאל - אקורד";
      if (showNoteNames) {
        msg += ` (${chord.display})`;
      }
      expectedNoteEl.textContent = msg;
      drawChord(expected);
      return;
    } else if (leftHandMode === "both" && Math.random() < 0.5) {
      // Mix of chords and notes - 50% chance for chord
      const chord = LEFT_HAND_CHORDS[Math.floor(Math.random() * LEFT_HAND_CHORDS.length)];
      
      expected = {
        mode: "chord",
        hand: "left",
        chord: chord.notes,
        chordName: chord.display,
        pressed: new Set()
      };
      
      let msg = "יד שמאל - אקורד";
      if (showNoteNames) {
        msg += ` (${chord.display})`;
      }
      expectedNoteEl.textContent = msg;
      drawChord(expected);
      return;
    }
    // leftHandMode === "notes" or both with 50% chance - show single note
    pool = LEFT_HAND_NOTES;
  } else {
    // separate mode
    pool = [...RIGHT_HAND_NOTES, ...LEFT_HAND_NOTES];
    
    // In separate mode, check if we should pick a chord for left hand
    if (leftHandMode === "chords" || (leftHandMode === "both" && Math.random() < 0.3)) {
      // Randomly decide if this should be a left hand chord
      if (Math.random() < 0.5) { // 50% chance when in separate mode
        const chord = LEFT_HAND_CHORDS[Math.floor(Math.random() * LEFT_HAND_CHORDS.length)];
        
        expected = {
          mode: "chord",
          hand: "left",
          chord: chord.notes,
          chordName: chord.display,
          pressed: new Set()
        };
        
        let msg = "יד שמאל - אקורד";
        if (showNoteNames) {
          msg += ` (${chord.display})`;
        }
        expectedNoteEl.textContent = msg;
        drawChord(expected);
        return;
      }
    }
  }

  const midi = pool[Math.floor(Math.random() * pool.length)];
  const hand = midi >= 60 ? "right" : "left";
  const duration = DURATIONS[Math.floor(Math.random() * DURATIONS.length)];

  expected = {
    mode: "single",
    midi,
    hand,
    name: midiToNoteName(midi),
    duration: duration
  };

  let msg = hand === "right" ? "יד ימין" : "יד שמאל";
  if (showNoteNames) {
    msg += ` (${expected.name})`;
  }
  if (checkDurations) {
    msg += ` ${duration.display}`;
  }
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
      expectedNoteEl.textContent = `❌ אורך לא נכון (${diff > 0 ? '+' : ''}${diff}s)`;
      noteColor = "red";
      drawSingle(expected);
      }
    }
    
    noteStartTime = null;
    lastPressedNote = null;
    return;
  }
  
  if (isNoteOff) return; // Ignore other note-off messages

  // ----- CHORD MODE -----
  if (expected.mode === "chord") {
    // Check if this note is part of the chord
    if (expected.chord.includes(note)) {
      expected.pressed.add(note);
      console.log("Chord note pressed:", note, "Total pressed:", expected.pressed.size, "Need:", expected.chord.length);
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
      expectedNoteEl.textContent = "❌ נסה/י שוב";
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

  // ----- SINGLE -----
  if (note === expected.midi) {
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
    expectedNoteEl.textContent = "❌ נסה/י שוב";
    noteColor = "red";
    drawSingle(expected);
  }
}
}

// ---------- Drawing ----------
function drawSingle(note) {
  staffEl.innerHTML = "";
  const VF = Vex.Flow;
  const r = new VF.Renderer(staffEl, VF.Renderer.Backends.SVG);
  r.resize(300, 220);
  const ctx = r.getContext();

  const treble = new VF.Stave(10, 40, 280);
  treble.addClef("treble").setContext(ctx).draw();
  const bass = new VF.Stave(10, 120, 280);
  bass.addClef("bass").setContext(ctx).draw();

  const stave = note.hand === "right" ? treble : bass;
  const clef = note.hand === "right" ? "treble" : "bass";

  const key = note.name.replace(/([A-G]#?)(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);
  const duration = note.duration ? note.duration.vexflow : "q";
  const sn = new VF.StaveNote({ clef, keys: [key], duration: duration });
  sn.setStyle({ fillStyle: noteColor });

  const v = new VF.Voice({ num_beats: duration === "w" ? 4 : (duration === "h" ? 2 : 1), beat_value: 4 });
  v.addTickables([sn]);
  new VF.Formatter().format([v], 200);
  v.draw(ctx, stave);
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
  staffEl.innerHTML = "";
  const VF = Vex.Flow;
  const r = new VF.Renderer(staffEl, VF.Renderer.Backends.SVG);
  r.resize(300, 220);
  const ctx = r.getContext();

  const treble = new VF.Stave(10, 40, 280);
  treble.addClef("treble").setContext(ctx).draw();
  const bass = new VF.Stave(10, 120, 280);
  bass.addClef("bass").setContext(ctx).draw();

  const rk = ex.right.name.replace(/([A-G])(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);
  const lk = ex.left.name.replace(/([A-G])(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);

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
}

function drawChord(chordData) {
  staffEl.innerHTML = "";
  const VF = Vex.Flow;
  const r = new VF.Renderer(staffEl, VF.Renderer.Backends.SVG);
  r.resize(300, 220);
  const ctx = r.getContext();

  const treble = new VF.Stave(10, 40, 280);
  treble.addClef("treble").setContext(ctx).draw();
  const bass = new VF.Stave(10, 120, 280);
  bass.addClef("bass").setContext(ctx).draw();

  const stave = chordData.hand === "right" ? treble : bass;
  const clef = chordData.hand === "right" ? "treble" : "bass";

  // Convert MIDI notes to VexFlow keys
  const keys = chordData.chord.map(midi => {
    const noteName = midiToNoteName(midi);
    return noteName.replace(/([A-G]#?)(\d)/, (_, n, o) => `${n.toLowerCase()}/${o}`);
  });

  const chordNote = new VF.StaveNote({ clef, keys, duration: "q" });
  
  // Color notes based on whether they've been pressed
  chordData.chord.forEach((midi, index) => {
    let color;
    if (noteColor === "red") {
      // When there's an error, paint everything red
      color = "red";
    } else if (noteColor === "green") {
      // When complete, paint everything green
      color = "green";
    } else {
      // Normal state - green for pressed, black for not pressed
      color = chordData.pressed.has(midi) ? "green" : "black";
    }
    chordNote.setKeyStyle(index, { fillStyle: color });
  });

  const v = new VF.Voice({ num_beats: 1, beat_value: 4 });
  v.addTickables([chordNote]);
  new VF.Formatter().format([v], 200);
  v.draw(ctx, stave);
}

});
