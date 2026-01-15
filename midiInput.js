// midiInput.js

const MidiInput = {
  mode: "mock", // "mock" | "real"
  handler: null,

  async init(onMessage) {
    this.handler = onMessage;

    if (this.mode === "mock") {
      this.initMock();
    } else {
      await this.initReal();
    }
  },

  async initReal() {
    const midi = await navigator.requestMIDIAccess();
    const inputs = [...midi.inputs.values()];

    if (!inputs.length) {
      throw new Error("No MIDI devices found");
    }

    const input = inputs.find(i => i.state === "connected") || inputs[0];
    input.onmidimessage = this.handler;

    console.log("🎹 REAL MIDI:", input.name);
  },

  initMock() {
    console.log("🎹 MOCK MIDI MODE");

    // helper for console + buttons
    window.playNote = (midi, velocity = 100, durationMs = 500) => {
      this.handler({ data: [144, midi, velocity] });
      setTimeout(() => {
        this.handler({ data: [128, midi, 0] });
      }, durationMs);
    };

    console.log("➡️ use playNote(60)");
  }
};
