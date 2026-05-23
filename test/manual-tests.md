# Pruebas Manuales - Simulador RISC-V (RV64IM)

Este documento contiene un conjunto de pruebas básicas para verificar el correcto funcionamiento del simulador ciclo a ciclo. Puedes copiar y pegar estos códigos en la caja de texto del simulador.

## 1. Forwarding sin stall
Verifica que las dependencias aritméticas consecutivas se resuelven con anticipación de datos desde EX/MEM y MEM/WB sin detener la ejecución.

**Programa:**
```assembly
li t0, 10
li t1, 20
add t2, t0, t1   # t2 = 30
sub t3, t2, t0   # t3 = 20 (forwarding desde EX/MEM)
and t4, t3, t1   # t4 = 20 (forwarding desde EX/MEM)
```
**Resultado esperado:** 
- Al final, `t2 = 30`, `t3 = 20`, `t4 = 20`.
- El historial no debe mostrar ninguna celda de "Stall".

## 2. Load-Use con 1 stall
Verifica que cuando una instrucción necesita el dato cargado de memoria en la instrucción inmediatamente anterior, se inserta exactamente 1 ciclo de burbuja.

**Programa:**
```assembly
.data
var1: .word 100
.text
la t0, var1
lw t1, 0(t0)
addi t2, t1, 50
```
**Resultado esperado:**
- En el ciclo donde `lw` está en EX, el simulador detectará que `addi` necesita el registro `t1`.
- Se insertará una burbuja.
- Resultado final: `t2 = 150`.

## 3. Branch tomado con Flush
Verifica que un salto tomado (`beq`) descarta correctamente las instrucciones que ya entraron al pipeline (vaciado / flush) y actualiza el PC al destino.

**Programa:**
```assembly
li t0, 5
li t1, 5
beq t0, t1, jump
addi t2, zero, 999  # Esta instruccion se carga pero debe ser descartada
jump:
addi t3, zero, 1
```
**Resultado esperado:**
- Al final, `t2` debe valer `0` (la instrucción se descarta).
- `t3` debe valer `1`.
- En el historial aparecerá el indicador de salto tomado y vaciado.

## 4. Multiplicación, División y Resto (RV64M)
Verifica que las instrucciones de la extensión M operan en 64 bits correctamente.

**Programa:**
```assembly
li t0, 25
li t1, 4
mul t2, t0, t1
div t3, t0, t1
rem t4, t0, t1
```
**Resultado esperado:**
- `t2 = 100` (25 * 4)
- `t3 = 6` (25 / 4)
- `t4 = 1` (25 % 4)

## 5. Uso de 64 bits: ld y sd
Verifica que el direccionamiento por bytes, y las instrucciones `.dword`, `ld`, y `sd` manipulan 8 bytes correctamente usando enteros de precisión múltiple (BigInt internamente).

**Programa:**
```assembly
.data
val: .dword 0xFFEEDDCCBBAA9988
.text
la t0, val
ld t1, 0(t0)      # t1 = -1122867... (representación con signo)
addi t2, t1, 1    # t2 = 0xFFEEDDCCBBAA9989
sd t2, 8(t0)
ld t3, 8(t0)
```
**Resultado esperado:**
- `t3` recibe exactamente el mismo valor de 64 bits, demostrando la conservación del tamaño de registro y memoria.
- Se usarán 8 bytes por `sd` en memoria, incrementando la dirección final en 8 posiciones (observar la ventana de Memoria).
