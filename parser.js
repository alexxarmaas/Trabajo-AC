const REGISTER_ALIASES = {
  zero: 0, ra: 1, sp: 2, gp: 3, tp: 4, t0: 5, t1: 6, t2: 7,
  s0: 8, fp: 8, s1: 9, a0: 10, a1: 11, a2: 12, a3: 13, a4: 14,
  a5: 15, a6: 16, a7: 17, s2: 18, s3: 19, s4: 20, s5: 21,
  s6: 22, s7: 23, s8: 24, s9: 25, s10: 26, s11: 27, t3: 28,
  t4: 29, t5: 30, t6: 31,
};

const DATA_BASE_ADDRESS = 1000;

function normalizeLine(line) {
  return line.split("#")[0].trim();
}

function parseRegister(token) {
  if (!token) throw new Error("Missing register operand");
  const clean = token.trim().toLowerCase();
  if (/^x([0-9]|[12][0-9]|3[01])$/.test(clean)) {
    return Number(clean.slice(1));
  }
  if (clean in REGISTER_ALIASES) {
    return REGISTER_ALIASES[clean];
  }
  throw new Error(`Unknown register: ${token}`);
}

function parseImmediate(token) {
  if (!token) throw new Error("Missing immediate operand");
  const value = token.trim().toLowerCase();
  if (value.startsWith("0x")) {
    return BigInt(value);
  }
  return BigInt(value);
}

function parseOffsetAddress(operand) {
  if (!operand) throw new Error("Missing memory operand");
  const match = operand.trim().match(/^(-?(?:0x[0-9a-f]+|\d+))\(([^)]+)\)$/i);
  if (!match) {
    throw new Error(`Invalid memory operand: ${operand}`);
  }
  return {
    imm: parseImmediate(match[1]),
    rs1: parseRegister(match[2]),
  };
}

function parseWordValues(valueText) {
  return valueText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseImmediate(item));
}

export function getRegisterName(index) {
  const aliases = [
    "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2",
    "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
    "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7",
    "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6",
  ];
  return `x${index} (${aliases[index]})`;
}

