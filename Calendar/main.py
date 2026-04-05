from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import FindSlotsRequest, CreateEventRequest, EventResponse
from calendar_client import find_free_slots, create_event
from googleapiclient.errors import HttpError
import logging
import json
import os
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Calendar Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ACTIVITY_LOG_FILE = "activity_log.json"

def load_activity_log():
    if not os.path.exists(ACTIVITY_LOG_FILE):
        return []
    with open(ACTIVITY_LOG_FILE, "r") as f:
        content = f.read().strip()
        if not content:
            return []
        return json.loads(content)

def log_activity(action: str, detail: str = "", status: str = "success"):
    logs = load_activity_log()
    logs.append({
        "action": action,
        "detail": detail,
        "status": status,
        "timestamp": datetime.now().strftime("%d %b %Y, %I:%M %p")
    })
    with open(ACTIVITY_LOG_FILE, "w") as f:
        json.dump(logs, f)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stats")
def get_stats():
    logs = load_activity_log()

    emails_processed = 0
    meetings_scheduled = 0
    updates_summarized = 0
    errors = 0

    for entry in logs:
        action = entry.get("action", "").lower()
        status = entry.get("status", "")
        if "email received" in action:
            emails_processed += 1
        if "meeting scheduled" in action:
            meetings_scheduled += 1
        if "summarized" in action:
            updates_summarized += 1
        if status == "error":
            errors += 1

    recent = logs[-20:][::-1]
    recent_activity = [
        {
            "action": e.get("action", "Agent action"),
            "detail": e.get("detail", ""),
            "status": e.get("status", "info"),
            "time": e.get("timestamp", "")
        }
        for e in recent
    ]

    return {
        "emails_processed": emails_processed,
        "meetings_scheduled": meetings_scheduled,
        "updates_summarized": updates_summarized,
        "errors": errors,
        "recent_activity": recent_activity
    }

@app.post("/log")
def receive_log(entry: dict):
    log_activity(
        action=entry.get("action", ""),
        detail=entry.get("detail", ""),
        status=entry.get("status", "info")
    )
    return {"status": "ok"}

@app.post("/calendar/find-slots")
def find_slots(req: FindSlotsRequest):
    try:
        slots = find_free_slots(
            attendee_emails=req.attendee_emails,
            time_min=req.time_min,
            time_max=req.time_max,
            duration_minutes=req.duration_minutes,
            max_slots=req.max_slots,
        )
        return {"available_slots": slots, "count": len(slots)}
    except HttpError as e:
        log_activity("find-slots error", str(e.reason), "error")
        raise HTTPException(status_code=502, detail=f"Google Calendar error: {e.reason}")
    except Exception as e:
        log_activity("find-slots error", str(e), "error")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/calendar/create-event", response_model=EventResponse)
def create_calendar_event(req: CreateEventRequest):
    try:
        result = create_event(
            summary=req.summary,
            start_dt=req.start_dt,
            end_dt=req.end_dt,
            attendee_emails=req.attendee_emails,
            description=req.description or "",
            timezone_str=req.timezone_str or "UTC",
            send_updates=req.send_updates or "all",
        )
        if result.get("status") == "created":
            log_activity("Meeting scheduled", f"{req.summary} with {', '.join(req.attendee_emails)}", "success")
        elif result.get("status") == "duplicate":
            log_activity("Duplicate meeting blocked", req.summary, "info")
        return result
    except HttpError as e:
        log_activity("create-event error", str(e.reason), "error")
        raise HTTPException(status_code=502, detail=f"Google Calendar error: {e.reason}")
    except Exception as e:
        log_activity("create-event error", str(e), "error")
        raise HTTPException(status_code=500, detail=str(e))