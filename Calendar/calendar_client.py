import os
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Optional
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from auth import get_credentials

CALENDAR_ID = os.getenv("CALENDAR_ID", "primary")

def get_service():
    creds = get_credentials()
    return build("calendar", "v3", credentials=creds)

def get_busy_slots(attendee_emails, time_min, time_max):
    service = get_service()
    body = {
        "timeMin": time_min.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timeMax": time_max.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timeZone": "UTC",
        "items": [{"id": email} for email in attendee_emails],
    }
    result = service.freebusy().query(body=body).execute()
    calendars = result.get("calendars", {})
    return {email: calendars.get(email, {}).get("busy", []) for email in attendee_emails}

def find_free_slots(attendee_emails, time_min, time_max, duration_minutes=60, max_slots=5):
    busy_map = get_busy_slots(attendee_emails, time_min, time_max)
    all_busy = []
    for busy_list in busy_map.values():
        for slot in busy_list:
            start = datetime.fromisoformat(slot["start"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(slot["end"].replace("Z", "+00:00"))
            all_busy.append((start, end))
    all_busy.sort(key=lambda x: x[0])

    free_slots = []
    cursor = time_min.astimezone(timezone.utc)
    window_end = time_max.astimezone(timezone.utc)
    duration = timedelta(minutes=duration_minutes)

    for busy_start, busy_end in all_busy:
        if cursor + duration <= busy_start:
            free_slots.append({"start": cursor.isoformat(), "end": (cursor + duration).isoformat()})
            if len(free_slots) >= max_slots:
                break
        if busy_end > cursor:
            cursor = busy_end

    if len(free_slots) < max_slots and cursor + duration <= window_end:
        free_slots.append({"start": cursor.isoformat(), "end": (cursor + duration).isoformat()})

    return free_slots[:max_slots]

def _make_idempotency_key(summary, start_iso, attendee_emails):
    raw = f"{summary.strip().lower()}|{start_iso}|{'|'.join(sorted(attendee_emails))}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

def find_duplicate_event(summary, start_dt, attendee_emails, lookahead_minutes=60):
    service = get_service()
    
    window_start = (start_dt - timedelta(minutes=lookahead_minutes)).astimezone(timezone.utc)
    window_end = (start_dt + timedelta(minutes=lookahead_minutes)).astimezone(timezone.utc)

    events_result = service.events().list(
        calendarId=CALENDAR_ID,
        timeMin=window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        timeMax=window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    for event in events_result.get("items", []):
        # Check time overlap only — ignore title
        event_start = event.get("start", {}).get("dateTime", "")
        if not event_start:
            continue
        event_start_dt = datetime.fromisoformat(event_start.replace("Z", "+00:00"))
        diff = abs((event_start_dt - start_dt.astimezone(timezone.utc)).total_seconds())
        if diff < lookahead_minutes * 60:
            return event["id"]

    return None
def create_event(summary, start_dt, end_dt, attendee_emails, description="", timezone_str="UTC", send_updates="all"):
    service = get_service()

    existing_id = find_duplicate_event(summary, start_dt, attendee_emails)
    if existing_id:
        existing_event = service.events().get(calendarId=CALENDAR_ID, eventId=existing_id).execute()
        start = existing_event.get("start", {}).get("dateTime", "")
        return {
            "status": "duplicate",
            "event_id": existing_id,
            "html_link": existing_event.get("htmlLink"),
            "start": start,
            "message": "Event already exists — skipped creation.",
        }

    ai_disclaimer = (
        "\n\n---\n"
        "⚠️ This meeting invite was created by an AI email assistant. "
        "If you have questions or believe this was sent in error, "
        "please reply to the original email thread."
    )

    event_body = {
        "summary": summary,
        "description": (description + ai_disclaimer).strip(),
        "start": {"dateTime": start_dt.isoformat(), "timeZone": timezone_str},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": timezone_str},
        "attendees": [{"email": email} for email in attendee_emails],
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 24 * 60},
                {"method": "popup", "minutes": 10},
            ],
        },
        "extendedProperties": {
            "private": {
                "aiAssistantKey": _make_idempotency_key(summary, start_dt.isoformat(), attendee_emails)
            }
        },
    }

    created_event = service.events().insert(
        calendarId=CALENDAR_ID,
        body=event_body,
        sendUpdates=send_updates,
    ).execute()

    return {
        "status": "created",
        "event_id": created_event["id"],
        "html_link": created_event.get("htmlLink"),
        "message": f"Event created. Invites sent to {len(attendee_emails)} attendees.",
    }