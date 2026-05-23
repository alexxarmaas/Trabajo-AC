import { loadProgram, stepCPU } from "./cpu.js";
import { getRegisterName, parseProgram } from "./parser.js";
import { getScenarioById, scenarios } from "./scenarios.js";

const programInput = document.getElementById("program-input");
const loadButton = document.getElementById("load-btn");
const resetButton = document.getElementById("reset-btn");
const stepButton = document.getElementById("step-btn");
const runButton = document.getElementById("run-btn");
const runToEndButton = document.getElementById("run-to-end-btn");
const scenarioSelect = document.getElementById("scenario-select");
const loadScenarioButton = document.getElementById("load-scenario-btn");
const scenarioDescription = document.getElementById("scenario-description");
const explanationPanel = document.getElementById("explanation-panel");
const eventBadges = document.getElementById("event-badges");
const signalsPanel = document.getElementById("signals-panel");
const stageGrid = document.getElementById("stage-grid");
const registersBody = document.getElementById("registers-body");
const memoryBody = document.getElementById("memory-body");
const historyBody = document.getElementById("history-body");

const summaryCycle = document.getElementById("summary-cycle");
const summaryPc = document.getElementById("summary-pc");
const summaryNext = document.getElementById("summary-next");
const summaryStatus = document.getElementById("summary-status");
const summaryEvent = document.getElementById("summary-event");
const summaryMemory = document.getElementById("summary-memory");

const forwardingToggle = document.getElementById("forwarding-toggle");
const flushToggle = document.getElementById("flush-toggle");

const MAX_RUN_CYCLES = 100;
const EMPTY_LABEL = "-";

let cpuState = null;
let activeScenario = null;

function formatInstruction(instruction) {
  return instruction?.raw ?? EMPTY_LABEL;
}

function formatStallInstruction(text, highlighted) {
  if (!text || text === EMPTY_LABEL) {
    return EMPTY_LABEL;
  }
  return highlighted ? `! ${text}` : text;
}

function normalizeTableText(text) {
  if (!text || text === "(empty)" || text === "(vacio)" || text === EMPTY_LABEL) {
    return EMPTY_LABEL;
  }
  return text;
}

function computeForwardingInfo(state) {
  const idExSignals = state.pipeline.ID_EX?.signals;
  if (!idExSignals) return [];

  const messages = [];
  if (idExSignals.ForwardA) {
    messages.push(`Anticipacion hacia operando A`);
  }
  if (idExSignals.ForwardB) {
    messages.push(`Anticipacion hacia operando B`);
  }
  return messages;
}

function getLatestHistoryEntry() {
  return cpuState.history.at(-1) ?? null;
}

function getLatestWrittenRegister() {
  const wbWrite = getLatestHistoryEntry()?.wbWrite;
  if (!wbWrite) {
    return null;
  }
  const match = wbWrite.match(/^x(\\d+)\\s*=/);
  return match ? Number(match[1]) : null;
}

function getAutomaticExplanation() {
  const latestHistory = getLatestHistoryEntry();
  const forwardingMessages = computeForwardingInfo(cpuState);
  const fragments = [];

  if (!latestHistory) {
    return "El programa esta cargado. Avanza ciclo a ciclo para observar como las instrucciones recorren la segmentacion.";
  }

  if (latestHistory.stall) {
    fragments.push("Se ha detectado una dependencia de tipo load-use y se ha insertado una burbuja.");
  }

  if (forwardingMessages.length > 0) {
    fragments.push(forwardingMessages.map((message) => `${message}.`).join(" "));
  }

  if (latestHistory.branchTaken) {
    fragments.push(`El salto se ha tomado y el PC se redirige a ${latestHistory.branchTarget}.`);
  }

  if (latestHistory.flush) {
    fragments.push("Se han vaciado las etapas afectadas para descartar instrucciones del camino incorrecto.");
  }

  if (latestHistory.wbWrite) {
    fragments.push(`En WB se ha realizado la escritura ${latestHistory.wbWrite}.`);
  }

  if (fragments.length === 0) {
    return "No ha ocurrido ningun evento de control o dependencia en este ciclo. Las instrucciones avanzan normalmente por las etapas.";
  }

  return fragments.join(" ");
}

