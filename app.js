// ================================
// Piano Trainer – Full app.js
// ================================

document.addEventListener("DOMContentLoaded", () => {

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

let handMode = "separate";
let showNoteNames = true;
let checkDurations = true;
let leftHandMode = "notes"; // "notes", "chords", or "both"
let isProcessing = false; // Prevent double counting during transition
let noteStartTime = null; // Track when note was pressed
let lastPressedNote = null; // Track which note is currently pressed
let metronomeEnabled = false;
let metronomeInterval = null;

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
const toggleMetronomeEl = document.getElementById("toggleMetronome");
const leftHandRadios = document.getElementsByName("leftHandMode");
const resetScoreBtn = document.getElementById("resetScore");

// ---------- Hand mode ----------
handModeEl.addEventListener("change", () => {
  handMode = handModeEl.value;
  pickExpectedNote();
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
    pickExpectedNote(); // Generate new note with updated settings
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
  correctCount = 0;
  wrongCount = 0;
  correctCountEl.textContent = correctCount;
  wrongCountEl.textContent = wrongCount;
  console.log("🔄 Score reset!");
});

// ---------- MIDI ----------
connectBtn.addEventListener("click", async () => {
  try {
    statusEl.textContent = "מנסה להתחבר...";
    statusEl.style.color = "orange";
    
    const midi = await navigator.requestMIDIAccess();
    const inputs = [...midi.inputs.values()];
    
    console.log("MIDI inputs found:", inputs.length);
    inputs.forEach((input, i) => {
      console.log(`Input ${i}:`, input.name, input.manufacturer, input.state);
    });
    
    if (!inputs.length) {
      statusEl.textContent = "לא נמצאו התקני MIDI. בדוק שהפסנתר מחובר ודלוק.";
      statusEl.style.color = "red";
      return;
    }
    
    // Try to find a connected input
    let connectedInput = inputs.find(input => input.state === "connected");
    if (!connectedInput) connectedInput = inputs[0];
    
    connectedInput.onmidimessage = handleMIDIMessage;
    statusEl.textContent = `מחובר ל-${connectedInput.name} ✅`;
    statusEl.style.color = "green";
    pickExpectedNote();
    
    // Listen for disconnection
    midi.onstatechange = (e) => {
      console.log("MIDI state change:", e.port.name, e.port.state);
      if (e.port.state === "disconnected") {
        statusEl.textContent = "ההתקן התנתק. לחץ 'חבר MIDI' שוב.";
        statusEl.style.color = "red";
      }
    };
    
  } catch (error) {
    console.error("MIDI Error:", error);
    statusEl.textContent = `שגיאה: ${error.message}`;
    statusEl.style.color = "red";
  }
});

// ---------- Pick expected ----------
function pickExpectedNote() {
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
  
  if (status >= 0xF8 || !expected) return;
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
      setTimeout(pickExpectedNote, 300);
    } else {
      console.log("❌ Duration wrong!");
      if (firstAttempt) {
        wrongCount++;
        wrongCountEl.textContent = wrongCount;
        firstAttempt = false;
      }
      const diff = (noteDuration - expectedDuration).toFixed(1);
      expectedNoteEl.textContent = `❌ אורך לא נכון (${diff > 0 ? '+' : ''}${diff}s)`;
      noteColor = "red";
      drawSingle(expected);
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
        setTimeout(pickExpectedNote, 500);
      }
    } else {
      console.log("❌ Wrong note in chord:", note);
      if (firstAttempt) {
        wrongCount++;
        wrongCountEl.textContent = wrongCount;
        firstAttempt = false;
      }
      expectedNoteEl.textContent = "❌ נסה/י שוב";
      noteColor = "red";
      drawChord(expected);
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
      setTimeout(pickExpectedNote, 400);
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
    setTimeout(pickExpectedNote, 300);
  } else {
    console.log("❌ WRONG NOTE! firstAttempt:", firstAttempt);
    if (firstAttempt) {
      wrongCount++;
      console.log("   → COUNTED WRONG! wrongCount:", wrongCount);
      wrongCountEl.textContent = wrongCount;
      firstAttempt = false;
    }
    expectedNoteEl.textContent = "❌ נסה/י שוב";
    noteColor = "red";
    drawSingle(expected);
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
