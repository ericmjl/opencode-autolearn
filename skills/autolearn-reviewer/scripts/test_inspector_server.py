# /// script
# dependencies = ["pytest", "python-slugify"]
# ///
import json
import inspector_server as UI
import registry as R
from pathlib import Path


def persona(tmp_path: Path) -> Path:
    p = tmp_path / "default"
    p.mkdir()
    return p


def call(method, path, pdir, body=b""):
    return UI.handle_request(method, path, body, pdir)


def decode(resp):
    status, ctype, payload = resp
    return status, json.loads(payload.decode("utf-8")) if ctype.startswith("application/json") else payload.decode("utf-8")


def test_overview(tmp_path):
    p = persona(tmp_path)
    reg = R.MemoryRegistry(p)
    reg.add("a memory")
    status, body = decode(call("GET", "/api/overview", p))
    assert status == 200
    assert body["total"] == 1
    assert "tiers" in body


def test_memories_list_and_detail(tmp_path):
    p = persona(tmp_path)
    reg = R.MemoryRegistry(p)
    rec = reg.add("use uv not pip3")
    status, rows = decode(call("GET", "/api/memories", p))
    assert status == 200 and len(rows) == 1
    status, detail = decode(call("GET", f"/api/memory/{rec['id']}", p))
    assert status == 200 and detail["id"] == rec["id"]
    assert "curve" in detail


def test_index_html_served(tmp_path):
    p = persona(tmp_path)
    status, body = decode(call("GET", "/", p))
    assert status == 200 and "<html" in body.lower()


def test_strengthen_post(tmp_path):
    p = persona(tmp_path)
    reg = R.MemoryRegistry(p)
    rec = reg.add("strengthen me")
    before = len(reg.get(rec["id"])["reinforcements"])
    status, body = decode(call("POST", f"/api/memory/{rec['id']}/strengthen", p))
    assert status == 200 and body["ok"] is True
    after = len(reg.get(rec["id"])["reinforcements"])
    assert after >= before


def test_candidate_dismiss(tmp_path):
    p = persona(tmp_path)
    cands = [{"id": "c1", "topic_sig": "x", "tokens": ["x"], "status": "pending"}]
    (p / "candidates.jsonl").write_text("\n".join(json.dumps(c) for c in cands), encoding="utf-8")
    status, body = decode(call("POST", "/api/candidate/c1/dismiss", p))
    assert status == 200 and body["ok"] is True
    rows = [json.loads(l) for l in (p / "candidates.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    assert rows[0]["status"] == "dismissed"