function getCurrentExplanation() {
  if (!activeScenario) {
    return getAutomaticExplanation();
  }

  if (cpuState.cycle === 0) {
    return activeScenario.description;
  }

  const explanation = activeScenario.explanationSteps.find((step) => step.cycle === cpuState.cycle);
  if (!explanation) {
    return getAutomaticExplanation();
  }

  return `${explanation.text} ${getAutomaticExplanation()}`;
}

function getLastRelevantEventText() {
  const latestHistory = getLatestHistoryEntry();
  const forwardingMessages = computeForwardingInfo(cpuState);

  if (!latestHistory) {
    return "Programa cargado, aun sin ejecutar.";
  }
  if (latestHistory.stall) {
    return "Se ha insertado una burbuja por riesgo load-use.";
  }
  if (latestHistory.branchTaken) {
    return `Salto tomado hacia ${latestHistory.branchTarget}.`;
  }
  if (latestHistory.flush) {
    return "Se ha producido un vaciado del pipeline.";
  }
  if (forwardingMessages.length > 0) {
    return forwardingMessages[0];
  }
  if (latestHistory.wbWrite) {
    return `Escritura completada: ${latestHistory.wbWrite}.`;
  }

  return "Sin eventos relevantes en el ciclo actual.";
}

function renderScenarioControls() {
  if (!scenarioSelect) return;
  scenarioSelect.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = "Programa libre";
  scenarioSelect.appendChild(manualOption);

  scenarios.forEach((scenario) => {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.name;
    scenarioSelect.appendChild(option);
  });

  scenarioSelect.value = "";
}

function renderScenarioDescription() {
  if (!scenarioDescription) return;
  if (!activeScenario) {
    scenarioDescription.textContent = "Modo libre: escribe o modifica tu propio programa ensamblador y ejecutalo paso a paso.";
    return;
  }
  scenarioDescription.textContent = activeScenario.description;
}

function renderExplanation() {
  explanationPanel.textContent = getCurrentExplanation();
}

function renderEvents() {
  eventBadges.innerHTML = "";
  const latestHistory = getLatestHistoryEntry();
  const badges = [];

  if (latestHistory?.stall) {
    badges.push({ label: "Burbuja por stall", className: "event-stall" });
  }
  if (latestHistory?.branchTaken) {
    badges.push({
      label: `Salto tomado${latestHistory.branchTarget != null ? ` a ${latestHistory.branchTarget}` : ""}`,
      className: "event-branch",
    });
  }
  if (latestHistory?.flush) {
    badges.push({ label: "Vaciado del pipeline", className: "event-branch" });
  }
  if (latestHistory?.wbWrite) {
    badges.push({ label: `Escritura WB: ${latestHistory.wbWrite}`, className: "event-write" });
  }

  computeForwardingInfo(cpuState).forEach((message) => {
    badges.push({ label: message, className: "event-forward" });
  });

  if (badges.length === 0) {
    const idleBadge = document.createElement("span");
    idleBadge.className = "event-pill";
    idleBadge.textContent = "Sin evento especial";
    eventBadges.appendChild(idleBadge);
    return;
  }

  badges.forEach((badge) => {
    const element = document.createElement("span");
    element.className = `event-pill ${badge.className}`;
    element.textContent = badge.label;
    eventBadges.appendChild(element);
  });
}

function renderSignals() {
  if (!signalsPanel) return;
  signalsPanel.innerHTML = "";
  if (!cpuState) return;

  const exRegister = cpuState.pipeline.ID_EX;
  const signals = exRegister?.signals || {
    RegWrite: false, MemRead: false, MemWrite: false, Branch: false,
    ForwardA: false, ForwardB: false, Stall: false, Flush: false
  };

  const createSignalBadge = (label, isActive) => {
    return `<div style="display: flex; align-items: center; justify-content: space-between; background: ${isActive ? '#dcfce7' : '#f1f5f9'}; padding: 4px 8px; border-radius: 6px;">
      <span>${label}</span>
      <span style="font-weight: bold; color: ${isActive ? '#166534' : '#94a3b8'}">${isActive ? '1' : '0'}</span>
    </div>`;
  };

  signalsPanel.innerHTML = `
    ${createSignalBadge("RegWrite", signals.RegWrite)}
    ${createSignalBadge("MemRead", signals.MemRead)}
    ${createSignalBadge("MemWrite", signals.MemWrite)}
    ${createSignalBadge("Branch", signals.Branch)}
    ${createSignalBadge("ForwardA", signals.ForwardA)}
    ${createSignalBadge("ForwardB", signals.ForwardB)}
    ${createSignalBadge("Stall", signals.Stall)}
    ${createSignalBadge("Flush", signals.Flush)}
  `;
}

