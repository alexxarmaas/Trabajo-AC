import { loadProgram } from './cpu.js';
import { parseProgram } from './parser.js';

const code = `.data
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

try {
  const parsed = parseProgram(code);
  console.log("Parsed correctly", Object.keys(parsed));
  const cpu = loadProgram(parsed);
  console.log("CPU Loaded correctly", Object.keys(cpu));
} catch(e) {
  console.error("Error:", e);
}
