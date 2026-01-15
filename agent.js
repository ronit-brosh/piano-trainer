// agent.js

function shouldEnterFocusedPractice(mistakesLog, lastAgentSuggestion) {
  if (!mistakesLog) {
    return { enter: false };
  }

  const notes = Object.values(mistakesLog.notes || {});
  const chords = Object.values(mistakesLog.chords || {});
  const durations = Object.values(mistakesLog.durations || {});

  const totalMistakes =
    notes.reduce((s, m) => s + m.count, 0) +
    chords.reduce((s, m) => s + m.count, 0) +
    durations.reduce((s, m) => s + m.count, 0);

  if (totalMistakes < 2) {//5
    return { enter: false };
  }

  if (
    lastAgentSuggestion &&
    Date.now() - lastAgentSuggestion < 2 * 60 * 1000
  ) {
    return { enter: false };
  }

  return {
    enter: true,
    reason: "שמתי לב להרבה טעויות חוזרות – נעבור לתרגול ממוקד"
  };
}



async function createFocusedPractice(state) {
  const prompt = buildPromptFromMistakes(state.mistakes);
  console.log("📤 Prompt sent to Groq:\n", prompt);

  const text = await callLLM(prompt);
  console.log("📥 Groq raw response:\n", text);

  const sequence = parsePracticeSequence(text);
  console.log("🎼 Parsed sequence:", sequence);

  return sequence;
}



window.buildPromptFromMistakes = function buildPromptFromMistakes(state) {
  const mistakes = state.mistakes || state;

  let prompt = "# Piano Focused Practice\n\n";
  prompt += "Based on these recurring mistakes, create a focused practice sequence.\n";
  prompt += "Use ONLY durations: Quarter, Half, Whole.\n";
  prompt += "Return ONLY numbered lines in this format:\n";
  prompt += "Note, Hand, Duration\n\n";

  Object.values(mistakes.notes || {}).forEach(n => {
    prompt += `Mistake: note ${n.hand} ${n.count} times\n`;
  });

  Object.values(mistakes.chords || {}).forEach(c => {
    prompt += `Mistake: chord ${c.count} times\n`;
  });

  Object.values(mistakes.durations || {}).forEach(d => {
    prompt += `Mistake: duration ${d.duration}\n`;
  });

  return prompt;
};


function buildPromptFromMistakes(mistakesLog) {
  let prompt = "# Piano Training - Focused Practice\n\n";
  prompt += "Based on my practice session, I made the following mistakes:\n\n";
  prompt += "Use ONLY these durations: Quarter, Half, Whole.\n";
  prompt += "Do not include explanations or summaries.\n";
  prompt += "Output only the list, one item per line.\n\n";

  // -------- Notes mistakes --------
  const notesList = Object.entries(mistakesLog.notes || {})
    .sort((a, b) => b[1].count - a[1].count);

  if (notesList.length > 0) {
    prompt += "## Wrong Notes:\n";
    notesList.forEach(([note, data]) => {
      prompt += `- ${note} (${data.hand === "right" ? "Right hand" : "Left hand"}) - ${data.count} mistake${data.count > 1 ? "s" : ""}\n`;
    });
    prompt += "\n";
  }

  // -------- Chords mistakes --------
  const chordsList = Object.entries(mistakesLog.chords || {})
    .sort((a, b) => b[1].count - a[1].count);

  if (chordsList.length > 0) {
    prompt += "## Wrong Chords:\n";
    chordsList.forEach(([chord, data]) => {
      prompt += `- ${chord} (Left hand) - ${data.count} mistake${data.count > 1 ? "s" : ""}\n`;
    });
    prompt += "\n";
  }

  // -------- Duration mistakes --------
  const durationsList = Object.entries(mistakesLog.durations || {})
    .sort((a, b) => b[1].count - a[1].count);

  if (durationsList.length > 0) {
    prompt += "## Duration Mistakes:\n";
    durationsList.forEach(([_, data]) => {
      prompt += `- ${data.noteName} ${data.duration} (${data.hand === "right" ? "Right hand" : "Left hand"}) - ${data.count} mistake${data.count > 1 ? "s" : ""}\n`;
    });
    prompt += "\n";
  }

  prompt += "---\n\n";
  prompt += "Please create a focused practice sequence of 10–20 items that emphasizes the notes and chords I struggled with most.\n";
  prompt += "The sequence should:\n";
  prompt += "1. Focus heavily on my most common mistakes\n";
  prompt += "2. Include the correct hand for each item\n";
  prompt += "3. Mix in some correct notes I didn't struggle with for context\n";
  prompt += "4. Be playable and musical\n\n";

  prompt += "Format EXACTLY like this (no numbering, no text):\n";
  prompt += "NOTE_WITH_OCTAVE, Hand, Duration\n\n";
  prompt += "Examples:\n";
  prompt += "C4, Right, Quarter\n";
  prompt += "E4, Right, Half\n";
  prompt += "C3+E3+G3, Left, Quarter\n";

  return prompt;
}

