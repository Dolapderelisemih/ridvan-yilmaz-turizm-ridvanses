class RysPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 3072 hem 2'ye (1536 örnek = 24kHz HD ses) hem 3'e (1024 örnek = 16kHz) tam bölünür.
    // Paket sınırlarında örnek kaybı (sample drop) ve faz çıtırtısı (click) oluşmasını %100 engeller.
    this._buffer = new Float32Array(3072);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._offset++] = channelData[i];
      if (this._offset >= 3072) {
        this.port.postMessage(this._buffer.slice(0));
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('rys-pcm-capture', RysPcmCaptureProcessor);
