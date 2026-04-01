#!/usr/bin/env python3
"""
Import existing src/config/buildings-and-citizens.json into a SQLite database named meta_data.db
Creates tables for buildings, professions, names, crops, iron_tools, texts, time_phases, economy, meta_config, change_log

This script intentionally does NOT delete or modify the original JSON file.
"""
import json
import sqlite3
from pathlib import Path
import datetime

ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / 'src' / 'config' / 'buildings-and-citizens.json'
DB_PATH = ROOT / 'meta_data.db'

if not JSON_PATH.exists():
    print(f"Error: {JSON_PATH} not found")
    raise SystemExit(1)

with open(JSON_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Remove existing DB? We'll overwrite the file if exists after backing up
if DB_PATH.exists():
    backup = DB_PATH.with_suffix('.db.bak')
    print(f"Backing up existing {DB_PATH} -> {backup}")
    DB_PATH.replace(backup)

conn = sqlite3.connect(str(DB_PATH))
cur = conn.cursor()

# Create tables
cur.executescript('''
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    label TEXT,
    label_en TEXT,
    cost INTEGER,
    capacity INTEGER,
    worker_slots INTEGER,
    need_bonus_json TEXT,
    description TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS professions (
    id TEXT PRIMARY KEY,
    label TEXT,
    building_types_json TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS surnames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
);

CREATE TABLE IF NOT EXISTS given_names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gender TEXT,
    name TEXT
);

CREATE TABLE IF NOT EXISTS citizens_thoughts (
    key TEXT PRIMARY KEY,
    text TEXT
);

CREATE TABLE IF NOT EXISTS time_phases (
    key TEXT PRIMARY KEY,
    value_json TEXT
);

CREATE TABLE IF NOT EXISTS economy (
    key TEXT PRIMARY KEY,
    value_json TEXT
);

CREATE TABLE IF NOT EXISTS crops (
    id TEXT PRIMARY KEY,
    label TEXT,
    price INTEGER,
    fertility_weight REAL,
    description TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS iron_tools (
    id TEXT PRIMARY KEY,
    label TEXT,
    description TEXT,
    raw_json TEXT
);

CREATE TABLE IF NOT EXISTS meta_config (
    key TEXT PRIMARY KEY,
    value_json TEXT
);

CREATE TABLE IF NOT EXISTS change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    key TEXT,
    old_value_json TEXT,
    new_value_json TEXT,
    ts TEXT
);
''')
conn.commit()

# Insert buildings
buildings = data.get('buildings', {})
for bid, b in buildings.items():
    cur.execute('''INSERT INTO buildings (id, label, label_en, cost, capacity, worker_slots, need_bonus_json, description, raw_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
        bid,
        b.get('label'),
        b.get('labelEn'),
        b.get('cost'),
        b.get('capacity'),
        b.get('workerSlots'),
        json.dumps(b.get('needBonus', {}), ensure_ascii=False),
        b.get('desc'),
        json.dumps(b, ensure_ascii=False)
    ))

# Insert professions
profs = data.get('professions', {})
for pid, p in profs.items():
    cur.execute('''INSERT INTO professions (id, label, building_types_json, raw_json) VALUES (?, ?, ?, ?)''', (
        pid,
        p.get('label'),
        json.dumps(p.get('buildingTypes', []), ensure_ascii=False),
        json.dumps(p, ensure_ascii=False)
    ))

# Insert names
for name in data.get('surnames', []):
    cur.execute('INSERT INTO surnames (name) VALUES (?)', (name,))

for name in data.get('givenNamesMale', []):
    cur.execute('INSERT INTO given_names (gender, name) VALUES (?, ?)', ('male', name))

for name in data.get('givenNamesFemale', []):
    cur.execute('INSERT INTO given_names (gender, name) VALUES (?, ?)', ('female', name))

# citizens thoughts
for k, v in data.get('citizensThoughts', {}).items():
    cur.execute('INSERT INTO citizens_thoughts (key, text) VALUES (?, ?)', (k, v))

# time phases
for k, v in data.get('timePhases', {}).items():
    cur.execute('INSERT INTO time_phases (key, value_json) VALUES (?, ?)', (k, json.dumps(v, ensure_ascii=False)))

# economy
for k, v in data.get('economy', {}).items():
    cur.execute('INSERT INTO economy (key, value_json) VALUES (?, ?)', (k, json.dumps(v, ensure_ascii=False)))

# crops
for cid, c in data.get('crops', {}).items():
    cur.execute('INSERT INTO crops (id, label, price, fertility_weight, description, raw_json) VALUES (?, ?, ?, ?, ?, ?)', (
        cid,
        c.get('label'),
        c.get('price'),
        c.get('fertilityWeight'),
        c.get('desc'),
        json.dumps(c, ensure_ascii=False)
    ))

# iron tools
for t in data.get('ironToolTypes', []):
    cur.execute('INSERT INTO iron_tools (id, label, description, raw_json) VALUES (?, ?, ?, ?)', (
        t.get('id'),
        t.get('label'),
        t.get('desc'),
        json.dumps(t, ensure_ascii=False)
    ))

# store the whole original json as a meta_config entry
cur.execute('INSERT OR REPLACE INTO meta_config (key, value_json) VALUES (?, ?)', ('_original_buildings_and_citizens_json', json.dumps(data, ensure_ascii=False)))

conn.commit()

# log import action
cur.execute('INSERT INTO change_log (action, key, old_value_json, new_value_json, ts) VALUES (?, ?, ?, ?, ?)', (
    'import', 'buildings-and-citizens.json', None, json.dumps(list(buildings.keys())), datetime.datetime.utcnow().isoformat()
))
conn.commit()

print(f"Created {DB_PATH} with buildings: {len(buildings)}, professions: {len(profs)}")
conn.close()
