# Unidad 4: Riesgos de Control y Flush

## 1. Introducción

Cuando el procesador ejecuta una instrucción de salto condicional (`beq`, `bne`) o incondicional (`jal`, `jalr`), no sabe hasta la etapa **EX** si el salto se toma y a qué dirección. Mientras tanto, el pipeline ya ha capturado (IF) y decodificado (ID) instrucciones del camino secuencial, que pueden ser incorrectas si el salto se toma.

La estrategia implementada en este simulador es **asumir "salto no tomado"** y, cuando se descubre en EX que el salto sí se toma, **vaciar (flush)** las instrucciones erróneas de las etapas IF e ID. Esto genera una **penalización de 2 ciclos** (2 burbujas).

---

## 2. Objetivos operativos

1. Explicar por qué los saltos generan un riesgo de control en un pipeline de 5 etapas.
2. Identificar qué instrucciones se descartan tras un flush.
3. Comparar el comportamiento del pipeline con flush activado y desactivado.
4. Calcular la penalización en ciclos por salto tomado.
5. Distinguir saltos condicionales (beq/bne) de incondicionales (jal/jalr).
6. Verificar que las instrucciones del camino correcto se ejecutan con valores correctos.

---

## 3. Código de partida

### Variante A: Branch tomado (beq)

```assembly
li  t0, 5
li  t1, 5
beq t0, t1, igual     # se toma porque t0 == t1
addi t2, zero, 999    # ← camino incorrecto, debe descartarse
igual:
addi t3, t0, t1       # ← camino correcto: t3 = 10
```

### Variante B: Branch no tomado (bne)

```assembly
li  t0, 3
li  t1, 7
bne t0, t1, distinto  # se toma porque t0 != t1
addi t2, zero, 111    # ← camino incorrecto
distinto:
addi t3, t0, t1       # t3 = 10
```

### Variante C: Salto incondicional (jal)

```assembly
li   a0, 42
jal  ra, func         # salta a func, guarda PC+4 en ra
addi a1, zero, 99     # ← camino incorrecto
func:
add  a2, a0, a0       # a2 = 84
```

---

## 4. Configuración del simulador

### Parte A – Con flush

| Parámetro | Valor |
|---|---|
| Forwarding | Activado |
| Flush | **Activado** |
| Escenario | *RV64I: Control Hazard – Branch Flush* |

### Parte B – Sin flush

| Parámetro | Valor |
|---|---|
| Forwarding | Activado |
| Flush | **Desactivado** |

> Con flush desactivado las instrucciones erróneas permanecen en el pipeline y pueden corromper registros. Esto ilustra por qué el flush es imprescindible.

---

## 5. Pasos de interacción con el simulador

### Variante A con flush

1. Carga el programa. Activa Flush.
2. Avanza hasta el ciclo en que `beq` está en EX (ciclo ≈ 4).
3. Observa el panel **Eventos**: aparece "Salto condicional → [dirección]".
4. Observa las tarjetas: IF/ID muestra "Vaciado". ID/EX también se vacía.
5. En el ciclo siguiente, IF captura `addi t3` desde la dirección de destino.
6. Verifica al final: **t2 = 0** (la instrucción del camino incorrecto nunca escribió t2) y **t3 = 10**.

### Variante A sin flush

1. Recarga con Flush **desactivado**.
2. Avanza ciclo a ciclo. Observa que `addi t2, zero, 999` **no** se descarta.
3. Al final: **t2 = 999** (incorrecto). El simulador no garantiza resultados correctos sin flush.

### Variante C (jal)

1. Carga la Variante C. Activa Flush.
2. Avanza hasta que `jal` está en EX.
3. Observa en **Registros** que `ra` (x1) recibe el valor de PC+4 (dirección de retorno).
4. `addi a1` se descarta (flush). `add a2` se ejecuta correctamente.
5. Al final: a0 = 42, ra = PC de retorno, a2 = 84, a1 = 0.

---

## 6. Qué debe observar el estudiante

### Con flush activado (Variante A)

| Ciclo | IF | ID | EX | MEM | WB | Evento |
|---|---|---|---|---|---|---|
| 3 | addi t2 | beq | li t1 | li t0 | – | beq en EX |
| 4 | (vacío) | (vacío) | beq | li t1 | li t0 | **Flush: salto tomado** |
| 5 | addi t3 | (vacío) | (vacío) | beq | li t1 | Captura desde destino |
| 7 | – | – | addi t3 | – | – | Instrucción correcta en EX |

### Con flush desactivado

Las instrucciones del camino incorrecto permanecen y escriben registros con valores erróneos.

### Penalización

Con beq/bne tomado: **2 ciclos** de penalización (IF e ID se vacían).  
Con jal/jalr: **2 ciclos** de penalización (mismo mecanismo).  
Con branch no tomado: **0 ciclos** (no hay flush).

---

## 7. Ejercicios de autoevaluación

1. ¿En qué etapa del pipeline se resuelve la condición de `beq`? ¿Por qué es en EX y no en ID?
2. ¿Cuántas instrucciones se descartan cuando un salto se toma? ¿De qué etapas?
3. Con el programa de la Variante A y flush desactivado, ¿qué valor tiene t2 al final? ¿Por qué es incorrecto?
4. ¿Qué diferencia hay entre `beq` no tomado y `beq` tomado en términos de ciclos de penalización?
5. ¿Qué escribe `jal ra, func` en el registro `ra`? ¿Para qué sirve ese valor?
6. ¿Cómo sabría el procesador dónde volver tras ejecutar la función en el ejemplo de `jal`?
7. Añade una segunda `beq` al programa. ¿Cambia la penalización total? Calcula el número de ciclos extra.
8. ¿Qué mejora podría aplicarse para reducir la penalización de 2 ciclos sin cambiar la arquitectura de 5 etapas?

---

## 8. Soluciones orientativas

1. La condición se resuelve en EX porque allí opera la ALU que compara los dos operandos. En ID solo se leen los registros, no se evalúan. Mover la comparación a ID requeriría hardware extra (comparador dedicado) y complicaría la detección de riesgos.
2. Se descartan 2 instrucciones: la que estaba en IF (ya capturada) y la que estaba en ID (ya decodificada). Ambas pertenecen al camino secuencial incorrecto.
3. Con flush desactivado, `addi t2, zero, 999` se ejecuta normalmente y t2 = 999. El resultado es incorrecto porque esa instrucción no debería haberse ejecutado.
4. Branch no tomado: 0 ciclos de penalización (el PC ya apuntaba a la siguiente instrucción secuencial). Branch tomado: 2 ciclos de penalización (flush de 2 instrucciones).
5. `jal ra, func` escribe PC+4 (la dirección de la instrucción siguiente, es decir, la de retorno) en ra (x1). Sirve para saber a dónde volver cuando la función termine.
6. Para volver, la función ejecutaría `jalr x0, ra, 0` (o `ret` en ensamblador RISC-V estándar), que salta a la dirección almacenada en ra.
7. Sí. Cada `beq` tomado añade 2 ciclos de penalización. Con dos beq tomados: 4 ciclos extra. La penalización es independiente para cada salto.
8. Predicción de saltos (branch prediction): si se predice correctamente el destino, se puede empezar a capturar instrucciones del destino antes de que la condición se resuelva. Reduce la penalización media cuando la predicción es correcta. Este simulador no implementa predicción avanzada.
