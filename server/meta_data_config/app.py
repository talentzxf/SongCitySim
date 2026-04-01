#!/usr/bin/env python3
from flask import Flask, jsonify, request, send_file, abort, send_from_directory
import sqlite3
import os
from pathlib import Path
import json
from datetime import datetime
from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / 'meta_data.db'
PUBLIC_DIR = ROOT / 'public' / 'resource' / 'meta_data'

os.makedirs(PUBLIC_DIR, exist_ok=True)

app = Flask(__name__, static_folder='ui', static_url_path='/meta-admin')
app.config['UPLOAD_FOLDER'] = str(PUBLIC_DIR)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB uploads


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@app.route('/')
def index():
    # redirect to admin UI
    return send_from_directory('ui', 'index.html')


@app.route('/api/meta/categories')
def categories():
    return jsonify(['buildings','professions','crops','names','texts','time_phases','economy','iron_tools'])


@app.route('/api/meta/buildings')
def get_buildings():
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute('SELECT id, label, description, raw_json FROM buildings').fetchall()
    out = []
    for r in rows:
        try:
            raw = json.loads(r['raw_json']) if r['raw_json'] else None
        except Exception:
            raw = None
        out.append({'id': r['id'], 'label': r['label'], 'description': r['description'], 'raw': raw})
    conn.close()
    return jsonify(out)


@app.route('/api/meta/buildings/<string:bid>', methods=['GET'])
def get_building(bid):
    conn = get_db()
    row = conn.execute('SELECT id, label, description, raw_json FROM buildings WHERE id=?', (bid,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    try:
        raw = json.loads(row['raw_json']) if row['raw_json'] else None
    except Exception:
        raw = None
    return jsonify({'id': row['id'], 'label': row['label'], 'description': row['description'], 'raw': raw})


@app.route('/api/meta/buildings/<string:bid>', methods=['PUT'])
def update_building(bid):
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'invalid json'}), 400
    # allow updating label, description, raw
    label = payload.get('label')
    description = payload.get('description')
    raw = payload.get('raw')
    conn = get_db()
    cur = conn.cursor()
    # fetch old raw for change_log
    old = cur.execute('SELECT raw_json FROM buildings WHERE id=?', (bid,)).fetchone()
    if not old:
        conn.close()
        abort(404)
    old_raw = old['raw_json']
    new_raw_json = json.dumps(raw, ensure_ascii=False) if raw is not None else old_raw
    cur.execute('UPDATE buildings SET label=?, description=?, raw_json=? WHERE id=?', (label or None, description or None, new_raw_json, bid))
    conn.commit()
    cur.execute('INSERT INTO change_log (action, key, old_value_json, new_value_json, ts) VALUES (?, ?, ?, ?, ?)', (
        'update', f'buildings.{bid}', old_raw, new_raw_json, datetime.utcnow().isoformat()
    ))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/meta/crops')
def get_crops():
    conn = get_db()
    rows = conn.execute('SELECT id, label, price, fertility_weight, description, raw_json FROM crops').fetchall()
    out = []
    for r in rows:
        try:
            raw = json.loads(r['raw_json']) if r['raw_json'] else None
        except Exception:
            raw = None
        out.append({'id': r['id'], 'label': r['label'], 'price': r['price'], 'fertilityWeight': r['fertility_weight'], 'description': r['description'], 'raw': raw})
    conn.close()
    return jsonify(out)


@app.route('/api/meta/log')
def get_log():
    conn = get_db()
    rows = conn.execute('SELECT id, action, key, ts FROM change_log ORDER BY id DESC LIMIT 200').fetchall()
    out = [dict(r) for r in rows]
    conn.close()
    return jsonify(out)


