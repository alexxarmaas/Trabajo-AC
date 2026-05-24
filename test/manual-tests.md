# Pruebas Manuales - Simulador RISC-V RV64IM

Cada prueba indica: configuración de toggles, programa assembly, resultado esperado y qué observar en historial/señales.

---

## 1. Forwarding activado sin stall

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li t0, 10
li t1, 20
add t2, t0, t1
sub t3, t2, t0
and t4, t3, t1
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t2 | 30 |
| t3 | 20 |
| t4 | 20 |

**Observar:**
- Historial: ninguna fila con Stall = Sí.
- Panel de señales: `ForwardA = 1` cuando `sub` está en EX (t2 de `add` se anticipa desde EX/MEM).
- Evento: "Anticipación hacia operando A desde EX/MEM".

---

## 2. Forwarding desactivado con stalls RAW

**Configuración:** Forwarding ❌ | Flush ✅

```assembly
li t0, 5
add t1, t0, t0
sub t2, t1, t0
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t1 | 10 |
| t2 | 5 |

**Observar:**
- Historial: filas con Stall = Sí, stallReason = "RAW hazard without forwarding".
- `add` en ID/EX cuando `sub` entra en ID → stall porque t1 aún no ha sido escrito.
- Los valores finales son **idénticos** a los de con forwarding; solo aumentan los ciclos totales.

---

## 3. Load-use con exactamente 1 stall

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
.data
var1: .word 100
.text
la t0, var1
lw t1, 0(t0)
addi t2, t1, 50
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t1 | 100 |
| t2 | 150 |

**Observar:**
- En el ciclo donde `lw` está en EX, `addi` entra en ID → exactamente 1 stall (load-use hazard).
- Historial: exactamente 1 fila con Stall = Sí, stallReason = "load-use hazard".
- `Stall = 1` en el panel de señales en ese ciclo.

---

## 4. Store con dependencia de instrucción ALU previa

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
.data
out: .dword 0
.text
la t0, out
li t1, 40
addi t1, t1, 2
sd t1, 0(t0)
ld t2, 0(t0)
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t1 | 42 |
| t2 | 42 |

**Observar:**
- `sd` necesita el valor de `t1` calculado por `addi`. Con forwarding, `ForwardB = 1` (storeValue anticipado desde EX/MEM).
- No hay stall si `sd` no sigue inmediatamente a un `lw`/`ld`.
- En la tabla de memoria: 8 bytes escritos en la dirección base (out).

---

## 5. Store con dependencia de load

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
.data
a: .dword 123
b: .dword 0
.text
la t0, a
la t1, b
ld t2, 0(t0)
sd t2, 0(t1)
ld t3, 0(t1)
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t2 | 123 |
| t3 | 123 |

**Observar:**
- `sd t2` sigue inmediatamente a `ld t2` → load-use hazard, 1 stall.
- Historial: Stall = Sí, stallReason = "load-use hazard".
- Tras el stall, `sd` escribe 123 en la dirección de `b`. `ld t3` lo lee correctamente.

---

## 6. Branch tomado con flush

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li t0, 5
li t1, 5
beq t0, t1, jump
addi t2, zero, 999
jump:
addi t3, zero, 1
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t2 | 0 (instrucción descartada) |
| t3 | 1 |

**Observar:**
- branchTaken = Sí, flush = Sí en el historial.
- `addi t2` se vacía del pipeline. t2 permanece 0.
- Evento: "Salto condicional →  [dirección de jump]".

---

## 7. Branch no tomado

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li t0, 5
li t1, 6
beq t0, t1, jump
addi t2, zero, 9
jump:
addi t3, zero, 1
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t2 | 9 |
| t3 | 1 |

**Observar:**
- branchTaken = No en el historial, flush = No.
- `addi t2` se ejecuta normalmente.
- No hay burbujas de control.

---

## 8. jal

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li a0, 42
jal ra, func
addi a1, zero, 99
func:
add a2, a0, a0
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| a1 | 0 (descartado) |
| a2 | 84 |
| ra | PC+4 del jal (dirección de retorno) |

**Observar:**
- jumpTaken = Sí en historial, flush = Sí.
- `addi a1` se descarta. a1 permanece 0.
- `ra` (x1) recibe el valor de PC+4 en WB.
- Evento: "Salto incondicional → [dirección de func]".

---

## 9. jalr

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li t0, 16
jalr ra, 0(t0)
addi t1, zero, 99
nop
addi t2, zero, 7
addi t3, zero, 8
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| ra | 8 (PC+4 del jalr, que está en posición 4) |
| t1 | 0 (descartado por flush) |
| t2 | 7 |
| t3 | 8 |

**Observar:**
- jalr salta a (t0 + 0) & ~1 = 16 → captura `addi t2, zero, 7` (instrucción en posición 16).
- `addi t1` se descarta por flush.
- jumpTaken = Sí, flush = Sí en historial.

---

## 10. mul/div/rem

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li t0, 25
li t1, 4
mul t2, t0, t1
div t3, t0, t1
rem t4, t0, t1
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t2 | 100 |
| t3 | 6 |
| t4 | 1 |

**Observar:**
- RegWrite = 1 para mul/div/rem.
- MemRead = 0, MemWrite = 0 (no acceden a memoria).
- Sin stalls si no hay dependencias directas con las instrucciones anteriores.

---

## 11. ld/sd con .dword y signo de 64 bits

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
.data
val: .dword 0xFFEEDDCCBBAA9988
.text
la t0, val
ld t1, 0(t0)
addi t2, t1, 1
sd t2, 8(t0)
ld t3, 8(t0)
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| t1 | -4822678189205112 (0xFFEEDDCCBBAA9988 con signo) |
| t2 | t1 + 1 |
| t3 | igual que t2 |

**Observar:**
- `ld` aplica `BigInt.asIntN(64, ...)`: valores negativos se muestran con signo.
- Hay 1 load-use stall entre `ld t1` y `addi t2`.
- `sd` escribe 8 bytes. La tabla de memoria muestra 8 filas (bytes) en la dirección base+8.
- `ld t3` lee esos 8 bytes correctamente.

---

## 12. x0 inmutable

**Configuración:** Forwarding ✅ | Flush ✅

```assembly
li x0, 123
addi zero, zero, 5
add t0, zero, zero
```

**Resultado esperado:**

| Registro | Valor |
|---|---|
| x0/zero | 0 (siempre) |
| t0 | 0 |

**Observar:**
- Aunque `li x0, 123` intenta escribir en x0, el simulador fuerza `x0 = 0n` en cada ciclo WB.
- La tabla de registros muestra siempre `x0 (zero) = 0`.
- `t0` = 0 porque suma cero + cero.
