#!/usr/bin/env python3
"""Steuert die Test-VM über QMP: Bildschirmfoto, Tasten, Text tippen, Maus.
   qmp.py <qmp.sock> foto <datei.png> | taste <ctrl-alt-f2 ...> | tippe <text> | klick <x> <y> [breite hoehe] | warte <sek>"""
import json, socket, sys, time

KARTE = {' ': 'spc', '\n': 'ret', '-': 'minus', '.': 'dot', ',': 'comma', '/': 'slash', '=': 'equal', ';': 'semicolon', "'": 'apostrophe'}
# Schweizer Layout: was man auf einer US-Tastatur drücken muss, um das Zeichen zu bekommen
CH = {'-': ['slash'], '/': ['shift', '7'], 'z': ['y'], 'y': ['z'], '.': ['dot'], ',': ['comma'], ':': ['shift', 'dot'], '=': ['shift', '0'], '_': ['shift', 'slash'], '"': ['shift', '2'], '+': ['shift', '1'], '*': ['shift', '3'], '(': ['shift', '8'], ')': ['shift', '9'], '?': ['shift', 'minus'], "'": ['minus'], ';': ['shift', 'comma'], '&': ['shift', '6'], '>': ['shift', 'less'], '<': ['less'], '|': ['alt_r', '7'], '@': ['alt_r', '2'], '#': ['alt_r', '3'], '$': ['backslash'], '~': ['alt_r', 'equal']}

class Qmp:
    def __init__(self, pfad):
        self.s = socket.socket(socket.AF_UNIX); self.s.connect(pfad); self.f = self.s.makefile('rw')
        self.f.readline(); self.befehl('qmp_capabilities')
    def befehl(self, name, **arg):
        self.f.write(json.dumps({'execute': name, 'arguments': arg}) + '\n'); self.f.flush()
        while True:
            a = json.loads(self.f.readline())
            if 'return' in a or 'error' in a: return a
    def tasten(self, namen, halten=80):
        return self.befehl('send-key', keys=[{'type': 'qcode', 'data': n} for n in namen], **{'hold-time': halten})
    def tippe(self, text, layout='ch'):
        for z in text:
            if layout == 'ch' and z in CH: k = CH[z]
            elif z.isupper(): k = ['shift', z.lower() if layout != 'ch' else {'Z': 'y', 'Y': 'z'}.get(z, z.lower())]
            elif z in KARTE: k = [KARTE[z]]
            else: k = [z]
            self.tasten(k); time.sleep(0.09)
    def klick(self, x, y, b=1280, h=800, knopf='left'):
        ax, ay = int(x * 32767 / b), int(y * 32767 / h)
        self.befehl('input-send-event', events=[{'type': 'abs', 'data': {'axis': 'x', 'value': ax}}, {'type': 'abs', 'data': {'axis': 'y', 'value': ay}}]); time.sleep(0.15)
        for unten in (True, False):
            self.befehl('input-send-event', events=[{'type': 'btn', 'data': {'down': unten, 'button': knopf}}]); time.sleep(0.08)

if __name__ == '__main__':
    q = Qmp(sys.argv[1]); was = sys.argv[2]; a = sys.argv[3:]
    if was == 'foto': print(q.befehl('screendump', filename=a[0], format='png'))
    elif was == 'taste': print(q.tasten(a[0].split('-')))
    elif was == 'tippe': q.tippe(a[0], a[1] if len(a) > 1 else 'ch')
    elif was == 'klick': q.klick(int(a[0]), int(a[1]), *(int(v) for v in a[2:4]))
    elif was == 'warte': time.sleep(float(a[0]))
