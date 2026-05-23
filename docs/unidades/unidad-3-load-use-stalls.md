# Unidad 3: Load-Use Hazard y Stalls

## 1. Introducción

Una instrucción de carga (`lw` o `ld`) obtiene su dato de la memoria en la etapa **MEM**. Si la instrucción inmediatamente siguiente necesita ese dato, no es posible anticiparlo mediante forwarding porque el dato no existe aún cuando la siguiente instrucción está en EX. La única solución es detener el pipeline un ciclo mediante un **stall** (burbuja).

Este riesgo se llama **load-use hazard** y es el único que no puede eliminarse completamente con forwarding estándar. Insertar una instrucción independiente entre la carga y el uso evita el stall.

---

## 2. Objetivos operativos

1. Identificar secuencias load-use en un programa.
2. Explicar por qué el forwarding no es suficiente para el hazard load-use.
3. Observar la burbuja (NOP) insertada por la unidad de detección de riesgos.
4. Distinguir el stall load-use (siempre necesario) del stall RAW genérico (solo sin forwarding).
5. Demostrar que insertar una instrucción independiente entre carga y uso elimina el stall.
6. Verificar que el resultado final es correcto con y sin stall.

---

## 3. Código de partida

### Variante A: genera stall (uso inmediato)

```assembly
.data
value: .word 100
.text
la  t0, value      # t0 = dirección base
lw  t1, 0(t0)      # t1 = mem[t0]  (carga 32 bits)
addi t2, t1, 5     # t2 = t1 + 5   ← depende de t1 (stall necesario)
sw  t2, 4(t0)      # mem[t0+4] = t2
```

### Variante B: sin stall (instrucción independiente en medio)

```assembly
.data
value: .word 100
.text
la   t0, value
lw   t1, 0(t0)
li   t3, 99        # instrucción independiente: no usa t1
addi t2, t1, 5     # ahora t1 ya está disponible (1 ciclo de separación)
sw   t2, 4(t0)
```

---

## 4. Configuración del simulador

| Parámetro | Valor |
|---|---|
| Forwarding | **Activado** |
| Flush | Activado |
| Escenario | *RV64I: Riesgo Load-Use (lw)* |

---

## 5. Pasos de interacción con el simulador

### Variante A

1. Carga la Variante A. Activa Forwarding.
2. Avanza ciclo a ciclo hasta el ciclo en que `lw` está en EX (ciclo 4 aproximadamente).
3. En el ciclo siguiente, observa que el simulador inserta una burbuja:
   - La tarjeta **ID/EX** muestra "(empty)" o burbuja.
   - La tarjeta **IF/ID** sigue mostrando `addi t2, t1, 5` (congelada).
4. En el panel de **Señales**: `Stall = 1`.
5. En el **Historial**: Stall = Sí, stallReason = "load-use hazard".
6. Avanza hasta el final. Verifica: t1 = 100, t2 = 105.

### Variante B

1. Carga la Variante B.
2. Avanza ciclo a ciclo. Observa que **no aparece ningún stall** en el historial.
3. La instrucción `li t3, 99` actúa de separador, dejando pasar un ciclo extra para que el dato de `lw` esté disponible.
4. Verifica: t1 = 100, t2 = 105, t3 = 99.

---

## 6. Qué debe observar el estudiante

### Variante A – Ciclos clave

| Ciclo | IF | ID | EX | MEM | WB | Evento |
|---|---|---|---|---|---|---|
| 3 | addi | lw | la | – | – | lw entra en EX |
| 4 | (congelado) | burbuja | lw | la | – | **Stall detectado** |
| 5 | sw | addi | burbuja | lw | la | lw completa MEM, t1 disponible |
| 6 | – | sw | addi | burbuja | lw | addi usa t1 correctamente |

### Variante B – No hay stall

| Ciclo | IF | ID | EX | MEM | WB | Evento |
|---|---|---|---|---|---|---|
| 3 | li t3 | lw | la | – | – | |
| 4 | addi | li t3 | lw | la | – | lw en EX |
| 5 | sw | addi | li t3 | lw | la | lw completa MEM |
| 6 | – | sw | addi | li t3 | lw | addi usa t1 via forwarding |

---

## 7. Ejercicios de autoevaluación

1. ¿Por qué forwarding no puede resolver el hazard load-use? Describe el camino del dato.
2. ¿Cuántos ciclos de stall se insertan si hay dos instrucciones seguidas que usan el resultado de `lw`?
3. Si usas `ld` en lugar de `lw`, ¿cambia el número de stalls? ¿Y el valor del dato?
4. ¿Puede un store (`sw` o `sd`) causar un load-use hazard? Describe un ejemplo.
5. En la Variante B, ¿desde qué registro se hace el forwarding cuando `addi` llega a EX?
6. ¿Qué ocurre en el panel de memoria al ejecutar `sw t2, 4(t0)`? ¿Qué dirección y qué valor aparecen?
7. Si eliminas el `sw` del programa, ¿el valor de t2 se puede ver igualmente? ¿Dónde?
8. Explica la diferencia entre "stall por load-use" y "stall por RAW sin forwarding".

---

## 8. Soluciones orientativas

1. En el pipeline, cuando la instrucción dependiente está en EX (necesita el dato), `lw` está en MEM (leyendo memoria). El dato aún no existe en ningún registro inter-etapa, así que no hay nada que anticipar. Hay que esperar al ciclo siguiente (cuando `lw` completa MEM y el dato pasa a MEM/WB).
2. El primer uso genera 1 stall. El segundo uso ya puede obtener el dato vía forwarding desde MEM/WB (con 1 ciclo extra de separación), así que también 1 stall. Total: 2 stalls si ambas instrucciones usan el resultado en los ciclos inmediatamente siguientes.
3. El número de stalls es el mismo (1 stall). El valor es diferente: `ld` carga 8 bytes interpretados con signo; `lw` carga 4 bytes con extensión de signo a 64 bits.
4. Sí. Si `sw t1, 0(t0)` sigue a `lw t1, 8(t0)`, el valor que se va a guardar (t1) depende de un load. Se genera stall para el dato a guardar.
5. Desde MEM/WB. Cuando `addi` está en EX, `lw` ya ha completado MEM y el dato está en MEM/WB. El forwarding MEM/WB → EX aporta el valor correcto.
6. En la vista de memoria aparecerán bytes en la dirección calculada (base + 4). Los 4 bytes inferiores de t2 (= 105) se almacenan en orden little-endian.
7. Sí. El valor de t2 está visible en la tabla de Registros independientemente de si se almacena en memoria.
8. Stall load-use: se produce siempre que `lw`/`ld` es seguido inmediatamente por una instrucción que usa el resultado, incluso con forwarding activado. Stall RAW genérico: se produce cuando forwarding está **desactivado** y cualquier instrucción depende de otra anterior que aún no ha escrito en WB.
