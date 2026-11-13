#!/bin/bash
# Startet das ISO in QEMU (UEFI). Mit KVM, wenn vorhanden – sonst langsam per Emulation.
# Aufruf: vm.sh <iso> <arbeitsordner> [zusätzliche Kernel-Parameter werden nicht unterstützt – Demo per Bootmenü]
set -euo pipefail
ISO="$1"; ORT="${2:-/tmp/zos-vm}"; mkdir -p "$ORT"
for f in /usr/share/OVMF/OVMF_CODE_4M.fd /usr/share/OVMF/OVMF_CODE.fd; do [ -f "$f" ] && OVMF_CODE="$f" && break; done
for f in /usr/share/OVMF/OVMF_VARS_4M.fd /usr/share/OVMF/OVMF_VARS.fd; do [ -f "$f" ] && OVMF_VARS="$f" && break; done
cp "$OVMF_VARS" "$ORT/vars.fd"
[ -f "$ORT/platte.qcow2" ] || qemu-img create -q -f qcow2 "$ORT/platte.qcow2" 24G
BESCHL="-accel tcg,thread=multi -cpu max"; [ -w /dev/kvm ] && BESCHL="-accel kvm -cpu host"
# ZOS_VM_DIREKT=1: Kernel direkt starten (ohne Bootmenü), um Kernel-Parameter für den Testmodus zu setzen.
DIREKT=()
if [ "${ZOS_VM_DIREKT:-0}" = 1 ]; then
  # Kernel und Startabbild aus dem ISO holen (xorriso braucht keine Root-Rechte)
  xorriso -osirrox on -indev "$ISO" -extract /live "$ORT/live" >/dev/null 2>&1
  cp "$(ls "$ORT"/live/vmlinuz* | head -1)" "$ORT/vmlinuz"; cp "$(ls "$ORT"/live/initrd* | head -1)" "$ORT/initrd"; chmod -R u+w "$ORT/live"; rm -rf "$ORT/live"
  DIREKT=(-kernel "$ORT/vmlinuz" -initrd "$ORT/initrd" -append "boot=live components quiet locales=de_CH.UTF-8 keyboard-layouts=ch timezone=Europe/Zurich hostname=zentraleos username=zentrale noautologin live-config.nocomponents=user-setup,sudo,policykit,xinit console=tty0 ${ZOS_VM_PARAMETER:-zos.test}")
fi
# TPM-Chip (swtpm), falls vorhanden – der Zustand bleibt zwischen den Starts erhalten (für die Platte, die an ihn gebunden wird)
TPM=()
if command -v swtpm >/dev/null; then
  mkdir -p "$ORT/tpm"; pkill -f "swtpm socket --tpmstate dir=$ORT/tpm" 2>/dev/null || true; sleep 0.5
  swtpm socket --tpmstate dir="$ORT/tpm" --ctrl type=unixio,path="$ORT/tpm/sock" --tpm2 --daemon
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -S "$ORT/tpm/sock" ] && break; sleep 0.3; done
  TPM=(-chardev "socket,id=chrtpm,path=$ORT/tpm/sock" -tpmdev emulator,id=tpm0,chardev=chrtpm -device tpm-tis,tpmdev=tpm0)
fi
# ZOS_VM_PLATTE=1: ohne ISO, nur von der (installierten) Platte starten
CD=(-drive "file=$ISO,media=cdrom,readonly=on"); [ "${ZOS_VM_PLATTE:-0}" = 1 ] && CD=()
exec qemu-system-x86_64 $BESCHL "${DIREKT[@]}" -machine q35 -smp "${ZOS_VM_CPUS:-2}" -m "${ZOS_VM_RAM:-3072}" \
  -drive if=pflash,format=raw,readonly=on,file="$OVMF_CODE" -drive if=pflash,format=raw,file="$ORT/vars.fd" \
  "${CD[@]}" "${TPM[@]}" -drive file="$ORT/platte.qcow2",if=virtio \
  -device virtio-vga -display none -vnc "unix:$ORT/vnc.sock" \
  -device virtio-net-pci,netdev=n0 -netdev user,id=n0,hostfwd=tcp:127.0.0.1:${ZOS_VM_SSH:-2222}-:22,hostfwd=tcp:127.0.0.1:${ZOS_VM_PORT:-8099}-:8099,hostfwd=tcp:127.0.0.1:${ZOS_VM_CDP:-9223}-:9223 \
  -device qemu-xhci -device usb-tablet -device usb-kbd \
  -qmp "unix:$ORT/qmp.sock,server,nowait" -serial "file:$ORT/seriell.log" -daemonize -pidfile "$ORT/qemu.pid"
