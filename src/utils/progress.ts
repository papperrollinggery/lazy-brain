/**
 * LazyBrain — Terminal Progress Bar
 *
 * Pure ANSI escape code implementation. No external dependencies.
 */

const WIDTH = 28;

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

function isChinese(): boolean {
  const lang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? '';
  return /zh/i.test(lang);
}

const WAITING_MESSAGES_ZH = [
  '正在召唤 AI 神经元，请稍候 🧠',
  '模型在努力思考，比你想象的快 ⚡',
  '知识图谱构建中，泡杯茶吧 ☕',
  '所有能力等待分类，AI 表示压力不大 😎',
  '正在给每个技能贴标签，耐心是美德 🏷️',
  '编译中，这比 npm install 快多了 📦',
  '大模型在认真工作，请勿打扰 🤫',
];

const WAITING_MESSAGES_EN = [
  'Summoning AI neurons, hang tight 🧠',
  'Model is thinking hard, faster than you think ⚡',
  'Building the knowledge graph, grab a coffee ☕',
  'All capabilities queued, AI is not stressed 😎',
  'Tagging every skill one by one, patience is a virtue 🏷️',
  'Compiling... still faster than npm install 📦',
  'LLM hard at work, do not disturb 🤫',
];

function randomWaitMessage(): string {
  const msgs = isChinese() ? WAITING_MESSAGES_ZH : WAITING_MESSAGES_EN;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

export interface ProgressBarOptions {
  label?: string;
  width?: number;
}

export class ProgressBar {
  private total: number = 0;
  private current: number = 0;
  private label: string;
  private width: number;
  private startTime: number = 0;
  private speeds: number[] = [];
  private lastTime: number = 0;
  private lastCurrent: number = 0;
  private lastName: string = '';
  private enabled: boolean;

  constructor(options: ProgressBarOptions = {}) {
    this.label = options.label ?? 'Progress';
    this.width = options.width ?? WIDTH;
    this.enabled = isTTY();
  }

  start(total: number): void {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.lastTime = this.startTime;
    this.lastCurrent = 0;
    this.speeds = [];
    if (this.enabled) {
      console.log(`  ${randomWaitMessage()}`);
    }
  }

  update(current: number, name?: string): void {
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;

    if (current > this.lastCurrent) {
      const dt = (now - this.lastTime) / 1000;
      if (dt > 0.1) {
        const speed = (current - this.lastCurrent) / dt;
        this.speeds.push(speed);
        if (this.speeds.length > 20) this.speeds.shift();
        this.lastTime = now;
        this.lastCurrent = current;
      }
    }

    if (name !== undefined) this.lastName = name;
    this.current = current;

    if (!this.enabled) {
      process.stdout.write(`\r  [${current}/${this.total}] ${this.lastName}`);
      if (current >= this.total) process.stdout.write('\n');
      return;
    }

    const pct = this.total > 0 ? (current / this.total) : 0;
    const filled = Math.round(pct * this.width);
    const empty = this.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const pctStr = `${Math.round(pct * 100)}%`;

    let eta = '';
    const avgSpeed = this.speeds.length > 0
      ? this.speeds.reduce((a, b) => a + b, 0) / this.speeds.length
      : 0;

    if (avgSpeed > 0.1 && current < this.total) {
      const remaining = this.total - current;
      const etaSeconds = remaining / avgSpeed;
      if (etaSeconds < 60) {
        eta = `${Math.round(etaSeconds)}s left`;
      } else {
        const minutes = Math.floor(etaSeconds / 60);
        eta = `~${minutes} min left`;
      }
    }

    const speedStr = avgSpeed > 0 ? `${avgSpeed.toFixed(1)} cap/min` : '';

    const nameTrunc = this.lastName.length > 30
      ? this.lastName.slice(0, 27) + '...'
      : this.lastName;

    process.stdout.write(
      `\r  ${this.label}: [${bar}] ${pctStr.padStart(4)} [${current}/${this.total}]`
    );

    if (eta) process.stdout.write(`  ${eta}`);
    if (speedStr) process.stdout.write(`  ${speedStr}`);

    if (current < this.total && nameTrunc) {
      process.stdout.write(`\n  Current: ${nameTrunc}`);
    }

    if (current >= this.total) {
      process.stdout.write('\n');
    } else {
      process.stdout.write('\x1b[2A');
    }
  }

  increment(name?: string): void {
    this.update(this.current + 1, name);
  }

  complete(): void {
    if (!this.enabled) {
      process.stdout.write('\n');
      return;
    }
    this.update(this.total, this.lastName);
  }

  getElapsedSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}

export function createProgressBar(options?: ProgressBarOptions): ProgressBar {
  return new ProgressBar(options);
}
