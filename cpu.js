import { stepPipeline } from "./pipeline.js";

export function createCPU(program) {
  const instructionMemory = {};
  for (const instruction of program) {
    instructionMemory[instruction.address] = { ...instruction };
  }

  return {
    pc: 0,
    cycle: 0,
    program: program.map((instruction) => ({ ...instruction })),
    instructionMemory,
    registers: new Array(32).fill(0),
    memory: {},
    pipeline: {
      IF_ID: null,
      ID_EX: null,
      EX_MEM: null,
      MEM_WB: null,
    },
    history: [],
    halted: false,
  };
}

export function loadProgram(program) {
  const cpu = createCPU(program);
  cpu.memory[15] = 20;
  return cpu;
}

export function stepCPU(cpuState) {
  return stepPipeline(cpuState);
}
