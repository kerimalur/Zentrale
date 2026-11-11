#!/usr/bin/env python3
# Kleines PTY-Hilfsprogramm für das Terminal von ZentraleOS.
# stdin -> Shell, Shell -> stdout, Dateideskriptor 3: "spalten zeilen\n" für die Fenstergrösse.
import os, pty, sys, select, struct, fcntl, termios, signal

pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])

def groesse(spalten, zeilen):
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', zeilen, spalten, 0, 0))
        os.kill(pid, signal.SIGWINCH)
    except OSError:
        pass

signal.signal(signal.SIGHUP, lambda *_: (os.kill(pid, signal.SIGHUP), sys.exit(0)))
quellen = [0, fd]
try:
    os.fstat(3); quellen.append(3)
except OSError:
    pass
groesse(100, 30)
while True:
    try:
        bereit, _, _ = select.select(quellen, [], [])
    except InterruptedError:
        continue
    if fd in bereit:
        try:
            daten = os.read(fd, 65536)
        except OSError:
            break
        if not daten:
            break
        os.write(1, daten)
    if 0 in bereit:
        daten = os.read(0, 65536)
        if not daten:
            break
        os.write(fd, daten)
    if 3 in bereit:
        daten = os.read(3, 256)
        if not daten:
            quellen.remove(3)
        else:
            try:
                s, z = daten.decode().strip().split('\n')[-1].split()
                groesse(int(s), int(z))
            except ValueError:
                pass
try:
    _, status = os.waitpid(pid, 0)
    sys.exit(os.waitstatus_to_exitcode(status))
except ChildProcessError:
    sys.exit(0)
