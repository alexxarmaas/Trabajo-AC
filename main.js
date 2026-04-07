import { loadProgram, stepCPU } from "./cpu.js";
import { getRegisterName, parseProgram } from "./parser.js";

const programInput = document.getElementById("program-input");
const loadButton = document.getElementById("load-btn");
const stepButton = document.getElementById("step-btn");
const cpuSummary = document.getElementById("cpu-summary");
const pipelineView = document.getElementById("pipeline-view");
const registersBody = document.getElementById("registers-body");

let cpuState = null;

function formatInstruction(instruction) {
  return instruction ? instruction.raw : "(empty)";
}

function formatPipelineRegister(register) {
  if (!register?.instruction) {
    return "(empty)";
  }

  const parts = [`instr: ${register.instruction.raw}`];
  if ("rs1Val" in register) {
    parts.push(`rs1Val: ${register.rs1Val}`);
  }
  if ("rs2Val" in register) {
    parts.push(`rs2Val: ${register.rs2Val}`);
  }
  if ("aluResult" in register) {
    parts.push(`aluResult: ${register.aluResult}`);
  }
  if ("memData" in register) {
    parts.push(`memData: ${register.memData}`);
  }
  if ("storeValue" in register) {
    parts.push(`storeValue: ${register.storeValue}`);
  }

  return parts.join("\n");
}

function renderRegisters() {
  registersBody.innerHTML = "";
  cpuState.registers.forEach((value, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${getRegisterName(index)}</td><td>${value}</td>`;
    registersBody.appendChild(row);
  });
}

function renderSummary() {
  const nextInstruction = cpuState.instructionMemory[cpuState.pc];
  const memoryEntries = Object.entries(cpuState.memory)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([address, value]) => `[${address}] = ${value}`)
    .join("\n") || "(empty)";

  cpuSummary.textContent = [
    `Cycle: ${cpuState.cycle}`,
    `PC: ${cpuState.pc}`,
    `Next fetch: ${formatInstruction(nextInstruction)}`,
    `Halted: ${cpuState.halted}`,
    "",
    "Memory:",
    memoryEntries,
  ].join("\n");
}

function renderPipeline() {
  const { IF_ID, ID_EX, EX_MEM, MEM_WB } = cpuState.pipeline;
  pipelineView.textContent = [
    "IF/ID",
    formatPipelineRegister(IF_ID),
    "",
    "ID/EX",
    formatPipelineRegister(ID_EX),
    "",
    "EX/MEM",
    formatPipelineRegister(EX_MEM),
    "",
    "MEM/WB",
    formatPipelineRegister(MEM_WB),
  ].join("\n");
}

function render() {
  renderSummary();
  renderPipeline();
  renderRegisters();
}

function loadCurrentProgram() {
  const program = parseProgram(programInput.value);
  cpuState = loadProgram(program);
  render();
}

loadButton.addEventListener("click", () => {
  try {
    loadCurrentProgram();
  } catch (error) {
    window.alert(error.message);
  }
});

stepButton.addEventListener("click", () => {
  if (!cpuState) {
    return;
  }

  cpuState = stepCPU(cpuState);
  render();
});

loadCurrentProgram();
