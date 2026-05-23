function clonePipelineRegister(register) {
  if (!register) return null;
  return {
    ...register,
    instruction: register.instruction ? { ...register.instruction } : null,
    signals: register.signals ? { ...register.signals } : null,
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
    dataLabels: { ...state.dataLabels },
    pipeline: {
      IF_ID: clonePipelineRegister(state.pipeline.IF_ID),
      ID_EX: clonePipelineRegister(state.pipeline.ID_EX),
      EX_MEM: clonePipelineRegister(state.pipeline.EX_MEM),
      MEM_WB: clonePipelineRegister(state.pipeline.MEM_WB),
    },
    history: state.history.map((entry) => ({ ...entry })),
    halted: state.halted,
    options: { ...state.options },
  };
}

function writesRegister(op) {
  return [
    "add", "sub", "and", "or", "xor", "sll", "srl", "sra",
    "mul", "div", "rem",
    "addi", "andi", "ori", "xori",
    "lw", "ld", "la", "lui", "auipc", "jal", "jalr"
  ].includes(op);
}

function isLoad(op) {
  return op === "lw" || op === "ld";
}

function isStore(op) {
  return op === "sw" || op === "sd";
}

function isBranch(op) {
  return op === "beq" || op === "bne" || op === "jal" || op === "jalr";
}

function getWriteBackValue(register) {
  if (!register) return 0n;
  if (isLoad(register.instruction?.op)) {
    return register.memData ?? 0n;
  }
  return register.aluResult ?? 0n;
}

function getForwardedValue(sourceRegisterVal, currentState, registerIndex, stageLabel) {
  if (!currentState.options.enableForwarding) {
    return { value: sourceRegisterVal, forwardedFrom: null };
  }

  if (registerIndex == null || registerIndex === 0) {
    return { value: sourceRegisterVal, forwardedFrom: null };
  }

  const exMem = currentState.pipeline.EX_MEM;
  if (exMem?.instruction && writesRegister(exMem.instruction.op) && !isLoad(exMem.instruction.op) && exMem.instruction.rd === registerIndex) {
    return { value: exMem.aluResult, forwardedFrom: "EX/MEM" };
  }

  const memWb = currentState.pipeline.MEM_WB;
  if (memWb?.instruction && writesRegister(memWb.instruction.op) && memWb.instruction.rd === registerIndex) {
    return { value: getWriteBackValue(memWb), forwardedFrom: "MEM/WB" };
  }

  return { value: sourceRegisterVal, forwardedFrom: null };
}

function getInstructionAtPc(state, pc) {
  return state.instructionMemory[pc] ?? null;
}

function formatInstruction(instruction) {
  return instruction?.raw ?? "(empty)";
}

function usesRegister(instruction, registerIndex) {
  if (!instruction || registerIndex == null || registerIndex === 0) return false;
  switch (instruction.type) {
    case "R":
    case "B":
    case "S":
      return instruction.rs1 === registerIndex || instruction.rs2 === registerIndex;
    case "I":
      if (instruction.op === "jalr") return instruction.rs1 === registerIndex;
      return instruction.rs1 === registerIndex;
    default:
      return false;
  }
}

function readMemory(memory, address, size) {
  let val = 0n;
  for (let i = 0; i < size; i++) {
    const byte = BigInt(memory[address + i] ?? 0);
    val |= (byte << BigInt(i * 8));
  }
  return val;
}

function writeMemory(memory, address, size, value) {
  let v = BigInt(value);
  for (let i = 0; i < size; i++) {
    memory[address + i] = Number(v & 0xFFn);
    v >>= 8n;
  }
}

function signExtend32(val) {
  const isNegative = val & 0x80000000n;
  if (isNegative) {
    return val | 0xFFFFFFFF00000000n;
  }
  return val;
}

