class RysPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._offset++] = channelData[i];
      if (this._offset >= 4096) {
        this.port.postMessage(this._buffer.slice(0));
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('rys-pcm-capture', RysPcmCaptureProcessor);