function createStageDetail(label, value) {
  return `<div class="stage-detail"><span class="stage-label">${label}</span><span class="stage-value">${value}</span></div>`;
}

function buildStageCard(title, register, extraTags = []) {
  const instruction = register?.instruction ?? null;
  const details = [];

  if (register && "rs1Val" in register) {
    details.push(createStageDetail("rs1", register.rs1Val.toString()));
  }
  if (register && "rs2Val" in register) {
    details.push(createStageDetail("rs2", register.rs2Val.toString()));
  }
  if (register && "aluResult" in register) {
    details.push(createStageDetail("ALU", register.aluResult.toString()));
  }
  if (register && "memData" in register) {
    details.push(createStageDetail("Dato MEM", register.memData.toString()));
  }
  if (register && "storeValue" in register) {
    details.push(createStageDetail("Valor a guardar", register.storeValue.toString()));
  }

  const latestHistory = getLatestHistoryEntry();
  const highlightedInstruction = latestHistory?.stall && title === "IF/ID"
    ? formatStallInstruction(formatInstruction(instruction), true)
    : formatInstruction(instruction);

  return `
    <article class="stage-card ${instruction ? "" : "stage-empty"}">
      <div class="stage-card-header">
        <h3>${title}</h3>
        <div class="stage-tags">${extraTags.join("")}</div>
      </div>
      <div class="stage-instruction">${highlightedInstruction}</div>
      <div class="stage-details">
        ${details.length > 0 ? details.join("") : '<div class="stage-empty-text">-</div>'}
      </div>
    </article>
  `;
}

function renderPipeline() {
  const latestHistory = getLatestHistoryEntry();
  const forwardingMessages = computeForwardingInfo(cpuState);
  const ifIdTags = [];
  const idExTags = [];
  const exMemTags = [];

  if (latestHistory?.stall) {
    ifIdTags.push('<span class="mini-badge mini-stall">PC congelado</span>');
    idExTags.push('<span class="mini-badge mini-stall">Burbuja</span>');
  }
  if (latestHistory?.flush) {
    ifIdTags.push('<span class="mini-badge mini-branch">Vaciado</span>');
  }
  if (latestHistory?.branchTaken) {
    exMemTags.push('<span class="mini-badge mini-branch">Salto tomado</span>');
  }
  if (forwardingMessages.length > 0) {
    idExTags.push('<span class="mini-badge mini-forward">Anticipacion</span>');
  }

  stageGrid.innerHTML = [
    buildStageCard("IF/ID", cpuState.pipeline.IF_ID, ifIdTags),
    buildStageCard("ID/EX", cpuState.pipeline.ID_EX, idExTags),
    buildStageCard("EX/MEM", cpuState.pipeline.EX_MEM, exMemTags),
    buildStageCard(
      "MEM/WB",
      cpuState.pipeline.MEM_WB,
      latestHistory?.wbWrite ? ['<span class="mini-badge mini-write">Escritura</span>'] : [],
    ),
  ].join("");
}

function renderRegisters() {
  registersBody.innerHTML = "";
  const latestWrittenRegister = getLatestWrittenRegister();

  cpuState.registers.forEach((value, index) => {
    const row = document.createElement("tr");
    const classes = [];
    if (value !== 0n) {
      classes.push("row-active");
    }
    if (index === latestWrittenRegister) {
      classes.push("row-written");
    }
    row.className = classes.join(" ");
    row.innerHTML = `<td>${getRegisterName(index)}</td><td>${value.toString()}</td>`;
    registersBody.appendChild(row);
  });
}

function renderMemory() {
  memoryBody.innerHTML = "";
  const entries = Object.entries(cpuState.memory).sort((a, b) => Number(a[0]) - Number(b[0]));

  if (entries.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="2">${EMPTY_LABEL}</td>`;
    memoryBody.appendChild(row);
    return;
  }

  entries.forEach(([address, value]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${address}</td><td>${value}</td>`;
    memoryBody.appendChild(row);
  });
}

