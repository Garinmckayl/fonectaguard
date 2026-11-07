"""Loaders for the challenge data (read as data only)."""
from __future__ import annotations
import csv, json, os
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, "challenge", "data", *p)
L = lambda *p: os.path.join(ROOT, "challenge", "labels", *p)
E = lambda *p: os.path.join(ROOT, "challenge", "evaluation", *p)
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
SNAP = {2026: date(2026, 11, 6), 2025: date(2025, 11, 6), 2024: date(2024, 11, 6)}

def day_str(obj):
    if not obj or obj.get("isClosed"): return "closed"
    return ",".join(f"{i['start']}-{i['end']}" for i in obj.get("openIntervals", [])) or "closed"

def cycle(d: date) -> int:
    """Holiday season (Feb..Jan) a date belongs to."""
    return d.year if d.month >= 2 else d.year - 1

def read_csv(path): return list(csv.DictReader(open(path, encoding="utf-8")))
def read_jsonl(path):
    for line in open(path, encoding="utf-8"): yield json.loads(line)