@app.route('/api/meta/log/<int:log_id>')
def get_log_detail(log_id):
    conn = get_db()
    row = conn.execute('SELECT * FROM change_log WHERE id=?', (log_id,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    return jsonify(dict(row))


def write_change_log(action, key, old_json, new_json):
    conn = get_db()
    conn.execute('INSERT INTO change_log (action, key, old_value_json, new_value_json, ts) VALUES (?, ?, ?, ?, ?)', (
        action, key, old_json, new_json, datetime.utcnow().isoformat()
    ))
    conn.commit()
    conn.close()


@app.route('/api/upload', methods=['POST'])
def upload_file():
    # fields: category, item
    if 'file' not in request.files:
        return jsonify({'error': 'no file'}), 400
    f = request.files['file']
    category = request.form.get('category', 'misc')
    item = request.form.get('item', 'general')
    filename = secure_filename(f.filename)
    dest_dir = Path(app.config['UPLOAD_FOLDER']) / category / item
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / filename
    # overwrite behavior per your choice
    f.save(str(dest_path))
    url_path = f'/resource/meta_data/{category}/{item}/{filename}'
    return jsonify({'url': url_path})


@app.route('/api/export/sqlite')
def export_sqlite():
    if not DB_PATH.exists():
        return jsonify({'error': 'meta_data.db missing'}), 500
    return send_file(str(DB_PATH), as_attachment=True, download_name='meta_data.db')


# simple UI static files served from ui/
@app.route('/meta-admin/<path:filename>')
def ui_files(filename):
    return send_from_directory('ui', filename)


# PUT endpoints for updating metadata
@app.route('/api/meta/buildings/<string:bid>', methods=['POST','PUT'])
def save_building(bid):
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'invalid json'}), 400
    label = payload.get('label')
    description = payload.get('description')
    raw = payload.get('raw')
    conn = get_db()
    cur = conn.cursor()
    old = cur.execute('SELECT raw_json FROM buildings WHERE id=?', (bid,)).fetchone()
    if not old:
        conn.close()
        abort(404)
    old_raw = old['raw_json']
    new_raw_json = json.dumps(raw, ensure_ascii=False) if raw is not None else old_raw
    cur.execute('UPDATE buildings SET label=?, description=?, raw_json=? WHERE id=?', (label or None, description or None, new_raw_json, bid))
    conn.commit()
    write_change_log('update', f'buildings.{bid}', old_raw, new_raw_json)
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/meta/crops/<string:cid>', methods=['PUT','POST'])
def save_crop(cid):
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'invalid json'}), 400
    label = payload.get('label')
    price = payload.get('price')
    fertility = payload.get('fertilityWeight')
    description = payload.get('description')
    raw = payload.get('raw')
    conn = get_db()
    cur = conn.cursor()
    old = cur.execute('SELECT raw_json FROM crops WHERE id=?', (cid,)).fetchone()
    if not old:
        conn.close()
        abort(404)
    old_raw = old['raw_json']
    new_raw_json = json.dumps(raw, ensure_ascii=False) if raw is not None else old_raw
    cur.execute('UPDATE crops SET label=?, price=?, fertility_weight=?, description=?, raw_json=? WHERE id=?', (label or None, price, fertility, description or None, new_raw_json, cid))
    conn.commit()
    write_change_log('update', f'crops.{cid}', old_raw, new_raw_json)
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/meta/professions/<string:pid>', methods=['PUT','POST'])
def save_profession(pid):
    payload = request.get_json()
    if not payload:
        return jsonify({'error': 'invalid json'}), 400
    label = payload.get('label')
    building_types = payload.get('buildingTypes')
    raw = payload.get('raw')
    conn = get_db()
    cur = conn.cursor()
    old = cur.execute('SELECT raw_json FROM professions WHERE id=?', (pid,)).fetchone()
    if not old:
        conn.close()
        abort(404)
    old_raw = old['raw_json']
    new_raw_json = json.dumps(raw, ensure_ascii=False) if raw is not None else old_raw
    cur.execute('UPDATE professions SET label=?, building_types_json=?, raw_json=? WHERE id=?', (label or None, json.dumps(building_types or [] , ensure_ascii=False), new_raw_json, pid))
    conn.commit()
    write_change_log('update', f'professions.{pid}', old_raw, new_raw_json)
    conn.close()
    return jsonify({'ok': True})


if __name__ == '__main__':
    print('Starting Flask meta_data_config on http://127.0.0.1:5000')
    app.run(port=5000)
