#!/bin/bash
# Läuft IM Bau-Container (Debian trixie, privilegiert). Aufruf über os/bauen.sh.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
SPIEGEL="${ZOS_SPIEGEL:-http://deb.debian.org/debian}"
apt-get update -q
apt-get install -y -q --no-install-recommends live-build debootstrap xorriso squashfs-tools mtools dosfstools \
  grub-efi-amd64-bin grub-pc-bin isolinux syslinux-common ca-certificates curl gnupg cpio
rm -rf /bau && mkdir -p /bau && cd /bau
lb config \
  --distribution trixie --architectures amd64 \
  --archive-areas "main contrib non-free non-free-firmware" \
  --mirror-bootstrap "$SPIEGEL" --mirror-chroot "$SPIEGEL" --mirror-binary http://deb.debian.org/debian \
  --binary-images iso-hybrid --debian-installer none \
  --apt-recommends false --firmware-chroot false --memtest none \
  --iso-application ZentraleOS --iso-volume ZENTRALEOS --iso-publisher Kerim \
  --bootappend-live "boot=live components quiet splash locales=de_CH.UTF-8 keyboard-layouts=ch timezone=Europe/Zurich hostname=zentraleos username=zentrale noautologin live-config.nocomponents=user-setup,sudo,policykit,xinit"
cp /quelle/iso/paketlisten/*.list.chroot config/package-lists/
cp -a /quelle/iso/includes.chroot/. config/includes.chroot/
cp /quelle/iso/hooks/*.hook.chroot config/hooks/normal/
mkdir -p config/includes.chroot/opt/zentraleos
cp -a /quelle/shell config/includes.chroot/opt/zentraleos/shell
cp -a /quelle/erweiterungen config/includes.chroot/opt/zentraleos/erweiterungen 2>/dev/null || true
# Eigenes Bootmenü (Start, sicherer Grafikmodus, Wartung)
cp -a /usr/share/live/build/bootloaders config/
cp /quelle/iso/grub.cfg config/bootloaders/grub-pc/grub.cfg
# Härtung des Kerns (gleich wie im installierten System, siehe usr/libexec/zentraleos/installieren)
sed -i 's|@HAERTUNG@|lockdown=integrity init_on_alloc=1 slab_nomerge page_alloc.shuffle=1 randomize_kstack_offset=on vsyscall=none debugfs=off|g' config/bootloaders/grub-pc/grub.cfg
cp /quelle/iso/splash.svg config/bootloaders/splash.svg
sed -i 's/title-text: .*/title-text: ""/' config/bootloaders/grub-pc/live-theme/theme.txt
apt-get install -y -q --no-install-recommends librsvg2-bin fonts-dejavu-core >/dev/null
lb build 2>&1 | tee /ausgabe/bau.log | grep -E "^(P:|E:|W:|\[20)" || true
ls -la /bau/*.iso
cp /bau/live-image-amd64.hybrid.iso /ausgabe/zentraleos.iso
( cd /ausgabe && sha256sum zentraleos.iso > zentraleos.iso.sha256 && cat zentraleos.iso.sha256 )
