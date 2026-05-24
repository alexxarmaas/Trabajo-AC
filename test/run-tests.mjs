import { loadProgram, stepCPU } from '../cpu.js';
import { parseProgram } from '../parser.js';

function runToEnd(code, opts = {}) {
  const parsed = parseProgram(code);
  let cpu = loadProgram(parsed, opts);
  let limit = 200;
  while (!cpu.halted && limit-- > 0) {
    cpu = stepCPU(cpu);
  }
  return cpu;
}

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${actual} (expected ${expected})`);
  ok ? pass++ : fail++;
}

// Test 1: basic forwarding (t2=30, t3=20)
{
  const cpu = runToEnd(`li t0, 10\nli t1, 20\nadd t2, t0, t1\nsub t3, t2, t0`);
  check('t2 = 30', cpu.registers[7].toString(), '30');  // t2 = x7
  check('t3 = 20', cpu.registers[28].toString(), '20'); // t3 = x28
}

// Test 2: RAW stall without forwarding
{
  const cpu = runToEnd(`li t0, 5\nadd t1, t0, t0\nsub t2, t1, t0`, { enableForwarding: false });
  check('t1 = 10 (no fwd)', cpu.registers[6].toString(), '10');  // t1 = x6
  check('t2 = 5  (no fwd)', cpu.registers[7].toString(), '5');   // t2 = x7
  const hasRaw = cpu.history.some(h => h.stallReason === 'RAW hazard without forwarding');
  check('RAW stall detected', String(hasRaw), 'true');
}

// Test 3: load-use stall
{
  const cpu = runToEnd(`.data\nv: .word 50\n.text\nla t0, v\nlw t1, 0(t0)\naddi t2, t1, 10`);
  check('t1 = 50', cpu.registers[6].toString(), '50');
  check('t2 = 60', cpu.registers[7].toString(), '60');
  const hasLU = cpu.history.some(h => h.stallReason === 'load-use hazard');
  check('load-use stall detected', String(hasLU), 'true');
}

// Test 4: mul/div/rem
{
  const cpu = runToEnd(`li t0, 25\nli t1, 4\nmul t2, t0, t1\ndiv t3, t0, t1\nrem t4, t0, t1`);
  check('mul 25*4=100', cpu.registers[7].toString(), '100');
  check('div 25/4=6',   cpu.registers[28].toString(), '6');
  check('rem 25%4=1',   cpu.registers[29].toString(), '1');
}

// Test 5: branch taken flush
{
  const cpu = runToEnd(`li t0, 1\nli t1, 1\nbeq t0, t1, fin\nli t2, 999\nfin:\nadd t3, t0, t1`);
  check('t2 = 0 (flushed)', cpu.registers[7].toString(), '0');
  check('t3 = 2', cpu.registers[28].toString(), '2');
}

// Test 6: branch not taken
{
  const cpu = runToEnd(`li t0, 3\nli t1, 7\nbeq t0, t1, fin\nli t2, 42\nfin:\nadd t3, t0, t1`);
  check('t2 = 42 (not taken)', cpu.registers[7].toString(), '42');
  check('t3 = 10', cpu.registers[28].toString(), '10');
}

// Test 7: x0 always 0
{
  const cpu = runToEnd(`addi x0, zero, 42\nadd t0, x0, zero`);
  check('x0 = 0', cpu.registers[0].toString(), '0');
  check('t0 = 0 (from x0)', cpu.registers[5].toString(), '0');
}

// Test 8: ld sign extension (0xFFFFFFFFFFFFFF00 = -256)
{
  const cpu = runToEnd(`.data\nv: .dword 0xFFFFFFFFFFFFFF00\n.text\nla t0, v\nld t1, 0(t0)`);
  // t1 = x6
  check('ld signed 64', cpu.registers[6].toString(), '-256');
}

// Test 9: x0 immutable
{
  const cpu = runToEnd(`addi x0, x0, 42\nadd t0, x0, x0`);
  check('x0 always 0', cpu.registers[0].toString(), '0');
  check('t0 = 0 from x0', cpu.registers[5].toString(), '0');
}

console.log(`\n${pass} passed, ${fail} failed`);
