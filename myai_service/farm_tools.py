"""
Read-only farm data tools — fetch relevant context from Supabase
for injection into the LLM prompt.
"""
import os
from datetime import date
from typing import Optional, List
from supabase import create_client, Client


def _client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


# ─────────────────────────────────────────────────────────────────────────────
# Individual tools
# ─────────────────────────────────────────────────────────────────────────────

def get_animals(user_id: str) -> List[dict]:
    """Return all active (non-archived) animals for the user."""
    sb = _client()
    res = (
        sb.table("animals")
        .select(
            "id, tag_id, name, species, breed, sex, date_of_birth, "
            "weight_kg, health_status, health_risk_score, "
            "current_temperature, current_heart_rate, "
            "breeding_status, last_mating_date, expected_kidding_date, "
            "vaccination_status, next_vaccine_date, archived"
        )
        .eq("user_id", user_id)
        .eq("archived", False)
        .order("name")
        .execute()
    )
    return res.data or []


def get_health_records(user_id: str, limit: int = 20) -> List[dict]:
    """Return recent health records."""
    sb = _client()
    res = (
        sb.table("health_records")
        .select(
            "id, animal_id, record_date, temperature, heart_rate, "
            "respiratory_rate, famacha_score, bloat_score, gait, "
            "appetite, cough, diarrhea, risk_score, risk_level, "
            "detected_conditions, recommendation"
        )
        .eq("user_id", user_id)
        .order("record_date", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_vaccinations(user_id: str) -> List[dict]:
    """Return vaccination records with overdue status."""
    sb = _client()
    res = (
        sb.table("vaccinations")
        .select("id, animal_id, vaccine_name, date_given, next_due_date")
        .eq("user_id", user_id)
        .order("date_given", desc=True)
        .limit(50)
        .execute()
    )
    records = res.data or []
    today = date.today().isoformat()
    for r in records:
        ndd = r.get("next_due_date")
        r["status"] = "Overdue" if ndd and ndd < today else ("Due Soon" if ndd else "OK")
    return records


def get_weight_records(user_id: str, limit: int = 30) -> List[dict]:
    """Return recent weight records."""
    sb = _client()
    res = (
        sb.table("weight_records")
        .select("id, animal_id, record_date, weight_kg, daily_gain_kg")
        .eq("user_id", user_id)
        .order("record_date", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_breeding_records(user_id: str) -> List[dict]:
    """Return breeding records."""
    sb = _client()
    res = (
        sb.table("breeding_records")
        .select(
            "id, animal_id, mating_date, expected_kidding_date, "
            "actual_kidding_date, offspring_count, status"
        )
        .eq("user_id", user_id)
        .order("mating_date", desc=True)
        .limit(30)
        .execute()
    )
    return res.data or []


def get_inventory(user_id: str) -> List[dict]:
    """Return inventory items, flagging low stock and expired items."""
    sb = _client()
    res = (
        sb.table("inventory")
        .select(
            "id, name, category, quantity, unit, "
            "minimum_stock, expiry_date, cost"
        )
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )
    items = res.data or []
    today = date.today().isoformat()
    for i in items:
        i["low_stock"] = float(i.get("quantity") or 0) <= float(i.get("minimum_stock") or 0)
        i["expired"] = bool(i.get("expiry_date") and i["expiry_date"] < today)
    return items


def get_feed_records(user_id: str, limit: int = 30) -> List[dict]:
    """Return recent feed records."""
    sb = _client()
    res = (
        sb.table("feed_records")
        .select("id, animal_id, record_date, feed_type, quantity_kg, cost")
        .eq("user_id", user_id)
        .order("record_date", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_milk_records(user_id: str, limit: int = 30) -> List[dict]:
    """Return recent milk records."""
    sb = _client()
    res = (
        sb.table("milk_records")
        .select("id, animal_id, record_date, yield_litres")
        .eq("user_id", user_id)
        .order("record_date", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_camera_screenings(user_id: str, limit: int = 20) -> list:
    """Return recent camera health screening results."""
    sb = _client()
    res = (
        sb.table("camera_health_screenings")
        .select("id, animal_id, prediction, confidence, model_version, quality_score, created_at, notes")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_settings(user_id: str) -> Optional[dict]:
    """Return farm settings."""
    sb = _client()
    res = (
        sb.table("settings")
        .select("farm_name, target_weight_kg, gestation_days, temp_critical, heart_rate_high")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return res.data


# ─────────────────────────────────────────────────────────────────────────────
# Context builder — decides what to fetch based on the user's question
# ─────────────────────────────────────────────────────────────────────────────

def _name_map(animals: List[dict]) -> dict[str, str]:
    return {a["id"]: a["name"] for a in animals}


def build_context(question: str, user_id: str) -> str:
    """
    Fetch only the data relevant to the question and return it
    as a compact plain-text block for injection into the LLM prompt.
    """
    q = question.lower()

    # Always fetch animals — they are the foundation of everything
    animals = get_animals(user_id)
    nm = _name_map(animals)
    today = date.today().isoformat()

    sections: list[str] = []

    # ── Animals ──────────────────────────────────────────────────────────────
    sections.append(f"[ANIMALS] Today: {today}. Total active animals: {len(animals)}")
    for a in animals:
        dob = a.get("date_of_birth")
        age_str = ""
        if dob:
            try:
                from datetime import datetime
                age_days = (datetime.fromisoformat(today) - datetime.fromisoformat(dob)).days
                age_months = age_days // 30
                age_str = f", age ~{age_months}mo"
            except Exception:
                pass
        line = (
            f"  {a['name']} ({a['tag_id']}) | {a['species']} {a.get('breed','?')} "
            f"| {a['sex']}{age_str} | weight: {a.get('weight_kg','?')}kg "
            f"| health: {a['health_status']} risk:{a['health_risk_score']} "
            f"| vacc: {a['vaccination_status']} | breeding: {a['breeding_status']}"
        )
        if a.get("expected_kidding_date"):
            line += f" | kidding: {a['expected_kidding_date']}"
        if a.get("current_temperature"):
            line += f" | temp:{a['current_temperature']}°C hr:{a.get('current_heart_rate','?')}bpm"
        sections.append(line)

    # ── Health ────────────────────────────────────────────────────────────────
    if any(k in q for k in ["health", "sick", "risk", "ill", "disease", "condition",
                              "anomal", "temperature", "fever", "symptom", "kalusugan",
                              "may sakit", "lagnat", "suriin", "check"]):
        records = get_health_records(user_id, 20)
        sections.append(f"\n[HEALTH RECORDS] Last {len(records)} records:")
        for r in records:
            aname = nm.get(r["animal_id"], r["animal_id"][:8])
            cond = r.get("detected_conditions") or ""
            sections.append(
                f"  {aname} | {r['record_date']} | risk:{r['risk_level']}({r['risk_score']}) "
                f"| temp:{r.get('temperature','?')}°C hr:{r.get('heart_rate','?')} "
                f"| famacha:{r.get('famacha_score','?')} bloat:{r.get('bloat_score','?')} "
                f"| cough:{r.get('cough')} diarrhea:{r.get('diarrhea')}"
                + (f" | DETECTED: {cond}" if cond else "")
            )

    # ── Vaccination ───────────────────────────────────────────────────────────
    if any(k in q for k in ["vaccin", "bakun", "overdue", "shot", "immuniz", "due soon"]):
        vaccs = get_vaccinations(user_id)
        overdue = [v for v in vaccs if v["status"] == "Overdue"]
        due_soon = [v for v in vaccs if v["status"] == "Due Soon"]
        sections.append(f"\n[VACCINATIONS] {len(overdue)} overdue, {len(due_soon)} due soon:")
        for v in (overdue + due_soon)[:20]:
            aname = nm.get(v["animal_id"], v["animal_id"][:8])
            sections.append(
                f"  {aname} | {v['vaccine_name']} | given:{v['date_given']} "
                f"| next:{v.get('next_due_date','?')} | STATUS:{v['status']}"
            )

    # ── Breeding ──────────────────────────────────────────────────────────────
    if any(k in q for k in ["breed", "pregnant", "kidding", "mating", "buntis",
                              "birth", "offspring", "gestation"]):
        records = get_breeding_records(user_id)
        sections.append(f"\n[BREEDING] {len(records)} breeding records:")
        for r in records[:15]:
            aname = nm.get(r["animal_id"], r["animal_id"][:8])
            sections.append(
                f"  {aname} | {r['status']} | mated:{r['mating_date']} "
                f"| expected kidding:{r.get('expected_kidding_date','?')} "
                f"| actual:{r.get('actual_kidding_date','none')} offspring:{r.get('offspring_count','?')}"
            )

    # ── Weight ────────────────────────────────────────────────────────────────
    if any(k in q for k in ["weight", "grow", "gain", "timbang", "market", "heavy", "light"]):
        records = get_weight_records(user_id, 30)
        sections.append(f"\n[WEIGHT RECORDS] Last {len(records)} records:")
        for r in records[:20]:
            aname = nm.get(r["animal_id"], r["animal_id"][:8])
            gain = r.get("daily_gain_kg")
            sections.append(
                f"  {aname} | {r['record_date']} | {r['weight_kg']}kg"
                + (f" | daily gain:{gain}kg/day" if gain else "")
            )

    # ── Inventory ─────────────────────────────────────────────────────────────
    if any(k in q for k in ["inventory", "stock", "supply", "medicine", "expired",
                              "imbentaryo", "gamot", "kulang", "out of"]):
        items = get_inventory(user_id)
        sections.append(f"\n[INVENTORY] {len(items)} items:")
        for i in items:
            flags = []
            if i["low_stock"]:
                flags.append("LOW_STOCK")
            if i["expired"]:
                flags.append("EXPIRED")
            sections.append(
                f"  {i['name']} | {i['category']} | qty:{i['quantity']}{i['unit']} "
                f"min:{i['minimum_stock']} | expiry:{i.get('expiry_date','none')}"
                + (f" | ⚠️ {','.join(flags)}" if flags else "")
            )

    # ── Feed ──────────────────────────────────────────────────────────────────
    if any(k in q for k in ["feed", "fodder", "pagkain", "kain", "cost", "gastos", "fcr"]):
        records = get_feed_records(user_id, 30)
        total_cost = sum(float(r.get("cost") or 0) for r in records)
        sections.append(f"\n[FEED RECORDS] {len(records)} records, total cost: ₱{total_cost:.2f}:")
        for r in records[:15]:
            aname = nm.get(r["animal_id"], r["animal_id"][:8])
            sections.append(
                f"  {aname} | {r['record_date']} | {r['feed_type']} "
                f"| {r['quantity_kg']}kg | cost:₱{r.get('cost',0)}"
            )

    # ── Milk ──────────────────────────────────────────────────────────────────
    if any(k in q for k in ["milk", "gatas", "yield", "dairy", "litro"]):
        records = get_milk_records(user_id, 30)
        total = sum(float(r.get("yield_litres") or 0) for r in records)
        sections.append(f"\n[MILK RECORDS] {len(records)} records, total: {total:.2f}L:")
        for r in records[:15]:
            aname = nm.get(r["animal_id"], r["animal_id"][:8])
            sections.append(f"  {aname} | {r['record_date']} | {r['yield_litres']}L")

    # ── Settings ──────────────────────────────────────────────────────────────
    if any(k in q for k in ["farm", "setting", "target", "threshold", "name"]):
        s = get_settings(user_id)
        if s:
            sections.append(
                f"\n[FARM SETTINGS] Farm: {s.get('farm_name','?')} | "
                f"target weight:{s.get('target_weight_kg')}kg | "
                f"gestation:{s.get('gestation_days')}days | "
                f"temp critical:{s.get('temp_critical')}°C"
            )

    # ── Camera Screenings ─────────────────────────────────────────────────────
    if any(k in q for k in ["camera", "screen", "photo", "image", "visual", "picture",
                              "larawan", "litrato", "screening", "concern"]):
        screenings = get_camera_screenings(user_id, 15)
        concerns = [s for s in screenings if s.get("prediction") == "possible_health_concern"]
        sections.append(
            f"\n[CAMERA SCREENINGS] {len(screenings)} total, {len(concerns)} possible concerns:"
        )
        sections.append(
            "⚠️ IMPORTANT: Camera screenings are PRELIMINARY ML assessments only, NOT veterinary diagnoses."
        )
        for s in screenings[:15]:
            aname = nm.get(s["animal_id"], s["animal_id"][:8])
            pred = s.get("prediction", "unknown")
            label = (
                "Possible Health Concern" if pred == "possible_health_concern"
                else "Normal Appearance" if pred == "normal_appearance"
                else "Low Confidence"
            )
            conf = round(float(s.get("confidence", 0)) * 100)
            sections.append(
                f"  {aname} | {s.get('created_at','?')[:10]} | {label} | "
                f"confidence:{conf}% | model:{s.get('model_version','?')} | "
                f"quality:{s.get('quality_score','?')}/100"
            )

    return "\n".join(sections)