export function parseProgram(source) {
  const lines = source.split(/\r?\n/);
  const textLabels = new Map();
  const dataLabels = {};
  const dataMemory = {};
  const cleanedLines = [];

  let currentSection = "text";
  let textAddress = 0;
  let dataAddress = DATA_BASE_ADDRESS;

  for (const line of lines) {
    const normalized = normalizeLine(line);
    if (!normalized) continue;

    if (normalized === ".data") {
      currentSection = "data";
      continue;
    }

    if (normalized === ".text") {
      currentSection = "text";
      continue;
    }

    if (currentSection === "data") {
      const [labelPart, ...rest] = normalized.split(":");
      if (!rest.length) {
        throw new Error(`Data declaration requires a label: ${normalized}`);
      }

      const label = labelPart.trim();
      const declaration = rest.join(":").trim();
      dataLabels[label] = dataAddress;

      if (declaration.startsWith(".word")) {
        const values = parseWordValues(declaration.slice(".word".length).trim());
        for (const value of values) {
          let v = value;
          for (let i = 0; i < 4; i++) {
            dataMemory[dataAddress++] = Number(v & 0xFFn);
            v >>= 8n;
          }
        }
      } else if (declaration.startsWith(".dword")) {
        const values = parseWordValues(declaration.slice(".dword".length).trim());
        for (const value of values) {
          let v = value;
          for (let i = 0; i < 8; i++) {
            dataMemory[dataAddress++] = Number(v & 0xFFn);
            v >>= 8n;
          }
        }
      } else {
        throw new Error(`Unsupported data directive: ${declaration}`);
      }
      continue;
    }

    if (normalized.includes(":")) {
      const [labelPart, ...rest] = normalized.split(":");
      const label = labelPart.trim();
      textLabels.set(label, textAddress);
      const remainder = rest.join(":").trim();
      if (remainder) {
        cleanedLines.push({ raw: remainder, address: textAddress });
        textAddress += 4;
      }
      continue;
    }

    cleanedLines.push({ raw: normalized, address: textAddress });
    textAddress += 4;
  }

  const program = cleanedLines.map(({ raw, address: instructionAddress }) => {
    const [opToken, ...operandTokens] = raw.split(/\s+/);
    const op = opToken.toLowerCase();
    const operands = operandTokens.join(" ").split(",").map((item) => item.trim()).filter(Boolean);

    // Helper to validate arg count
    const assertArgs = (count) => {
      if (operands.length !== count) throw new Error(`Instruction ${op} expects ${count} operands, got ${operands.length}`);
    };

    switch (op) {
      // R-type (RV64I + M)
      case "add": case "sub": case "and": case "or": case "xor":
      case "sll": case "srl": case "sra":
      case "mul": case "div": case "rem":
        assertArgs(3);
        return {
          type: "R", op,
          rd: parseRegister(operands[0]),
          rs1: parseRegister(operands[1]),
          rs2: parseRegister(operands[2]),
          imm: null,
          address: instructionAddress,
          raw,
        };

      // I-type ALU
      case "addi": case "andi": case "ori": case "xori":
        assertArgs(3);
        return {
          type: "I", op,
          rd: parseRegister(operands[0]),
          rs1: parseRegister(operands[1]),
          rs2: null,
          imm: parseImmediate(operands[2]),
          address: instructionAddress,
          raw,
        };

      // I-type Loads
      case "lw": case "ld": {
        assertArgs(2);
        const { imm, rs1 } = parseOffsetAddress(operands[1]);
        return {
          type: "I", op,
          rd: parseRegister(operands[0]),
          rs1, rs2: null, imm,
          address: instructionAddress,
          raw,
        };
      }

      // S-type Stores
      case "sw": case "sd": {
        assertArgs(2);
        const { imm, rs1 } = parseOffsetAddress(operands[1]);
        return {
          type: "S", op,
          rd: null, rs1,
          rs2: parseRegister(operands[0]),
          imm,
          address: instructionAddress,
          raw,
        };
      }

      // B-type Branches
      case "beq": case "bne": {
        assertArgs(3);
        const label = operands[2];
        if (!textLabels.has(label)) throw new Error(`Unknown label: ${label}`);
        return {
          type: "B", op,
          rd: null,
          rs1: parseRegister(operands[0]),
          rs2: parseRegister(operands[1]),
          imm: BigInt(textLabels.get(label) - instructionAddress),
          address: instructionAddress,
          raw,
        };
      }

      // U-type
      case "lui": case "auipc":
        assertArgs(2);
        return {
          type: "U", op,
          rd: parseRegister(operands[0]),
          rs1: null, rs2: null,
          imm: parseImmediate(operands[1]),
          address: instructionAddress,
          raw,
        };

      // J-type
      case "jal": {
        assertArgs(2);
        const label = operands[1];
        if (!textLabels.has(label)) throw new Error(`Unknown label: ${label}`);
        return {
          type: "J", op,
          rd: parseRegister(operands[0]),
          rs1: null, rs2: null,
          imm: BigInt(textLabels.get(label) - instructionAddress),
          address: instructionAddress,
          raw,
        };
      }

      // I-type Jump
      case "jalr": {
        // Can be jalr rd, imm(rs1) OR jalr rd, rs1, imm
        if (operands.length === 2) {
          const { imm, rs1 } = parseOffsetAddress(operands[1]);
          return { type: "I", op, rd: parseRegister(operands[0]), rs1, rs2: null, imm, address: instructionAddress, raw };
        } else {
          assertArgs(3);
          return { type: "I", op, rd: parseRegister(operands[0]), rs1: parseRegister(operands[1]), rs2: null, imm: parseImmediate(operands[2]), address: instructionAddress, raw };
        }
      }

      // Pseudos
      case "li":
        assertArgs(2);
        return {
          type: "PSEUDO", op: "addi",
          rd: parseRegister(operands[0]),
          rs1: 0, rs2: null,
          imm: parseImmediate(operands[1]),
          address: instructionAddress,
          raw,
        };
      case "la": {
        assertArgs(2);
        const label = operands[1];
        if (!(label in dataLabels)) throw new Error(`Unknown data label: ${label}`);
        return {
          type: "PSEUDO", op: "la",
          rd: parseRegister(operands[0]),
          rs1: null, rs2: null, imm: null, label,
          address: instructionAddress,
          raw,
        };
      }
      case "nop":
        assertArgs(0);
        return {
          type: "PSEUDO", op: "addi",
          rd: 0, rs1: 0, rs2: null, imm: 0n,
          address: instructionAddress,
          raw,
        };

      default:
        throw new Error(`Unsupported instruction: ${op}`);
    }
  });

  return {
    program,
    dataLabels,
    dataMemory,
  };
}
