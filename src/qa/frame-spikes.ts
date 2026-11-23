/**
 * Detector de anomalia temporal: um frame que discorda dos dois vizinhos, que concordam entre si.
 *
 * Um corte de verdade persiste; uma piscada de captura dura de 1 a 5 frames e volta. Num episódio
 * real, o Chrome desktop deixou o frame 108 preto e o 132 em mosaico — o vídeo decodificava sem
 * erro nenhum. Em outro, cada corte tinha um frame quase preto (luma 128 → 8 → 125) escondido por
 * semanas, porque toda amostragem caía no meio dos planos.
 *
 * Trabalha sobre luma reduzida (160×90). Não é garantia de qualidade perceptual; é uma rede que
 * pega a classe de defeito que nenhum teste de unidade vê.
 */

export interface FrameSpike {
  frame: number;
  span: number;
  beforeDifference: number;
  afterDifference: number;
  neighborDifference: number;
}

export function findFrameSpikes(raw: Uint8Array, pixelsPerFrame: number, threshold = 8, calm = 3): FrameSpike[] {
  if (!Number.isInteger(pixelsPerFrame) || pixelsPerFrame <= 0 || raw.length % pixelsPerFrame !== 0) throw new Error("dados de frame incompletos");
  const count = raw.length / pixelsPerFrame;
  const difference = (a: number, b: number) => {
    let sum = 0;
    for (let p = 0; p < pixelsPerFrame; p++) sum += Math.abs((raw[a * pixelsPerFrame + p] ?? 0) - (raw[b * pixelsPerFrame + p] ?? 0));
    return sum / pixelsPerFrame;
  };
  const spikes: FrameSpike[] = [];
  for (let frame = 1; frame < count - 1; frame++) {
    const beforeDifference = difference(frame - 1, frame);
    if (beforeDifference < threshold) continue;
    for (let span = 1; span <= 5 && frame + span < count; span++) {
      const neighborDifference = difference(frame - 1, frame + span);
      const afterDifference = difference(frame, frame + span);
      if (neighborDifference < calm && afterDifference >= threshold) {
        spikes.push({ frame, span, beforeDifference, afterDifference, neighborDifference });
        frame += span - 1;
        break;
      }
    }
  }
  return spikes;
}

/** O mesmo detector em fluxo, com memória limitada e sobreposição de seis frames entre lotes. */
export class FrameStreamScanner {
  private pending = Buffer.alloc(0);
  private offset = 0;
  private bytes = 0;
  private skipUntil = 0;
  private finished = false;
  readonly spikes: FrameSpike[] = [];
  private readonly pixels: number;
  private readonly batchFrames: number;

  constructor(pixels: number, batchFrames = 300) {
    if (!Number.isInteger(pixels) || pixels < 1 || batchFrames < 7) throw new Error("dimensões inválidas para o scanner");
    this.pixels = pixels;
    this.batchFrames = batchFrames;
  }

  push(chunk: Uint8Array): void {
    if (this.finished) throw new Error("scanner já finalizado");
    this.bytes += chunk.length;
    this.pending = Buffer.concat([this.pending, chunk]);
    if (Math.floor(this.pending.length / this.pixels) >= this.batchFrames + 6) this.process(false);
  }

  private process(final: boolean): void {
    const frames = Math.floor(this.pending.length / this.pixels);
    const advance = final ? frames : frames - 6;
    if (advance < 1) return;
    for (const spike of findFrameSpikes(this.pending.subarray(0, frames * this.pixels), this.pixels)) {
      if (!final && spike.frame > advance) continue;
      const frame = this.offset + spike.frame;
      if (frame < this.skipUntil) continue;
      this.spikes.push({ ...spike, frame });
      this.skipUntil = frame + spike.span;
    }
    this.offset += advance;
    this.pending = Buffer.from(this.pending.subarray(advance * this.pixels));
  }

  finish(): { framesScanned: number; spikes: FrameSpike[] } {
    if (this.finished) throw new Error("scanner já finalizado");
    if (this.bytes % this.pixels) throw new Error("dados de frame incompletos");
    this.process(true);
    this.finished = true;
    return { framesScanned: this.bytes / this.pixels, spikes: this.spikes };
  }
}
