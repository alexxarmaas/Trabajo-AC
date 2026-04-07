function clonePipelineRegister(register) {
  if (!register) {
    return null;
  }

  return {
    ...register,
    instruction: register.instruction ? { ...register.instruction } : null,
  };
}

function cloneState(state) {
  return {
    pc: state.pc,
    cycle: state.cycle,
    program: state.program.map((instruction) => ({ ...instruction })),
    instructionMemory: { ...state.instructionMemory },
    registers: [...state.registers],
    memory: { ...state.memory },
    pipeline: {
      IF_ID: clonePipelineRegister(state.pipeline.IF_ID),
      ID_EX: clonePipelineRegister(state.pipeline.ID_EX),
      EX_MEM: clonePipelineRegister(state.pipeline.EX_MEM),
      MEM_WB: clonePipelineRegister(state.pipeline.MEM_WB),
    },
    halted: state.halted,
  };
}

function writesRegister(op) {
  return ["add", "sub", "and", "or", "addi", "lw"].includes(op);
}

function getWriteBackValue(register) {
  if (!register) {
    return null;
  }

  if (register.instruction?.op === "lw") {
    return register.memData ?? 0;
  }

  return register.aluResult ?? 0;
}

function getForwardedValue(sourceRegister, currentState, registerIndex) {
  if (registerIndex == null || registerIndex === 0) {
    return sourceRegister;
  }

  const exMem = currentState.pipeline.EX_MEM;
  if (
    exMem &&
    exMem.instruction &&
    writesRegister(exMem.instruction.op) &&
    exMem.instruction.op !== "lw" &&
    exMem.instruction.rd === registerIndex
  ) {
    return exMem.aluResult;
  }

  const memWb = currentState.pipeline.MEM_WB;
  if (
    memWb &&
    memWb.instruction &&
    writesRegister(memWb.instruction.op) &&
    memWb.instruction.rd === registerIndex
  ) {
    return getWriteBackValue(memWb);
  }

  return sourceRegister;
}

function getInstructionAtPc(state, pc) {
  return state.instructionMemory[pc] ?? null;
}

function usesRegister(instruction, registerIndex) {
  if (!instruction || registerIndex == null || registerIndex === 0) {
    return false;
  }

  switch (instruction.op) {
    case "add":
    case "sub":
    case "and":
    case "or":
    case "beq":
      return instruction.rs1 === registerIndex || instruction.rs2 === registerIndex;
    case "addi":
    case "lw":
      return instruction.rs1 === registerIndex;
    case "sw":
      return instruction.rs1 === registerIndex || instruction.rs2 === registerIndex;
    default:
      return false;
  }
}

export function stepPipeline(currentState) {
  const nextState = cloneState(currentState);
  nextState.cycle += 1;

  let stall = false;
  let branchTaken = false;
  let branchTarget = null;

  nextState.pipeline.IF_ID = null;
  nextState.pipeline.ID_EX = null;
  nextState.pipeline.EX_MEM = null;
  nextState.pipeline.MEM_WB = null;

  const wbRegister = currentState.pipeline.MEM_WB;
  if (wbRegister?.instruction && writesRegister(wbRegister.instruction.op)) {
    const rd = wbRegister.instruction.rd;
    if (rd != null && rd !== 0) {
      nextState.registers[rd] = getWriteBackValue(wbRegister);
    }
  }

  const memRegister = currentState.pipeline.EX_MEM;
  if (memRegister?.instruction) {
    const instruction = memRegister.instruction;
    const memWb = { ...memRegister, instruction: { ...instruction } };

    if (instruction.op === "lw") {
      memWb.memData = currentState.memory[memRegister.aluResult] ?? 0;
    } else if (instruction.op === "sw") {
      nextState.memory[memRegister.aluResult] = memRegister.storeValue ?? 0;
    }

    nextState.pipeline.MEM_WB = memWb;
  }

  const exRegister = currentState.pipeline.ID_EX;
  if (exRegister?.instruction) {
    const instruction = exRegister.instruction;
    const operandA = getForwardedValue(exRegister.rs1Val, currentState, instruction.rs1);
    const operandB = getForwardedValue(exRegister.rs2Val, currentState, instruction.rs2);
    const exMem = {
      instruction: { ...instruction },
      aluResult: 0,
      storeValue: operandB,
      rs2Val: operandB,
    };

    switch (instruction.op) {
      case "add":
        exMem.aluResult = operandA + operandB;
        break;
      case "sub":
        exMem.aluResult = operandA - operandB;
        break;
      case "and":
        exMem.aluResult = operandA & operandB;
        break;
      case "or":
        exMem.aluResult = operandA | operandB;
        break;
      case "addi":
        exMem.aluResult = operandA + instruction.imm;
        break;
      case "lw":
      case "sw":
        exMem.aluResult = operandA + instruction.imm;
        break;
      case "beq":
        if (operandA === operandB) {
          branchTaken = true;
          branchTarget = instruction.address + instruction.imm;
        }
        break;
      default:
        break;
    }

    if (instruction.op !== "beq") {
      nextState.pipeline.EX_MEM = exMem;
    }
  }

  const idRegister = currentState.pipeline.IF_ID;
  if (branchTaken) {
    nextState.pipeline.ID_EX = null;
  } else if (idRegister?.instruction) {
    const instruction = idRegister.instruction;
    const pendingLoad = currentState.pipeline.ID_EX?.instruction;
    if (
      pendingLoad?.op === "lw" &&
      pendingLoad.rd != null &&
      usesRegister(instruction, pendingLoad.rd)
    ) {
      stall = true;
      nextState.pipeline.ID_EX = null;
      nextState.pipeline.IF_ID = clonePipelineRegister(currentState.pipeline.IF_ID);
    } else {
      nextState.pipeline.ID_EX = {
        instruction: { ...instruction },
        rs1Val: instruction.rs1 != null ? currentState.registers[instruction.rs1] : 0,
        rs2Val: instruction.rs2 != null ? currentState.registers[instruction.rs2] : 0,
      };
    }
  }

  if (branchTaken) {
    nextState.pipeline.IF_ID = null;
    nextState.pc = branchTarget;
  } else if (stall) {
    nextState.pc = currentState.pc;
  } else {
    const instruction = getInstructionAtPc(currentState, currentState.pc);
    if (instruction) {
      nextState.pipeline.IF_ID = {
        instruction: { ...instruction },
      };
      nextState.pc = currentState.pc + 4;
    } else {
      nextState.pipeline.IF_ID = null;
      nextState.pc = currentState.pc;
    }
  }

  const pipelineEmpty = !nextState.pipeline.IF_ID &&
    !nextState.pipeline.ID_EX &&
    !nextState.pipeline.EX_MEM &&
    !nextState.pipeline.MEM_WB;
  const noInstructionToFetch = getInstructionAtPc(nextState, nextState.pc) == null;
  nextState.halted = pipelineEmpty && noInstructionToFetch;

  return nextState;
}
