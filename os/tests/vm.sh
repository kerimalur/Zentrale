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
  mkdir -p "$ORT/iso"; mountpoint -q "$ORT/iso" || mount -o loop,ro "$ISO" "$ORT/iso" 2>/dev/null || sudo mount -o loop,ro "$ISO" "$ORT/iso"
  cp "$ORT"/iso/live/vmlinuz* "$ORT/vmlinuz"; cp "$ORT"/iso/live/initrd* "$ORT/initrd"; umount "$ORT/iso" 2>/dev/null || sudo umount "$ORT/iso"
  DIREKT=(-kernel "$ORT/vmlinuz" -initrd "$ORT/initrd" -append "boot=live components quiet locales=de_CH.UTF-8 keyboard-layouts=ch timezone=Europe/Zurich hostname=zentraleos username=zentrale noautologin live-config.nocomponents=user-setup,sudo,policykit,xinit console=tty0 ${ZOS_VM_PARAMETER:-zos.test}")
fi
exec qemu-system-x86_64 $BESCHL "${DIREKT[@]}" -machine q35 -smp "${ZOS_VM_CPUS:-2}" -m "${ZOS_VM_RAM:-3072}" \
  -drive if=pflash,format=raw,readonly=on,file="$OVMF_CODE" -drive if=pflash,format=raw,file="$ORT/vars.fd" \
  -drive file="$ISO",media=cdrom,readonly=on -drive file="$ORT/platte.qcow2",if=virtio \
  -device virtio-vga -display none -vnc "unix:$ORT/vnc.sock" \
  -device virtio-net-pci,netdev=n0 -netdev user,id=n0,hostfwd=tcp:127.0.0.1:${ZOS_VM_SSH:-2222}-:22,hostfwd=tcp:127.0.0.1:${ZOS_VM_PORT:-8099}-:8099,hostfwd=tcp:127.0.0.1:${ZOS_VM_CDP:-9223}-:9223 \
  -device qemu-xhci -device usb-tablet -device usb-kbd \
  -qmp "unix:$ORT/qmp.sock,server,nowait" -serial "file:$ORT/seriell.log" -daemonize -pidfile "$ORT/qemu.pid"
