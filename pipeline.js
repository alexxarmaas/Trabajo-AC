// ============================================================
// pipeline.js  –  Lógica de segmentación RISC-V de 5 etapas
// Soporta: forwarding EX/MEM y MEM/WB, load-use stall,
// RAW stall sin forwarding, control hazards (beq/bne/jal/jalr)
// con flush opcional, señales de control completas y
// registro de historial por ciclo.
// ============================================================

function clonePipelineRegister(reg) {
  if (!reg) return null;
  return {
    ...reg,
    instruction: reg.instruction ? { ...reg.instruction } : null,
    signals: reg.signals ? { ...reg.signals } : null,
  };
}

function cloneState(state) {
  return {
    pc: state.pc,
    cycle: state.cycle,
    program: state.program.map((i) => ({ ...i })),
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
    history: state.history.map((e) => ({ ...e })),
    halted: state.halted,
    options: { ...state.options },
  };
}

// ── Clasificadores de instrucción ──────────────────────────
function writesRegister(op) {
  return [
    "add","sub","and","or","xor","sll","srl","sra",
    "mul","div","rem",
    "addi","andi","ori","xori",
    "lw","ld","la","lui","auipc","jal","jalr",
  ].includes(op);
}

function isLoad(op)   { return op === "lw" || op === "ld"; }
function isStore(op)  { return op === "sw" || op === "sd"; }
function isJump(op)   { return op === "jal" || op === "jalr"; }
function isBranchOp(op) { return op === "beq" || op === "bne"; }
function isControl(op) { return isBranchOp(op) || isJump(op); }

// ── Valor de write-back ────────────────────────────────────
function getWriteBackValue(reg) {
  if (!reg) return 0n;
  return isLoad(reg.instruction?.op) ? (reg.memData ?? 0n) : (reg.aluResult ?? 0n);
}

// ── Forwarding ─────────────────────────────────────────────
// Devuelve { value: BigInt, forwardedFrom: null|"EX/MEM"|"MEM/WB" }
function getForwardedValue(sourceVal, state, regIdx) {
  if (!state.options.enableForwarding || regIdx == null || regIdx === 0) {
    return { value: sourceVal, forwardedFrom: null };
  }

  const exMem = state.pipeline.EX_MEM;
  if (
    exMem?.instruction &&
    writesRegister(exMem.instruction.op) &&
    !isLoad(exMem.instruction.op) &&
    exMem.instruction.rd === regIdx
  ) {
    return { value: exMem.aluResult, forwardedFrom: "EX/MEM" };
  }

  const memWb = state.pipeline.MEM_WB;
  if (
    memWb?.instruction &&
    writesRegister(memWb.instruction.op) &&
    memWb.instruction.rd === regIdx
  ) {
    return { value: getWriteBackValue(memWb), forwardedFrom: "MEM/WB" };
  }

  return { value: sourceVal, forwardedFrom: null };
}

// ── Detección de uso de registro ───────────────────────────
function usesRegister(instr, regIdx) {
  if (!instr || regIdx == null || regIdx === 0) return false;
  switch (instr.type) {
    case "R": case "B": case "S":
      return instr.rs1 === regIdx || instr.rs2 === regIdx;
    case "I":
      return instr.rs1 === regIdx;
    default: return false;
  }
}

// ── Detección de RAW genérico (sin forwarding) ─────────────
// Retorna true si la instrucción de ID necesita un registro
// que todavía no ha sido escrito en WB por alguna instrucción
// anterior en el pipeline.
// NOTA: MEM/WB no bloquea porque WB escribe antes de la
// lectura de registros en ID dentro del modelo de ciclo usado.
// Solo ID/EX y EX/MEM pueden causar stall RAW sin forwarding.
function hasRawHazardNoForwarding(instrInId, state) {
  if (!instrInId) return false;

  const pending = [
    state.pipeline.ID_EX,
    state.pipeline.EX_MEM,
    // MEM/WB excluido: WB escribe en next.registers antes de que ID lea
  ];

  for (const stage of pending) {
    if (
      stage?.instruction &&
      writesRegister(stage.instruction.op) &&
      stage.instruction.rd != null &&
      stage.instruction.rd !== 0 &&
      usesRegister(instrInId, stage.instruction.rd)
    ) {
      return true;
    }
  }
  return false;
}

