import { stepPipeline } from "./pipeline.js";

export function createCPU(program, options = {}) {
  const { dataLabels = {}, dataMemory = {} } = options;
  const instructionMemory = {};
  for (const instruction of program) {
    instructionMemory[instruction.address] = { ...instruction };
  }

  return {
    pc: 0,
    cycle: 0,
    program: program.map((instruction) => ({ ...instruction })),
    instructionMemory,
    registers: new Array(32).fill(0n),
    memory: { ...dataMemory },
    dataLabels: { ...dataLabels },
    pipeline: {
      IF_ID: null,
      ID_EX: null,
      EX_MEM: null,
      MEM_WB: null,
    },
    history: [],
    halted: false,
    options: {
      enableForwarding: options.enableForwarding ?? true,
      enableBranchFlush: options.enableBranchFlush ?? true
    }
  };
}

export function loadProgram(parsedProgram, options = {}) {
  if (Array.isArray(parsedProgram)) {
    const cpu = createCPU(parsedProgram, options);
    return cpu;
  }

  const cpu = createCPU(parsedProgram.program ?? [], {
    dataLabels: parsedProgram.dataLabels ?? {},
    dataMemory: parsedProgram.dataMemory ?? {},
    ...options
  });

  return cpu;
}

export function stepCPU(cpuState) {
  return stepPipeline(cpuState);
}
