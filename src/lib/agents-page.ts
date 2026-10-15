/**
 * The /agents page's three interactions: the race replay at the top, the
 * recorded loop's step and reader switches, and the rebuild question's edit
 * switch.
 *
 * Every panel the loop and the rebuild question can show is in the built
 * HTML, so with scripts off the page is the whole recording laid out in
 * order. This module only hides the panels that are not selected, and the
 * controls that select them are hidden until it runs.
 *
 * The race is the one illustrative thing on the page, and the page says so
 * under it. It plays once when it is scrolled to and again on Replay, never on
 * a loop. The module bodies scrolling through its lanes are generated here
 * from a fixed seed; the numbers it lands on are the measured ones, which
 * the page hands it through data attributes read out of facts.json.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const store = (key: string, value?: string): string | null => {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
};

/* The loop ---------------------------------------------------------------- */

function wireLoop(box: HTMLElement): (step: number) => void {
  box.dataset.js = "true";
  const steps = [...box.querySelectorAll<HTMLElement>("[data-step-panel]")];
  const tabs = [...box.querySelectorAll<HTMLButtonElement>("[data-step]")];
  const readers = [...box.querySelectorAll<HTMLButtonElement>("[data-reader]")];
  const next = box.querySelector<HTMLButtonElement>("[data-next]");
  const readerNote = box.querySelector<HTMLElement>("[data-reader-note]");

  let step = 0;
  let reader = store("iyi-reader") === "agent" ? "agent" : "person";

  const render = () => {
    tabs.forEach((tab, i) => tab.setAttribute("aria-selected", String(i === step)));
    steps.forEach((panel, i) => (panel.hidden = i !== step));
    readers.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.reader === reader)));
    box.dataset.reader = reader;
    if (readerNote) readerNote.textContent = reader === "person" ? "rendered for you" : "exactly what the agent receives";
    if (next) next.textContent = step === steps.length - 1 ? "Start over" : "Next step →";
  };

  box.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.step !== undefined) step = Number(b.dataset.step);
    else if (b.dataset.reader !== undefined) {
      reader = b.dataset.reader;
      store("iyi-reader", reader);
    } else if (b.hasAttribute("data-next")) step = (step + 1) % steps.length;
    else return;
    render();
  });

  render();
  return (to: number) => {
    step = to;
    render();
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}

/* The rebuild question ---------------------------------------------------- */

function wireDiff(box: HTMLElement, options: HTMLElement) {
  options.dataset.js = "true";
  box.dataset.js = "true";
  const buttons = [...options.querySelectorAll<HTMLButtonElement>("[data-edit]")];
  const panels = [...box.querySelectorAll<HTMLElement>("[data-edit-panel]")];
  const pick = (edit: string) => {
    buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.edit === edit)));
    panels.forEach((p) => (p.hidden = p.dataset.editPanel !== edit));
  };
  options.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-edit]");
    if (b?.dataset.edit) pick(b.dataset.edit);
  });
  pick(buttons[0]?.dataset.edit ?? "body");
}

/* The race ---------------------------------------------------------------- */

