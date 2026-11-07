"""Export the demo businesses (+ a sample for scale) with their model suggestions as SQL for the Connect app (D1)."""
from __future__ import annotations
import hashlib, json, random, secrets, time
from collections import defaultdict
from ml.common import *

STORIES = {
 "FI-D0001": "Fonecta's own example. Last year's exceptions exist only partly; nothing entered for this year.", "FI-D0002": "Closed on Sundays, but opens for Father's Day lunch.",
 "FI-D0003": "Florist: Father's Day Sunday opening, longer hours before Christmas. Has standing permission.", "FI-D0004": "Store inside a shopping centre that has already published its holiday hours.",
 "FI-D0005": "Ski rental: season opening depends on snow; school-break days.", "FI-D0006": "Summer terrace that forgot to mark its winter closure.", "FI-D0007": "Closes between Christmas and New Year.",
 "SE-D0008": "Swedish café: closed on Julafton.", "NO-D0009": "Norwegian bakery: no history to copy.", "FI-D0010": "Pub next to the arena: open later on event nights.",
 "FI-D0011": "Closed for good in Sept 2026; listing still open. Right move: flag, don't suggest.", "FI-D0012": "Gave standing permission in 2025: apply without asking, then inform.",
 "FI-D0013": "Already entered correct hours. Right move: stay quiet.", "FI-D0014": "Opens earlier during school holidays.", "NO-D0015": "24/7 gym: nothing to change.",
 "SE-D0016": "Changed regular hours in 2026 but never updated the listing.", "FI-D0017": "New customer: no exception history and no previous decisions (the no-history case).",
}
q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "NULL" if v is None else str(v)

def main(sample=120):
    S = json.load(open("challenge_out/suggestions_2026.json", encoding="utf-8"))
    ents = {e["meta"]["id"]: e for e in json.load(open(D("entities.json"), encoding="utf-8"))["response"]["entities"]}
    contacts = {r["entity_id"]: r for r in read_csv(D("customer_contacts.csv"))}
    pubs = defaultdict(list)
    for l in json.load(open(D("listings.json"), encoding="utf-8"))["listings"]:
        pubs[l["entityId"]].append({"name": l["publisherName"], "status": l["status"], "seconds": l["typicalUpdateSpeedSeconds"]})
    by = defaultdict(list)
    for s in S: by[s["entity_id"]].append(s)
    demo_ids = sorted(STORIES)
    rnd = random.Random(7)
    pool = sorted(e for e, rows in by.items() if e not in STORIES and len(rows) >= 3 and not rows[0]["opted_out"])
    chosen = demo_ids + rnd.sample(pool, min(sample, len(pool)))
    now = int(time.time() * 1000); out = []
    biz_rows, sug_rows = [], []
    for eid in chosen:
        e, c = ents[eid], contacts.get(eid, {})
        reg = {d: day_str(e["hours"].get(d)) for d in DAYS}
        link = hashlib.sha256(f"link:{eid}".encode()).hexdigest()[:8]
        biz_rows.append(f"({q(eid)},{q(e['name'])},{q(e['address']['city'])},{q(e['meta']['countryCode'])},{q(e.get('c_segment'))},{q((STORIES.get(eid) or 'Sample business.') + f" Owner's language in the data: {(c.get('preferred_language') or 'fi').upper()}.")},{q('en')},{q(c.get('preferred_channel') or 'EMAIL')},{q(c.get('contact_first_name'))},{q(c.get('best_contact_window'))},{int(c.get('standing_permission_holidays') or 0)},{int(c.get('opted_out_of_suggestions') == '1')},{q(c.get('email'))},{q(c.get('mobile'))},NULL,{q(link)},{q(json.dumps(pubs.get(eid, [])))},{q(json.dumps(reg))},{now})")
        for s in by.get(eid, []):
            flag = s["action"] == "FLAG"
            sug_rows.append(f"({q(eid + ':' + s['date'])},{q(eid)},{q(s['date'])},{q(s['day_key'])},{q(s['action'])},{q(s['shown'])},{q(s['proposed'])},{s['confidence']},{q(s['basis'])},{q(json.dumps(s['reasons'], ensure_ascii=False))},{s['views_est']},{q(s.get('tier') or 'one_tap')},{q(json.dumps(s.get('options') or []))},{q(json.dumps(s.get('cost'), ensure_ascii=False) if s.get('cost') else None)},{q('flagged' if flag else 'draft')},NULL,{q(secrets.token_urlsafe(9))},NULL,NULL,NULL,{now},NULL,NULL,NULL)")
    cols_b = "id,name,city,country,segment,story,language,channel,contact_name,best_window,standing,opted_out,email,mobile,telegram_chat_id,link_code,publishers_json,regular_json,created_at"
    cols_s = "id,business_id,date,day_key,action,shown,proposed,confidence,basis,reasons_json,views_est,tier,options_json,cost_json,status,final_hours,token,message_id,note,undo_json,created_at,sent_at,decided_at,applied_at"
    chunks = []
    for i in range(0, len(biz_rows), 20): chunks.append(f"INSERT OR REPLACE INTO cn_businesses ({cols_b}) VALUES\n" + ",\n".join(biz_rows[i:i + 20]) + ";")
    for i in range(0, len(sug_rows), 20): chunks.append(f"INSERT OR REPLACE INTO cn_suggestions ({cols_s}) VALUES\n" + ",\n".join(sug_rows[i:i + 20]) + ";")
    open("challenge_out/seed.sql", "w", encoding="utf-8").write("\n".join(chunks) + "\n")
    print(f"businesses {len(biz_rows)}, suggestions {len(sug_rows)}, sql bytes {sum(len(c) for c in chunks)}")

if __name__ == "__main__":
    main()
