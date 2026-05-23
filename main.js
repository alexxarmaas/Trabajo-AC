// ============================================================
// main.js  –  Controlador de la interfaz del simulador RV64IM
// ============================================================

import { loadProgram, stepCPU } from "./cpu.js";
import { getRegisterName, parseProgram } from "./parser.js";
import { getScenarioById, scenarios } from "./scenarios.js";

// ── Referencias a elementos del DOM ─────────────────────────
const programInput      = document.getElementById("program-input");
const loadButton        = document.getElementById("load-btn");
const resetButton       = document.getElementById("reset-btn");
const stepButton        = document.getElementById("step-btn");
const runButton         = document.getElementById("run-btn");
const runToEndButton    = document.getElementById("run-to-end-btn");
const scenarioSelect    = document.getElementById("scenario-select");
const loadScenarioButton = document.getElementById("load-scenario-btn");
const scenarioDescription = document.getElementById("scenario-description");
const explanationPanel  = document.getElementById("explanation-panel");
const eventBadges       = document.getElementById("event-badges");
const signalsPanel      = document.getElementById("signals-panel");
const stageGrid         = document.getElementById("stage-grid");
const registersBody     = document.getElementById("registers-body");
const memoryBody        = document.getElementById("memory-body");
const historyBody       = document.getElementById("history-body");
const summaryCycle      = document.getElementById("summary-cycle");
const summaryPc         = document.getElementById("summary-pc");
const summaryNext       = document.getElementById("summary-next");
const summaryStatus     = document.getElementById("summary-status");
const summaryEvent      = document.getElementById("summary-event");
const summaryMemory     = document.getElementById("summary-memory");
const forwardingToggle  = document.getElementById("forwarding-toggle");
const flushToggle       = document.getElementById("flush-toggle");

const MAX_RUN_CYCLES = 200;
const EMPTY_LABEL    = "-";

let cpuState     = null;
let activeScenario = null;

// ── Utilidades de formato ────────────────────────────────────
function formatInstruction(instr) { return instr?.raw ?? EMPTY_LABEL; }

function formatStallInstruction(text, highlighted) {
  if (!text || text === EMPTY_LABEL) return EMPTY_LABEL;
  return highlighted ? `! ${text}` : text;
}

function normalizeTableText(text) {
  if (!text || text === "(empty)" || text === EMPTY_LABEL) return EMPTY_LABEL;
  return text;
}

// ── Historial ────────────────────────────────────────────────
function getLatestHistoryEntry() {
  return cpuState?.history.at(-1) ?? null;
}

// Regex correcto para extraer número de registro desde "x5 = 10n"
function getLatestWrittenRegister() {
  const wbWrite = getLatestHistoryEntry()?.wbWrite;
  if (!wbWrite) return null;
  const match = wbWrite.match(/^x(\d+)\s*=/);
  return match ? Number(match[1]) : null;
}

// ── Forwarding: lee del historial (ciclo correcto) ──────────
// forwardA/B se registran en el ciclo EX, un ciclo después
// de que la instrucción estaba en ID/EX, por eso el lugar
// correcto de leerlos es el último history entry.
function computeForwardingInfo(state) {
  const latest = state.history.at(-1);
  if (!latest) return [];

  const msgs = [];
  if (latest.forwardA) {
    msgs.push(`Anticipación hacia operando A desde ${latest.forwardA}`);
  }
  if (latest.forwardB) {
    msgs.push(`Anticipación hacia operando B desde ${latest.forwardB}`);
  }
  return msgs;
}