export function stepPipeline(currentState) {
  const nextState = cloneState(currentState);
  const pcBefore = currentState.pc;
  const fetchedInstruction = getInstructionAtPc(currentState, currentState.pc);
  const ifInstr = formatInstruction(fetchedInstruction);
  const idInstr = formatInstruction(currentState.pipeline.IF_ID?.instruction);
  const exInstr = formatInstruction(currentState.pipeline.ID_EX?.instruction);
  const memInstr = formatInstruction(currentState.pipeline.EX_MEM?.instruction);
  const wbInstr = formatInstruction(currentState.pipeline.MEM_WB?.instruction);
  nextState.cycle += 1;

  let stall = false;
  let branchTaken = false;
  let branchTarget = null;
  let flush = false;
  let wbWrite = null;

  nextState.pipeline.IF_ID = null;
  nextState.pipeline.ID_EX = null;
  nextState.pipeline.EX_MEM = null;
  nextState.pipeline.MEM_WB = null;

  // WB Stage
  const wbRegister = currentState.pipeline.MEM_WB;
  if (wbRegister?.instruction && writesRegister(wbRegister.instruction.op)) {
    const rd = wbRegister.instruction.rd;
    if (rd != null && rd !== 0) {
      const value = getWriteBackValue(wbRegister);
      nextState.registers[rd] = value;
      wbWrite = `x${rd} = ${value}`;
    }
  }
  nextState.registers[0] = 0n; // Ensure x0 is always 0n

  // MEM Stage
  const memRegister = currentState.pipeline.EX_MEM;
  if (memRegister?.instruction) {
    const instruction = memRegister.instruction;
    const memWb = { ...memRegister, instruction: { ...instruction }, signals: { ...memRegister.signals } };
    const addr = Number(memRegister.aluResult);

    if (instruction.op === "lw") {
      memWb.memData = signExtend32(readMemory(currentState.memory, addr, 4));
    } else if (instruction.op === "ld") {
      memWb.memData = readMemory(currentState.memory, addr, 8);
    } else if (instruction.op === "sw") {
      writeMemory(nextState.memory, addr, 4, memRegister.storeValue);
    } else if (instruction.op === "sd") {
      writeMemory(nextState.memory, addr, 8, memRegister.storeValue);
    }

    nextState.pipeline.MEM_WB = memWb;
  }

  // EX Stage
  const exRegister = currentState.pipeline.ID_EX;
  if (exRegister?.instruction) {
    const instruction = exRegister.instruction;
    
    const fwdA = getForwardedValue(exRegister.rs1Val, currentState, instruction.rs1, "A");
    const fwdB = getForwardedValue(exRegister.rs2Val, currentState, instruction.rs2, "B");
    
    const operandA = fwdA.value;
    const operandB = fwdB.value;
    
    const exMem = {
      instruction: { ...instruction },
      aluResult: 0n,
      storeValue: operandB,
      rs2Val: operandB,
      signals: {
        ...exRegister.signals,
        ForwardA: fwdA.forwardedFrom !== null,
        ForwardB: fwdB.forwardedFrom !== null
      }
    };

    const pcBig = BigInt(exRegister.pc);

    switch (instruction.op) {
      case "add": exMem.aluResult = BigInt.asIntN(64, operandA + operandB); break;
      case "sub": exMem.aluResult = BigInt.asIntN(64, operandA - operandB); break;
      case "and": exMem.aluResult = BigInt.asIntN(64, operandA & operandB); break;
      case "or":  exMem.aluResult = BigInt.asIntN(64, operandA | operandB); break;
      case "xor": exMem.aluResult = BigInt.asIntN(64, operandA ^ operandB); break;
      case "sll": exMem.aluResult = BigInt.asIntN(64, operandA << (operandB & 63n)); break;
      case "srl": exMem.aluResult = BigInt.asIntN(64, BigInt.asUintN(64, operandA) >> (operandB & 63n)); break;
      case "sra": exMem.aluResult = BigInt.asIntN(64, operandA >> (operandB & 63n)); break;
      case "mul": exMem.aluResult = BigInt.asIntN(64, operandA * operandB); break;
      case "div": exMem.aluResult = operandB !== 0n ? BigInt.asIntN(64, operandA / operandB) : -1n; break;
      case "rem": exMem.aluResult = operandB !== 0n ? BigInt.asIntN(64, operandA % operandB) : operandA; break;
      
      case "addi": exMem.aluResult = BigInt.asIntN(64, operandA + BigInt(instruction.imm)); break;
      case "andi": exMem.aluResult = BigInt.asIntN(64, operandA & BigInt(instruction.imm)); break;
      case "ori":  exMem.aluResult = BigInt.asIntN(64, operandA | BigInt(instruction.imm)); break;
      case "xori": exMem.aluResult = BigInt.asIntN(64, operandA ^ BigInt(instruction.imm)); break;
      
      case "lui":   exMem.aluResult = BigInt.asIntN(64, BigInt(instruction.imm) << 12n); break;
      case "auipc": exMem.aluResult = BigInt.asIntN(64, pcBig + (BigInt(instruction.imm) << 12n)); break;
      case "la":    exMem.aluResult = BigInt(currentState.dataLabels[instruction.label] ?? 0); break;
      
      case "lw": case "ld":
      case "sw": case "sd":
        exMem.aluResult = BigInt.asIntN(64, operandA + BigInt(instruction.imm));
        break;
        
      case "beq":
        if (operandA === operandB) {
          branchTaken = true;
          branchTarget = Number(instruction.address) + Number(instruction.imm);
        }
        break;
      case "bne":
        if (operandA !== operandB) {
          branchTaken = true;
          branchTarget = Number(instruction.address) + Number(instruction.imm);
        }
        break;
      case "jal":
        exMem.aluResult = pcBig + 4n;
        branchTaken = true;
        branchTarget = Number(instruction.address) + Number(instruction.imm);
        break;
      case "jalr":
        exMem.aluResult = pcBig + 4n;
        branchTaken = true;
        branchTarget = Number(BigInt.asIntN(64, operandA + BigInt(instruction.imm)) & ~1n);
        break;
      default:
        break;
    }

    if (!isBranch(instruction.op) || instruction.op === "jal" || instruction.op === "jalr") {
      nextState.pipeline.EX_MEM = exMem;
    }
  }

  // ID Stage
  const idRegister = currentState.pipeline.IF_ID;
  if (branchTaken && currentState.options.enableBranchFlush) {
    nextState.pipeline.ID_EX = null;
    flush = true;
  } else if (idRegister?.instruction) {
    const instruction = idRegister.instruction;
    const pendingLoad = currentState.pipeline.ID_EX?.instruction;
    
    // Load-use stall detection
    if (pendingLoad && isLoad(pendingLoad.op) && pendingLoad.rd != null && pendingLoad.rd !== 0 && usesRegister(instruction, pendingLoad.rd)) {
      stall = true;
      nextState.pipeline.ID_EX = null;
      nextState.pipeline.IF_ID = clonePipelineRegister(currentState.pipeline.IF_ID);
    } else {
      nextState.pipeline.ID_EX = {
        instruction: { ...instruction },
        pc: idRegister.pc,
        rs1Val: instruction.rs1 != null ? nextState.registers[instruction.rs1] : 0n,
        rs2Val: instruction.rs2 != null ? nextState.registers[instruction.rs2] : 0n,
        signals: {
          RegWrite: writesRegister(instruction.op),
          MemRead: isLoad(instruction.op),
          MemWrite: isStore(instruction.op),
          Branch: isBranch(instruction.op),
          Stall: false,
          Flush: false,
        }
      };
    }
  }

  // IF Stage
  if (branchTaken) {
    if (currentState.options.enableBranchFlush) {
      nextState.pipeline.IF_ID = null;
      nextState.pc = branchTarget;
    } else {
      // If flush disabled, we update PC but let fetched instructions continue (they are wrong)
      nextState.pc = branchTarget;
      // Also fetch instruction at new PC? No, PC updates now, will fetch at new PC next cycle.
      const instruction = getInstructionAtPc(currentState, currentState.pc);
      if (instruction) {
        nextState.pipeline.IF_ID = { instruction: { ...instruction }, pc: currentState.pc };
        nextState.pc = currentState.pc + 4;
      } else {
        nextState.pipeline.IF_ID = null;
        nextState.pc = currentState.pc;
      }
    }
  } else if (stall) {
    nextState.pc = currentState.pc;
  } else {
    const instruction = getInstructionAtPc(currentState, currentState.pc);
    if (instruction) {
      nextState.pipeline.IF_ID = { instruction: { ...instruction }, pc: currentState.pc };
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
  nextState.history.push({
    cycle: nextState.cycle,
    pcBefore,
    pcAfter: nextState.pc,
    ifInstr: stall || (branchTaken && currentState.options.enableBranchFlush) ? "(empty)" : ifInstr,
    idInstr,
    exInstr,
    memInstr,
    wbInstr,
    stall,
    branchTaken,
    branchTarget,
    flush,
    wbWrite,
  });

  return nextState;
}