// ── Acceso a memoria byte a byte ───────────────────────────
function readMemory(memory, address, size) {
  let val = 0n;
  for (let i = 0; i < size; i++) {
    val |= BigInt(memory[address + i] ?? 0) << BigInt(i * 8);
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
  return (val & 0x80000000n) ? (val | 0xFFFFFFFF00000000n) : val;
}

function formatInstr(instr) { return instr?.raw ?? "(empty)"; }
function getInstrAtPc(state, pc) { return state.instructionMemory[pc] ?? null; }

// ══════════════════════════════════════════════════════════
// stepPipeline  –  avanza un ciclo de reloj
// ══════════════════════════════════════════════════════════
export function stepPipeline(currentState) {
  const next = cloneState(currentState);
  const pcBefore = currentState.pc;

  // Captura de texto de instrucciones actuales (para historial)
  const ifInstr  = formatInstr(getInstrAtPc(currentState, currentState.pc));
  const idInstr  = formatInstr(currentState.pipeline.IF_ID?.instruction);
  const exInstr  = formatInstr(currentState.pipeline.ID_EX?.instruction);
  const memInstr = formatInstr(currentState.pipeline.EX_MEM?.instruction);
  const wbInstr  = formatInstr(currentState.pipeline.MEM_WB?.instruction);

  next.cycle += 1;

  // Variables de evento del ciclo
  let stall       = false;
  let stallReason = null;
  let branchTaken = false;
  let jumpTaken   = false;
  let branchTarget = null;
  let flush       = false;
  let wbWrite     = null;
  let forwardA    = null;   // "EX/MEM" | "MEM/WB" | null
  let forwardB    = null;

  // Limpia registros del pipeline (se reasignan abajo)
  next.pipeline.IF_ID  = null;
  next.pipeline.ID_EX  = null;
  next.pipeline.EX_MEM = null;
  next.pipeline.MEM_WB = null;

  // ── WB Stage ──────────────────────────────────────────
  const wbReg = currentState.pipeline.MEM_WB;
  if (wbReg?.instruction && writesRegister(wbReg.instruction.op)) {
    const rd = wbReg.instruction.rd;
    if (rd != null && rd !== 0) {
      const val = getWriteBackValue(wbReg);
      next.registers[rd] = val;
      wbWrite = `x${rd} = ${val}`;
    }
  }
  next.registers[0] = 0n; // x0 siempre 0

  // ── MEM Stage ─────────────────────────────────────────
  const memReg = currentState.pipeline.EX_MEM;
  if (memReg?.instruction) {
    const instr = memReg.instruction;
    const memWb = { ...memReg, instruction: { ...instr }, signals: { ...memReg.signals } };
    const addr  = Number(memReg.aluResult);

    if (instr.op === "lw") {
      // Carga 32 bits con extensión de signo a 64 bits
      memWb.memData = signExtend32(readMemory(currentState.memory, addr, 4));
    } else if (instr.op === "ld") {
      // Carga 64 bits con interpretación de signo
      memWb.memData = BigInt.asIntN(64, readMemory(currentState.memory, addr, 8));
    } else if (instr.op === "sw") {
      writeMemory(next.memory, addr, 4, memReg.storeValue);
    } else if (instr.op === "sd") {
      writeMemory(next.memory, addr, 8, memReg.storeValue);
    }

    next.pipeline.MEM_WB = memWb;
  }

  // ── EX Stage ──────────────────────────────────────────
  const exReg = currentState.pipeline.ID_EX;
  if (exReg?.instruction) {
    const instr = exReg.instruction;

    const fwdA = getForwardedValue(exReg.rs1Val, currentState, instr.rs1);
    const fwdB = getForwardedValue(exReg.rs2Val, currentState, instr.rs2);
    forwardA   = fwdA.forwardedFrom;
    forwardB   = fwdB.forwardedFrom;

    const opA = fwdA.value;
    const opB = fwdB.value;

    const exMem = {
      instruction: { ...instr },
      aluResult:   0n,
      storeValue:  opB,   // para sw/sd: dato a escribir (puede forwardearse)
      rs2Val:      opB,
      signals: {
        ...exReg.signals,
        ForwardA: forwardA !== null,
        ForwardB: forwardB !== null,
      },
    };

    const pcBig = BigInt(exReg.pc ?? 0);
    const immBig = instr.imm != null ? BigInt(instr.imm) : 0n;

    switch (instr.op) {
      // Aritmético-lógicas R-type
      case "add":  exMem.aluResult = BigInt.asIntN(64, opA + opB); break;
      case "sub":  exMem.aluResult = BigInt.asIntN(64, opA - opB); break;
      case "and":  exMem.aluResult = BigInt.asIntN(64, opA & opB); break;
      case "or":   exMem.aluResult = BigInt.asIntN(64, opA | opB); break;
      case "xor":  exMem.aluResult = BigInt.asIntN(64, opA ^ opB); break;
      case "sll":  exMem.aluResult = BigInt.asIntN(64, opA << (opB & 63n)); break;
      case "srl":  exMem.aluResult = BigInt.asIntN(64, BigInt.asUintN(64, opA) >> (opB & 63n)); break;
      case "sra":  exMem.aluResult = BigInt.asIntN(64, opA >> (opB & 63n)); break;
      // Extensión M
      case "mul":  exMem.aluResult = BigInt.asIntN(64, opA * opB); break;
      case "div":  exMem.aluResult = opB !== 0n ? BigInt.asIntN(64, opA / opB) : -1n; break;
      case "rem":  exMem.aluResult = opB !== 0n ? BigInt.asIntN(64, opA % opB) : opA; break;
      // I-type ALU
      case "addi": exMem.aluResult = BigInt.asIntN(64, opA + immBig); break;
      case "andi": exMem.aluResult = BigInt.asIntN(64, opA & immBig); break;
      case "ori":  exMem.aluResult = BigInt.asIntN(64, opA | immBig); break;
      case "xori": exMem.aluResult = BigInt.asIntN(64, opA ^ immBig); break;
      // U-type
      case "lui":   exMem.aluResult = BigInt.asIntN(64, immBig << 12n); break;
      case "auipc": exMem.aluResult = BigInt.asIntN(64, pcBig + (immBig << 12n)); break;
      // Pseudo: la (load address)
      case "la":    exMem.aluResult = BigInt(currentState.dataLabels[instr.label] ?? 0); break;
      // Acceso a memoria: calcula dirección
      case "lw": case "ld":
      case "sw": case "sd":
        exMem.aluResult = BigInt.asIntN(64, opA + immBig);
        break;
      // Saltos condicionales
      case "beq":
        if (opA === opB) { branchTaken = true; branchTarget = Number(instr.address) + Number(immBig); }
        break;
      case "bne":
        if (opA !== opB) { branchTaken = true; branchTarget = Number(instr.address) + Number(immBig); }
        break;
      // Saltos incondicionales
      case "jal":
        exMem.aluResult = pcBig + 4n;       // rd = PC+4
        branchTaken = true;
        jumpTaken   = true;
        branchTarget = Number(instr.address) + Number(immBig);
        break;
      case "jalr":
        exMem.aluResult = pcBig + 4n;       // rd = PC+4
        branchTaken = true;
        jumpTaken   = true;
        branchTarget = Number(BigInt.asIntN(64, opA + immBig) & ~1n);
        break;
      default: break;
    }

    // beq/bne no pasan a EX_MEM (no escriben rd ni acceden a memoria)
    if (!isBranchOp(instr.op)) {
      next.pipeline.EX_MEM = exMem;
    }
  }

  // ── ID Stage ──────────────────────────────────────────
  const idReg = currentState.pipeline.IF_ID;

  if (branchTaken && currentState.options.enableBranchFlush) {
    // Descarta lo que ya entró en IF e ID por el camino incorrecto
    next.pipeline.ID_EX = null;
    flush = true;
  } else if (idReg?.instruction) {
    const instr      = idReg.instruction;
    const pendingLD  = currentState.pipeline.ID_EX?.instruction;

    // 1. Load-use hazard (necesario incluso con forwarding)
    const loadUseHazard =
      pendingLD && isLoad(pendingLD.op) &&
      pendingLD.rd != null && pendingLD.rd !== 0 &&
      usesRegister(instr, pendingLD.rd);

    // 2. RAW hazard general cuando forwarding está desactivado
    const rawHazard =
      !currentState.options.enableForwarding &&
      hasRawHazardNoForwarding(instr, currentState);

    if (loadUseHazard) {
      stall       = true;
      stallReason = "load-use hazard";
      next.pipeline.ID_EX = null;
      next.pipeline.IF_ID = clonePipelineRegister(currentState.pipeline.IF_ID);
    } else if (rawHazard) {
      stall       = true;
      stallReason = "RAW hazard without forwarding";
      next.pipeline.ID_EX = null;
      next.pipeline.IF_ID = clonePipelineRegister(currentState.pipeline.IF_ID);
    } else {
      next.pipeline.ID_EX = {
        instruction: { ...instr },
        pc:     idReg.pc,
        rs1Val: instr.rs1 != null ? next.registers[instr.rs1] : 0n,
        rs2Val: instr.rs2 != null ? next.registers[instr.rs2] : 0n,
        signals: {
          RegWrite:   writesRegister(instr.op),
          MemRead:    isLoad(instr.op),
          MemWrite:   isStore(instr.op),
          MemToReg:   isLoad(instr.op),
          Branch:     isBranchOp(instr.op),
          Jump:       isJump(instr.op),
          Stall:      false,
          Flush:      false,
          ForwardA:   false,
          ForwardB:   false,
        },
      };
    }
  }

  // ── IF Stage ──────────────────────────────────────────
  if (branchTaken) {
    // El salto SIEMPRE actualiza el PC al destino
    next.pc = branchTarget;

    if (currentState.options.enableBranchFlush) {
      // Flush: descarta instrucción ya capturada
      next.pipeline.IF_ID = null;
    } else {
      // Sin flush: el PC cambia pero la instrucción equivocada
      // sigue en IF_ID (el estudiante puede ver el efecto).
      // Nota: en el siguiente ciclo IF cargará desde branchTarget.
      const wrongInstr = getInstrAtPc(currentState, currentState.pc);
      next.pipeline.IF_ID = wrongInstr
        ? { instruction: { ...wrongInstr }, pc: currentState.pc }
        : null;
    }
  } else if (stall) {
    // Congela PC e IF/ID
    next.pc = currentState.pc;
    // IF_ID ya fue preservado en la sección ID si es stall
  } else {
    // Flujo normal: captura la instrucción en PC actual
    const instr = getInstrAtPc(currentState, currentState.pc);
    if (instr) {
      next.pipeline.IF_ID = { instruction: { ...instr }, pc: currentState.pc };
      next.pc = currentState.pc + 4;
    } else {
      next.pipeline.IF_ID = null;
      next.pc = currentState.pc;
    }
  }

  // ── Halted ────────────────────────────────────────────
  const pipelineEmpty =
    !next.pipeline.IF_ID && !next.pipeline.ID_EX &&
    !next.pipeline.EX_MEM && !next.pipeline.MEM_WB;
  next.halted = pipelineEmpty && getInstrAtPc(next, next.pc) == null;

  // ── Historial del ciclo ───────────────────────────────
  next.history.push({
    cycle: next.cycle,
    pcBefore,
    pcAfter: next.pc,
    ifInstr: (stall || (branchTaken && currentState.options.enableBranchFlush))
      ? "(empty)" : ifInstr,
    idInstr,
    exInstr,
    memInstr,
    wbInstr,
    stall,
    stallReason,
    branchTaken,
    jumpTaken,
    branchTarget,
    flush,
    wbWrite,
    forwardA,
    forwardB,
  });

  return next;
}