// ── Texto automático de explicación del ciclo ────────────────
function getAutomaticExplanation() {
  const h    = getLatestHistoryEntry();
  const fwds = computeForwardingInfo(cpuState);
  const frags = [];

  if (!h) {
    return "El programa está cargado. Avanza ciclo a ciclo para observar cómo las instrucciones recorren la segmentación.";
  }

  if (h.stall) {
    const reason = h.stallReason === "RAW hazard without forwarding"
      ? "Se ha detectado una dependencia RAW y se ha insertado una burbuja (forwarding desactivado)."
      : "Se ha detectado una dependencia load-use y se ha insertado una burbuja.";
    frags.push(reason);
  }

  if (fwds.length > 0) {
    frags.push(fwds.join(" "));
  }

  if (h.jumpTaken) {
    frags.push(`Salto incondicional tomado. El PC se redirige a ${h.branchTarget}.`);
  } else if (h.branchTaken) {
    frags.push(`El salto condicional se ha tomado. El PC se redirige a ${h.branchTarget}.`);
  }

  if (h.flush) {
    frags.push("Se han vaciado las etapas afectadas para descartar instrucciones del camino incorrecto.");
  }

  if (h.wbWrite) {
    frags.push(`En WB se ha realizado la escritura ${h.wbWrite}.`);
  }

  if (frags.length === 0) {
    return "No ha ocurrido ningún evento de control o dependencia en este ciclo. Las instrucciones avanzan normalmente por las etapas.";
  }

  return frags.join(" ");
}

function getCurrentExplanation() {
  if (!activeScenario) return getAutomaticExplanation();
  if (cpuState.cycle === 0) return activeScenario.description;
  const step = activeScenario.explanationSteps?.find((s) => s.cycle === cpuState.cycle);
  return step
    ? `${step.text} ${getAutomaticExplanation()}`
    : getAutomaticExplanation();
}

function getLastRelevantEventText() {
  const h    = getLatestHistoryEntry();
  const fwds = computeForwardingInfo(cpuState);

  if (!h)           return "Programa cargado, aún sin ejecutar.";
  if (h.stall)      return `Burbuja: ${h.stallReason ?? "stall"}.`;
  if (h.jumpTaken)  return `Salto incondicional hacia ${h.branchTarget}.`;
  if (h.branchTaken) return `Salto condicional tomado hacia ${h.branchTarget}.`;
  if (h.flush)      return "Se ha producido un vaciado del pipeline.";
  if (fwds.length)  return fwds[0];
  if (h.wbWrite)    return `Escritura completada: ${h.wbWrite}.`;
  return "Sin eventos relevantes en el ciclo actual.";
}

// ── Renderizado de escenarios ────────────────────────────────
function renderScenarioControls() {
  if (!scenarioSelect) return;
  scenarioSelect.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Programa libre";
  scenarioSelect.appendChild(blank);
  scenarios.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    scenarioSelect.appendChild(opt);
  });
  scenarioSelect.value = "";
}

function renderScenarioDescription() {
  if (!scenarioDescription) return;
  scenarioDescription.textContent = activeScenario
    ? activeScenario.description
    : "Modo libre: escribe o modifica tu propio programa ensamblador y ejecútalo paso a paso.";
}

// ── Panel de eventos (badges) ────────────────────────────────
function renderEvents() {
  if (!eventBadges) return;
  eventBadges.innerHTML = "";
  const h    = getLatestHistoryEntry();
  const fwds = computeForwardingInfo(cpuState);
  const badges = [];

  if (h?.stall) {
    badges.push({
      label: h.stallReason === "RAW hazard without forwarding"
        ? "Burbuja RAW (sin forwarding)" : "Burbuja load-use",
      cls: "event-stall",
    });
  }
  if (h?.jumpTaken) {
    badges.push({ label: `Salto incondicional → ${h.branchTarget}`, cls: "event-branch" });
  } else if (h?.branchTaken) {
    badges.push({ label: `Salto condicional → ${h.branchTarget}`, cls: "event-branch" });
  }
  if (h?.flush) {
    badges.push({ label: "Vaciado del pipeline (Flush)", cls: "event-branch" });
  }
  if (h?.wbWrite) {
    badges.push({ label: `Escritura WB: ${h.wbWrite}`, cls: "event-write" });
  }
  fwds.forEach((msg) => badges.push({ label: msg, cls: "event-forward" }));

  if (badges.length === 0) {
    const el = document.createElement("span");
    el.className = "event-pill";
    el.textContent = "Sin evento especial";
    eventBadges.appendChild(el);
    return;
  }
  badges.forEach(({ label, cls }) => {
    const el = document.createElement("span");
    el.className = `event-pill ${cls}`;
    el.textContent = label;
    eventBadges.appendChild(el);
  });
}