function renderSummary() {
  const nextInstruction = cpuState.instructionMemory[cpuState.pc];
  const memoryCount = Object.keys(cpuState.memory).length;

  summaryCycle.textContent = String(cpuState.cycle);
  summaryPc.textContent = String(cpuState.pc);
  summaryNext.textContent = formatInstruction(nextInstruction);
  summaryStatus.textContent = cpuState.halted ? "Finalizado" : "Ejecutando";
  summaryEvent.textContent = getLastRelevantEventText();
  summaryMemory.textContent = `${memoryCount} byte(s)`;
}

function renderHistory() {
  historyBody.innerHTML = "";
  const latestCycle = getLatestHistoryEntry()?.cycle ?? null;

  cpuState.history.forEach((entry) => {
    const row = document.createElement("tr");
    const branchText = entry.branchTaken
      ? `Si${entry.branchTarget != null ? ` -> ${entry.branchTarget}` : ""}`
      : "No";
    const classes = [];

    if (entry.stall) {
      classes.push("history-stall");
    }
    if (entry.branchTaken || entry.flush) {
      classes.push("history-branch");
    }
    if (entry.wbWrite) {
      classes.push("history-write");
    }
    if (entry.cycle === latestCycle) {
      classes.push("history-current");
    }

    row.className = classes.join(" ");
    row.innerHTML = `
      <td>${entry.cycle}</td>
      <td>${entry.pcBefore}</td>
      <td>${entry.pcAfter}</td>
      <td>${formatStallInstruction(normalizeTableText(entry.ifInstr), entry.stall)}</td>
      <td>${formatStallInstruction(normalizeTableText(entry.idInstr), entry.stall)}</td>
      <td>${normalizeTableText(entry.exInstr)}</td>
      <td>${normalizeTableText(entry.memInstr)}</td>
      <td>${normalizeTableText(entry.wbInstr)}</td>
      <td>${entry.stall ? "Si" : "No"}</td>
      <td>${branchText}</td>
      <td>${entry.flush ? "Si" : "No"}</td>
      <td>${normalizeTableText(entry.wbWrite)}</td>
    `;

    historyBody.appendChild(row);
  });
}

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

function loadScenarioById(id) {
  const scenario = getScenarioById(id);
  if (!scenario) {
    activeScenario = null;
    return;
  }

  activeScenario = scenario;
  scenarioSelect.value = scenario.id;
  programInput.value = scenario.code;
  loadCurrentProgram({ preserveScenario: true });
}

function loadCurrentProgram(options = {}) {
  const { preserveScenario = false } = options;
  const parsedProgram = parseProgram(programInput.value);

  if (!preserveScenario) {
    activeScenario = null;
    if (scenarioSelect) {
      scenarioSelect.value = "";
    }
  }

  cpuState = loadProgram(parsedProgram, {
    enableForwarding: forwardingToggle ? forwardingToggle.checked : true,
    enableBranchFlush: flushToggle ? flushToggle.checked : true,
  });
  render();
}

function resetCurrentProgram() {
  loadCurrentProgram({ preserveScenario: !!activeScenario });
}

function runCycles(limit) {
  if (!cpuState) return;
  let cycles = 0;
  while (!cpuState.halted && cycles < limit) {
    cpuState = stepCPU(cpuState);
    cycles += 1;
  }
  render();
}

if (forwardingToggle) {
  forwardingToggle.addEventListener("change", (e) => {
    if (cpuState) {
      cpuState.options.enableForwarding = e.target.checked;
    }
  });
}

if (flushToggle) {
  flushToggle.addEventListener("change", (e) => {
    if (cpuState) {
      cpuState.options.enableBranchFlush = e.target.checked;
    }
  });
}

loadButton.addEventListener("click", () => {
  try {
    loadCurrentProgram();
  } catch (error) {
    window.alert(error.message);
  }
});

resetButton.addEventListener("click", () => {
  try {
    resetCurrentProgram();
  } catch (error) {
    window.alert(error.message);
  }
});

stepButton.addEventListener("click", () => {
  if (!cpuState) return;
  cpuState = stepCPU(cpuState);
  render();
});

runButton.addEventListener("click", () => {
  runCycles(MAX_RUN_CYCLES);
});

if (runToEndButton) {
  runToEndButton.addEventListener("click", () => {
    runCycles(1000);
  });
}

if (loadScenarioButton) {
  loadScenarioButton.addEventListener("click", () => {
    if (!scenarioSelect.value) {
      activeScenario = null;
      render();
      return;
    }
    loadScenarioById(scenarioSelect.value);
  });
}

if (scenarioSelect) {
  renderScenarioControls();
}

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