function wireRace(race: HTMLElement, goStep: (step: number) => void) {
  const modules = Number(race.dataset.modules);
  const packLow = Number(race.dataset.packLow);
  const packHigh = Number(race.dataset.packHigh);
  const packMid = (packLow + packHigh) / 2;

  const WORDS = ["http", "json", "strings", "io", "path", "time", "fmt", "hash", "list", "map", "log", "bytes", "math", "sort", "sync", "fs", "uri", "csv", "toml", "term", "env", "cli", "color", "diff", "test", "net", "rand", "os"];
  const TYPES = ["String", "Int32", "Bool", "Bytes", "Float64", "Array(String)"];
  let seed = 11;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  const srcLines: string[] = [];
  const packLines: string[] = [];
  for (let i = 0; i < modules; i++) {
    const w = i === 0 ? "app" : i === 1 ? "greeter" : WORDS[(i - 2) % WORDS.length];
    if (i === 0) {
      srcLines.push("module app", "import app/greeter::*", "pub def main : Int32", '  puts polit("Türkiye")', "  0", "end");
      packLines.push("pub def main : Int32");
      continue;
    }
    if (i === 1) {
      srcLines.push("module app/greeter", "pub trait Greet", "  abstract def greet : String", "end", "pub def polite(name : String) : String", '  "#{greeting}, #{name}."', "end", "pub def shout(name : String) : String", '  "#{greeting.upcase}, #{name.upcase}!"', "end", "def greeting : String", '  "Hello"', "end");
      packLines.push("def polite(name : String) : String", "def shout(name : String) : String", "trait Greet · abstract def greet : String");
      continue;
    }
    srcLines.push(`module lib/${w}`);
    const count = 2 + Math.floor(rnd() * 3);
    for (let f = 0; f < count; f++) {
      const fn = `${w}_${pick(["parse", "read", "build", "each", "merge", "check", "format", "split"])}`;
      const sig = `def ${fn}(x : ${pick(TYPES)}) : ${pick(TYPES)}`;
      packLines.push(sig);
      srcLines.push(`pub ${sig}`);
      const lines = 2 + Math.floor(rnd() * 5);
      for (let b = 0; b < lines; b++) {
        srcLines.push(`  ${pick(["acc = [] of String", "x.each { |v| acc << v }", "return default unless x", "buf = IO::Memory.new", `check!(x, "${w}")`, "result = step(acc, x)", `raise Error.new("bad ${w}") if x.nil?`, "cache[x] ||= compute(x)"])}`);
      }
      srcLines.push("end");
    }
  }

  const MARKS = [0, 0.66, 0.8, 0.92];
  const lanes = [...race.querySelectorAll<HTMLElement>("[data-lane]")];
  const foot = race.querySelector<HTMLElement>("[data-foot]");
  const dot = race.querySelector<HTMLElement>("[data-dot]");
  let t = 1;
  let replay = () => {};

  const tick = () => {
    const done = t >= 1;
    const read = Math.min(1, t / 0.55);
    const arms = [
      { pct: read * 100, lines: srcLines, keep: 12, label: `${Math.round(read * 100)}%` },
      { pct: read * packMid, lines: packLines, keep: 4, label: read >= 1 ? `${packLow}–${packHigh}%` : `${Math.round(read * packMid)}%` },
    ];
    arms.forEach((arm, k) => {
      const lane = lanes[k];
      if (!lane) return;
      const n = Math.floor(read * arm.lines.length);
      lane.dataset.full = String(k === 0 && arm.pct > 85);
      const text = lane.querySelector<HTMLElement>(".lane-text");
      if (text) text.innerHTML = arm.lines.slice(Math.max(0, n - arm.keep), n).map((x) => `<div>${esc(x)}</div>`).join("");
      const num = lane.querySelector<HTMLElement>(".lane-num b");
      if (num) num.textContent = arm.label;
      const bar = lane.querySelector<HTMLElement>(".lane-bar i");
      if (bar) bar.style.width = `${arm.pct}%`;
      lane.querySelectorAll<HTMLElement>("[data-goto]").forEach((b, i) => {
        const on = i === 0 ? read >= 1 : t >= MARKS[i];
        const active = !on && (i === 0 ? t > 0 : t >= MARKS[i] - 0.12 && t >= MARKS[i - 1]);
        b.dataset.state = on ? "done" : active ? "active" : "idle";
      });
    });
    race.dataset.done = String(done);
    if (dot) dot.dataset.done = String(done);
    if (foot) foot.dataset.done = String(done);
  };

  race.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.hasAttribute("data-replay")) replay();
    else if (b.dataset.goto !== undefined) goStep(Number(b.dataset.goto));
  });

  /* Under reduced motion there is nothing to replay, so the control is not
   * offered: the race stays at its finished state. */
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    t = 1;
    tick();
    return;
  }
  race.dataset.js = "true";

  /* One run, then the finished result stays. A replay that loops reads as
   * decoration; Replay runs it again. */
  let timer = 0;
  const play = () => {
    window.clearInterval(timer);
    t = 0;
    tick();
    timer = window.setInterval(() => {
      t = Math.min(1, t + 0.011);
      tick();
      if (t >= 1) window.clearInterval(timer);
    }, 70);
  };
  replay = play;

  const seen = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        play();
        seen.disconnect();
      }
    },
    { threshold: 0.35 },
  );
  seen.observe(race);
}

export function wireAgentsPage() {
  const loop = document.querySelector<HTMLElement>("#loopbox");
  const goStep = loop ? wireLoop(loop) : () => {};
  const diff = document.querySelector<HTMLElement>("#diffbox");
  const options = document.querySelector<HTMLElement>("#diffopts");
  if (diff && options) wireDiff(diff, options);
  const race = document.querySelector<HTMLElement>("#race");
  if (race) wireRace(race, goStep);
}