// ── Panel de señales de control ──────────────────────────────
// Las señales RegWrite/MemRead/MemWrite/MemToReg/Branch/Jump
// proceden de ID/EX (instrucción que va a ejecutarse).
// ForwardA/B, Stall y Flush proceden del último history entry
// porque se conocen en/después de EX.
function renderSignals() {
  if (!signalsPanel || !cpuState) return;

  const h       = getLatestHistoryEntry();
  const idEx    = cpuState.pipeline.ID_EX;
  const s       = idEx?.signals ?? {};

  const vals = {
    RegWrite: s.RegWrite  ?? false,
    MemRead:  s.MemRead   ?? false,
    MemWrite: s.MemWrite  ?? false,
    MemToReg: s.MemToReg  ?? false,
    Branch:   s.Branch    ?? false,
    Jump:     s.Jump      ?? false,
    ForwardA: h?.forwardA != null,
    ForwardB: h?.forwardB != null,
    Stall:    h?.stall    ?? false,
    Flush:    h?.flush    ?? false,
  };

  const badge = (label, active) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;
      background:${active ? "#dcfce7" : "#f1f5f9"};
      padding:4px 8px;border-radius:6px;font-size:12px;">
      <span>${label}</span>
      <span style="font-weight:bold;color:${active ? "#166534" : "#94a3b8"}">${active ? "1" : "0"}</span>
    </div>`;

  signalsPanel.innerHTML = Object.entries(vals)
    .map(([k, v]) => badge(k, v))
    .join("");
}

// ── Tarjetas de etapas del pipeline ─────────────────────────
function createStageDetail(label, value) {
  return `<div class="stage-detail">
    <span class="stage-label">${label}</span>
    <span class="stage-value">${value}</span>
  </div>`;
}

function buildStageCard(title, reg, extraTags = []) {
  const instr   = reg?.instruction ?? null;
  const details = [];
  const safeStr = (v) => (v == null ? "–" : String(v));

  if (reg && "rs1Val" in reg) details.push(createStageDetail("rs1", safeStr(reg.rs1Val)));
  if (reg && "rs2Val" in reg) details.push(createStageDetail("rs2", safeStr(reg.rs2Val)));
  if (reg && "aluResult" in reg) details.push(createStageDetail("ALU", safeStr(reg.aluResult)));
  if (reg && "memData"   in reg) details.push(createStageDetail("Dato MEM", safeStr(reg.memData)));
  if (reg && "storeValue" in reg) details.push(createStageDetail("Store val", safeStr(reg.storeValue)));

  const h = getLatestHistoryEntry();
  const displayInstr = (h?.stall && title === "IF/ID")
    ? formatStallInstruction(formatInstruction(instr), true)
    : formatInstruction(instr);

  return `
    <article class="stage-card ${instr ? "" : "stage-empty"}">
      <div class="stage-card-header">
        <h3>${title}</h3>
        <div class="stage-tags">${extraTags.join("")}</div>
      </div>
      <div class="stage-instruction">${displayInstr}</div>
      <div class="stage-details">
        ${details.length ? details.join("") : '<div class="stage-empty-text">-</div>'}
      </div>
    </article>`;
}

function renderPipeline() {
  if (!stageGrid || !cpuState) return;
  const h    = getLatestHistoryEntry();
  const fwds = computeForwardingInfo(cpuState);

  const ifIdTags  = [];
  const idExTags  = [];
  const exMemTags = [];

  if (h?.stall) {
    ifIdTags.push('<span class="mini-badge mini-stall">PC congelado</span>');
    idExTags.push('<span class="mini-badge mini-stall">Burbuja</span>');
  }
  if (h?.flush) {
    ifIdTags.push('<span class="mini-badge mini-branch">Vaciado</span>');
  }
  if (h?.branchTaken || h?.jumpTaken) {
    exMemTags.push(`<span class="mini-badge mini-branch">${h?.jumpTaken ? "Salto incond." : "Salto tomado"}</span>`);
  }
  if (fwds.length) {
    idExTags.push('<span class="mini-badge mini-forward">Anticipación</span>');
  }

  stageGrid.innerHTML = [
    buildStageCard("IF/ID",  cpuState.pipeline.IF_ID,  ifIdTags),
    buildStageCard("ID/EX",  cpuState.pipeline.ID_EX,  idExTags),
    buildStageCard("EX/MEM", cpuState.pipeline.EX_MEM, exMemTags),
    buildStageCard("MEM/WB", cpuState.pipeline.MEM_WB,
      h?.wbWrite ? ['<span class="mini-badge mini-write">Escritura</span>'] : []),
  ].join("");
}

// ── Registros ────────────────────────────────────────────────
function renderRegisters() {
  if (!registersBody || !cpuState) return;
  registersBody.innerHTML = "";
  const lastWrIdx = getLatestWrittenRegister();

  cpuState.registers.forEach((val, idx) => {
    const row = document.createElement("tr");
    const cls = [];
    if (val !== 0n)  cls.push("row-active");
    if (idx === lastWrIdx) cls.push("row-written");
    row.className = cls.join(" ");
    row.innerHTML = `<td>${getRegisterName(idx)}</td><td>${val.toString()}</td>`;
    registersBody.appendChild(row);
  });
}

// ── Memoria ──────────────────────────────────────────────────
function renderMemory() {
  if (!memoryBody || !cpuState) return;
  memoryBody.innerHTML = "";
  const entries = Object.entries(cpuState.memory)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  if (!entries.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="2">${EMPTY_LABEL}</td>`;
    memoryBody.appendChild(row);
    return;
  }
  entries.forEach(([addr, val]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${addr}</td><td>0x${Number(val).toString(16).padStart(2, "0")} (${val})</td>`;
    memoryBody.appendChild(row);
  });
}

// ── Resumen ──────────────────────────────────────────────────
function renderSummary() {
  if (!cpuState) return;
  const nextInstr = cpuState.instructionMemory[cpuState.pc];
  const byteCount = Object.keys(cpuState.memory).length;

  if (summaryCycle) summaryCycle.textContent = String(cpuState.cycle);
  if (summaryPc)    summaryPc.textContent    = String(cpuState.pc);
  if (summaryNext)  summaryNext.textContent  = formatInstruction(nextInstr);
  if (summaryStatus) summaryStatus.textContent = cpuState.halted ? "Finalizado ✓" : "Ejecutando…";
  if (summaryEvent) summaryEvent.textContent  = getLastRelevantEventText();
  if (summaryMemory) summaryMemory.textContent = `${byteCount} byte(s) de datos`;
}

// ── Historial de ciclos ───────────────────────────────────────
function renderHistory() {
  if (!historyBody || !cpuState) return;
  historyBody.innerHTML = "";
  const latestCycle = getLatestHistoryEntry()?.cycle ?? null;

  cpuState.history.forEach((e) => {
    const row = document.createElement("tr");
    const branchText = e.branchTaken
      ? `Sí → ${e.branchTarget ?? "?"}`
      : "No";
    const cls = [];
    if (e.stall)              cls.push("history-stall");
    if (e.branchTaken || e.flush) cls.push("history-branch");
    if (e.wbWrite)            cls.push("history-write");
    if (e.cycle === latestCycle) cls.push("history-current");

    row.className = cls.join(" ");
    row.innerHTML = `
      <td>${e.cycle}</td>
      <td>${e.pcBefore}</td>
      <td>${e.pcAfter}</td>
      <td>${formatStallInstruction(normalizeTableText(e.ifInstr), e.stall)}</td>
      <td>${normalizeTableText(e.idInstr)}</td>
      <td>${normalizeTableText(e.exInstr)}</td>
      <td>${normalizeTableText(e.memInstr)}</td>
      <td>${normalizeTableText(e.wbInstr)}</td>
      <td>${e.stall ? "Sí" : "No"}</td>
      <td>${branchText}</td>
      <td>${e.flush ? "Sí" : "No"}</td>
      <td>${normalizeTableText(e.wbWrite)}</td>
    `;
    historyBody.appendChild(row);
  });
}

// ── Explicación textual del ciclo ────────────────────────────
function renderExplanation() {
  if (!explanationPanel) return;
  explanationPanel.textContent = getCurrentExplanation();
}

// ── Render global ────────────────────────────────────────────
function render() {
  renderScenarioDescription();
  renderSummary();
  renderEvents();
  renderSignals();
  renderPipeline();
  renderExplanation();
  renderRegisters();
  renderMemory();
  renderHistory();
}

// ── Carga de programas ───────────────────────────────────────
function loadCurrentProgram(opts = {}) {
  const { preserveScenario = false } = opts;
  const parsed = parseProgram(programInput.value);

  if (!preserveScenario) {
    activeScenario = null;
    if (scenarioSelect) scenarioSelect.value = "";
  }

  cpuState = loadProgram(parsed, {
    enableForwarding:   forwardingToggle ? forwardingToggle.checked : true,
    enableBranchFlush:  flushToggle      ? flushToggle.checked      : true,
  });
  render();
}

function resetCurrentProgram() {
  loadCurrentProgram({ preserveScenario: !!activeScenario });
}

function runCycles(limit) {
  if (!cpuState) return;
  let n = 0;
  while (!cpuState.halted && n < limit) {
    cpuState = stepCPU(cpuState);
    n++;
  }
  render();
}

function loadScenarioById(id) {
  const scenario = getScenarioById(id);
  if (!scenario) { activeScenario = null; return; }
  activeScenario = scenario;
  if (scenarioSelect) scenarioSelect.value = scenario.id;
  programInput.value = scenario.code;
  loadCurrentProgram({ preserveScenario: true });
}

// ── Listeners ────────────────────────────────────────────────
// Los toggles solo cambian las opciones del estado activo sin
// recargar el programa, para que el estudiante pueda comparar.
forwardingToggle?.addEventListener("change", (e) => {
  if (cpuState) cpuState.options.enableForwarding  = e.target.checked;
});
flushToggle?.addEventListener("change", (e) => {
  if (cpuState) cpuState.options.enableBranchFlush = e.target.checked;
});

loadButton?.addEventListener("click", () => {
  try { loadCurrentProgram(); } catch (err) { alert(err.message); }
});
resetButton?.addEventListener("click", () => {
  try { resetCurrentProgram(); } catch (err) { alert(err.message); }
});
stepButton?.addEventListener("click", () => {
  if (!cpuState || cpuState.halted) return;
  cpuState = stepCPU(cpuState);
  render();
});
runButton?.addEventListener("click", () => runCycles(MAX_RUN_CYCLES));
runToEndButton?.addEventListener("click", () => runCycles(2000));

loadScenarioButton?.addEventListener("click", () => {
  if (!scenarioSelect?.value) { activeScenario = null; render(); return; }
  loadScenarioById(scenarioSelect.value);
});

// ── Inicialización ───────────────────────────────────────────
if (scenarioSelect) renderScenarioControls();

// Programa de demostración por defecto
programInput.value = `.data
valor: .word 20
.text
li t0, 5
add t1, t0, t0
la t2, valor
lw t3, 0(t2)
add t4, t3, t1
beq t4, t4, fin
sw t4, 4(t2)
fin:
sub t5, t4, t0`;

loadCurrentProgram();
